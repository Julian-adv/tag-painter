<!-- Generic TreeView component for hierarchical data with drag and drop -->
<script lang="ts">
  import type { Component } from 'svelte'
  import type { CustomTag } from './types'
  import { getTagClasses } from './utils/tagStyling'
  import { buildTreeNodes, type TreeNode } from './utils/treeBuilder'
  import { onMount, onDestroy, tick } from 'svelte'

  interface Props {
    // Tree data as key-value pairs with parent-child relationships
    items: Record<string, CustomTag>
    // Function to get display text for an item
    getDisplayText: (item: CustomTag) => string
    // External collapsed nodes state (for persistence across component recreation)
    collapsedNodes: Set<string>
    // Callback when collapse state changes
    onToggleCollapsed: (itemId: string, collapsed: boolean) => void
    // Currently selected item ID
    selectedId?: string
    // Callback when an item is selected
    onSelect?: (itemId: string) => void
    // Callback when items are reordered
    onReorder?: (draggedId: string, newIndex: number, parentId?: string) => void
    // Callback when an item becomes a child of another
    onMakeChild?: (childId: string, parentId: string) => void
    // Function to determine if an item has special indicators
    getIndicators?: (item: CustomTag) => { icon?: unknown; classes?: string }[]
    // Custom styling for tree levels
    levelIndent?: number
    // Empty state content
    empty?: import('svelte').Snippet
  }

  let {
    items = {},
    getDisplayText,
    collapsedNodes,
    onToggleCollapsed,
    selectedId = '',
    onSelect,
    onReorder,
    onMakeChild,
    getIndicators,
    levelIndent = 20,
    empty
  }: Props = $props()

  // Drag & drop state
  let draggedItemId = $state<string | null>(null)
  let draggedItemParent = $state<string | null>(null)
  let dropPosition = $state<number | null>(null)
  let dropOnItem = $state<string | null>(null)
  let dragOverTarget = $state<'reorder' | 'make-child' | null>(null)

  // Reference to the container (used for both scrolling and SVG)
  let container = $state<HTMLElement>()
  let nodeBindings: Record<string, HTMLElement | null> = $state({})

  // SVG edge data
  let edges = $state<Array<{ from: string; to: string; path: string }>>([])
  let svgWidth = $state(0)
  let svgHeight = $state(0)

  // Build hierarchical tree structure
  const treeNodes = $derived.by(() => {
    return buildTreeNodes(items, collapsedNodes)
  })

  // Collect visible edges for SVG lines
  function collectEdges() {
    const edgeList: Array<{ from: string; to: string; path: string }> = []
    for (const node of treeNodes) {
      // Don't draw edges to/from root type tags
      if (node.parentId && node.data.type !== 'root') {
        const parentItem = items[node.parentId]
        if (parentItem && parentItem.type !== 'root') {
          edgeList.push({ from: node.parentId, to: node.id, path: '' })
        }
      }
    }
    return edgeList
  }

  function getPorts(parentId: string, childId: string) {
    if (!container) return null

    const cr = container.getBoundingClientRect()
    const p = nodeBindings[parentId]?.getBoundingClientRect()
    const c = nodeBindings[childId]?.getBoundingClientRect()

    if (!p || !c) return null

    const px = p.left - cr.left + 8
    const py = p.bottom - cr.top
    const cx = c.left - cr.left
    const cy = c.top - cr.top + c.height / 2

    return { px, py, cx, cy }
  }

  function toElbow({ px, py, cx, cy }: { px: number; py: number; cx: number; cy: number }) {
    const midY = cy
    return `M ${px} ${py} V ${midY} H ${cx}`
  }

  async function recomputeEdges() {
    if (!container) return

    edges = collectEdges()
    await tick()

    // Update container size - use scrollHeight for full content height
    const rect = container.getBoundingClientRect()
    svgWidth = rect.width
    svgHeight = container.scrollHeight

    // Calculate paths
    edges = edges.map((e) => {
      const ports = getPorts(e.from, e.to)
      if (!ports) return e
      return { ...e, path: toElbow(ports) }
    })
  }

  let resizeObserver: ResizeObserver | undefined
  function handleResize() {
    recomputeEdges()
  }

  onMount(() => {
    recomputeEdges()
    if (container) {
      resizeObserver = new ResizeObserver(handleResize)
      resizeObserver.observe(container)
    }
    window.addEventListener('resize', handleResize, { passive: true })
  })

  // Use $effect to watch for treeNodes changes and update nodeEls
  $effect(() => {
    // Initialize node bindings for new nodes
    treeNodes.forEach((node) => {
      if (!(node.id in nodeBindings)) {
        nodeBindings[node.id] = null
      }
    })
  })

  onDestroy(() => {
    resizeObserver?.disconnect()
    window.removeEventListener('resize', handleResize)
  })

  function handleItemClick(itemId: string) {
    onSelect?.(itemId)
  }

  function toggleNode(nodeId: string) {
    // Prevent root type tags from being collapsed
    const item = items[nodeId]
    if (item?.type === 'root') {
      return // Don't allow root tags to be collapsed
    }

    const currentCollapsed = collapsedNodes.has(nodeId)
    onToggleCollapsed(nodeId, !currentCollapsed)

    // Update SVG edges after toggling
    setTimeout(() => recomputeEdges(), 0)
  }

  function handleDragStart(event: DragEvent, itemId: string) {
    draggedItemId = itemId

    // Use precomputed parentId from tree node
    const draggedNode = treeNodes.find((node) => node.id === itemId)
    draggedItemParent = draggedNode?.parentId ?? null

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', itemId)
    }
  }

  function handleDragEnd() {
    draggedItemId = null
    draggedItemParent = null
    dropPosition = null
    dropOnItem = null
    dragOverTarget = null
  }

  function handleDragEnter(event: DragEvent) {
    event.preventDefault()
    event.stopPropagation()
  }

  function handleDragOver(event: DragEvent, index: number, itemId?: string) {
    event.preventDefault()
    event.stopPropagation() // Prevent bubbling

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }

    // Prevent making an item a child of itself or creating circular dependencies
    if (itemId && draggedItemId === itemId) {
      dropOnItem = null
      dropPosition = null
      dragOverTarget = null
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'none'
      }
      return
    }

    // Determine if this is a parent-child drop or reorder drop
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const y = event.clientY - rect.top
    const height = rect.height

    // Check for circular dependencies (prevent making a parent a child of its descendant)
    const isMiddleArea = itemId && y > height * 0.25 && y < height * 0.75
    if (
      itemId &&
      draggedItemId &&
      isMiddleArea &&
      wouldCreateCircularDependency(draggedItemId, itemId)
    ) {
      dropOnItem = null
      dropPosition = null
      dragOverTarget = null
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'none'
      }
      return
    }

    // Calculate new state
    const newDropOnItem = isMiddleArea ? itemId : null
    const newDropPosition = isMiddleArea ? null : y < height * 0.5 ? index : index + 1
    const newDragOverTarget = isMiddleArea ? 'make-child' : 'reorder'

    // Only update state if something actually changed
    const stateChanged =
      dropOnItem !== newDropOnItem ||
      dropPosition !== newDropPosition ||
      dragOverTarget !== newDragOverTarget

    if (stateChanged) {
      dropOnItem = newDropOnItem
      dropPosition = newDropPosition
      dragOverTarget = newDragOverTarget
    }

    // Set drop effect based on whether we can actually drop here
    if (event.dataTransfer) {
      const canDrop =
        (newDragOverTarget === 'make-child' &&
          newDropOnItem &&
          draggedItemId &&
          !wouldCreateCircularDependency(draggedItemId, newDropOnItem) &&
          draggedItemId !== newDropOnItem) ||
        newDragOverTarget === 'reorder'

      event.dataTransfer.dropEffect = canDrop ? 'move' : 'none'
    }
  }

  function wouldCreateCircularDependency(draggedId: string, targetId: string): boolean {
    // Since we're using tags array instead of separate hierarchy,
    // we need to check if targetId already contains draggedId in its tags
    const targetItem = items[targetId]
    if (!targetItem) return false

    // Simple check: if target's tags already contain the dragged item, it would create a cycle
    return targetItem.tags.includes(draggedId)
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    event.stopPropagation()

    if (!draggedItemId) return

    if (dragOverTarget === 'make-child' && dropOnItem) {
      // Double-check for circular dependencies before making child
      if (
        !wouldCreateCircularDependency(draggedItemId, dropOnItem) &&
        draggedItemId !== dropOnItem
      ) {
        // Call the callback to handle the relationship
        onMakeChild?.(draggedItemId, dropOnItem)
      }
    } else if (dragOverTarget === 'reorder' && dropPosition !== null) {
      // For combined tag nodes (like "parent_combined_tags"), use the parent ID
      let actualTagName = draggedItemId
      if (draggedItemId.endsWith('_combined_tags')) {
        actualTagName = draggedItemId.replace('_combined_tags', '')
      } else if (draggedItemId.includes('_tag_')) {
        // For individual tag nodes (like "parent_tag_tagname"), use the parent ID
        actualTagName = draggedItemId.split('_tag_')[0]
      } else {
        // For regular custom tag nodes, use the node ID directly
        actualTagName = draggedItemId
      }

      // Calculate relative position within siblings if there's a parent
      let relativeDropPosition = dropPosition
      if (draggedItemParent) {
        // Find all siblings (nodes with same parent)
        const siblings = treeNodes.filter((node) => node.parentId === draggedItemParent)
        const siblingIds = siblings.map((s) => s.id)

        // Find the dragged item's position in siblings array
        const draggedSiblingIndex = siblingIds.indexOf(draggedItemId)

        // Convert global dropPosition to sibling-relative position
        let targetSiblingIndex = 0
        for (let i = 0; i < dropPosition; i++) {
          if (i < treeNodes.length && siblingIds.includes(treeNodes[i].id)) {
            targetSiblingIndex++
          }
        }

        // Adjust for removed element
        if (draggedSiblingIndex < targetSiblingIndex) {
          targetSiblingIndex--
        }

        relativeDropPosition = targetSiblingIndex
      }

      // Reorder items
      onReorder?.(actualTagName, relativeDropPosition, draggedItemParent || undefined)
    }

    handleDragEnd()
  }

  function getItemDisplayClasses(node: TreeNode) {
    return getTagClasses({
      tag: node.data,
      selected: selectedId === node.id,
      dragged: draggedItemId === node.id,
      additionalClasses: 'cursor-move p-1.5'
    })
  }

  // Public method to scroll to a specific item
  function scrollToItem(itemId: string) {
    setTimeout(() => {
      if (container) {
        const itemButton = container.querySelector(
          `button[data-item-id="${itemId}"]`
        ) as HTMLElement
        if (itemButton) {
          itemButton.scrollIntoView({
            behavior: 'instant',
            block: 'center'
          })
        }
      }
    }, 50)
  }

  // Collapse all nodes (exposed for external use)
  function collapseAll() {
    Object.keys(items).forEach((itemId) => {
      const item = items[itemId]
      if (item && item.tags && item.tags.length > 0 && item.type !== 'root') {
        // Only collapse if not already collapsed and not a root type
        if (!collapsedNodes.has(itemId)) {
          onToggleCollapsed(itemId, true)
        }
      }
    })
    // Recompute edges after collapsing all nodes
    setTimeout(() => recomputeEdges(), 50)
  }

  // Expand all nodes (exposed for external use)
  function expandAll() {
    Object.keys(items).forEach((itemId) => {
      const item = items[itemId]
      if (item && item.tags && item.tags.length > 0) {
        // Only expand if currently collapsed
        if (collapsedNodes.has(itemId)) {
          onToggleCollapsed(itemId, false)
        }
      }
    })
    // Recompute edges after expanding all nodes
    setTimeout(() => recomputeEdges(), 50)
  }

  // Export the public methods for parent component access
  export { scrollToItem, collapseAll, expandAll }
</script>

<div
  class="relative flex flex-1 flex-col space-y-1 overflow-x-hidden overflow-y-auto pr-2"
  role="list"
  bind:this={container}
>
  <!-- Single overlay SVG for all tree connections -->
  <svg
    class="pointer-events-none absolute inset-0 z-0"
    width={svgWidth}
    height={svgHeight}
    aria-hidden="true"
  >
    {#each edges as edge (`${edge.from}-${edge.to}`)}
      {#if edge.path}
        <path d={edge.path} fill="none" stroke="#9ca3af" stroke-width="1" />
      {/if}
    {/each}
  </svg>
  {#each treeNodes as node, index (node.id)}
    <div
      class="relative flex justify-start"
      class:hidden={node.data.type === 'root'}
      role="listitem"
      ondragenter={handleDragEnter}
      ondragover={(e) => handleDragOver(e, index, node.id)}
      ondrop={handleDrop}
    >
      <!-- Drop indicator before this item -->
      {#if dropPosition === index && draggedItemId !== null && dragOverTarget === 'reorder'}
        <div class="absolute -top-0.5 left-0 z-10 h-0.5 w-full animate-pulse bg-blue-500"></div>
      {/if}

      <!-- Drop indicator for making child -->
      {#if dropOnItem === node.id && draggedItemId !== null && dragOverTarget === 'make-child'}
        <div
          class="absolute inset-0 z-10 rounded border-2 border-dashed border-green-500 bg-green-200 transition-opacity duration-100"
          style="animation: pulse 1s infinite;"
        ></div>
      {/if}

      <div
        class="flex min-w-0 items-center"
        style="margin-left: {(node.level - 1) * levelIndent}px;"
      >
        <button
          type="button"
          draggable="true"
          class="min-w-0 flex-1 text-left {getItemDisplayClasses(node)} relative z-10"
          data-item-id={node.id}
          onclick={() => handleItemClick(node.id)}
          ondragstart={(e) => handleDragStart(e, node.id)}
          ondragend={handleDragEnd}
          aria-label="Drag to reorder or make child: {getDisplayText(node.data)}"
          bind:this={nodeBindings[node.id]}
        >
          <div class="flex w-full items-center">
            <div class="flex min-w-0 flex-1 items-center gap-1">
              <!-- Expand/Collapse toggle icon inside tag button (hidden for root type) -->
              {#if node.hasChildren && node.data.type !== 'root'}
                <div
                  class="flex h-4 w-4 flex-shrink-0 cursor-pointer items-center justify-center text-gray-400 hover:text-gray-600"
                  onclick={(e) => {
                    e.stopPropagation()
                    toggleNode(node.id)
                  }}
                  onkeydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      e.stopPropagation()
                      toggleNode(node.id)
                    }
                  }}
                  role="button"
                  tabindex="0"
                  aria-label={node.collapsed ? 'Expand' : 'Collapse'}
                >
                  <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {#if node.collapsed}
                      <!-- Right arrow (collapsed) -->
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 5l7 7-7 7"
                      ></path>
                    {:else}
                      <!-- Down arrow (expanded) -->
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 9l-7 7-7-7"
                      ></path>
                    {/if}
                  </svg>
                </div>
              {:else}
                <div class="h-4 w-4 flex-shrink-0"></div>
              {/if}
              <span class="truncate">{getDisplayText(node.data)}</span>
            </div>

            {#if getIndicators}
              <div class="ml-auto flex items-center gap-1">
                {#each getIndicators(node.data) as indicator, idx (idx)}
                  {#if indicator.icon}
                    {@const IconComponent = indicator.icon as Component}
                    <IconComponent class="h-4 w-4 flex-shrink-0 {indicator.classes || ''}" />
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
        </button>
      </div>

      <!-- Drop indicator after this item (for last position) -->
      {#if dropPosition === index + 1 && draggedItemId !== null && dragOverTarget === 'reorder'}
        <div class="absolute -bottom-0.5 left-0 z-10 h-0.5 w-full animate-pulse bg-blue-500"></div>
      {/if}
    </div>
  {/each}

  {#if Object.keys(items).length === 0}
    {#if empty}
      {@render empty()}
    {:else}
      <p class="text-sm text-gray-400 italic">No custom tags available</p>
    {/if}
  {/if}
</div>

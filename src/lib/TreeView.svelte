<!-- Generic TreeView component for hierarchical data with drag and drop -->
<script lang="ts">
  import type { Component } from 'svelte'
  import type { CustomTag } from './types'
  import { getTagClasses } from './utils/tagStyling'
  import { onMount, onDestroy, tick } from 'svelte'

  interface TreeNode {
    id: string
    level: number
    data: CustomTag
  }

  interface Props {
    // Tree data as key-value pairs with parent-child relationships
    items: Record<string, CustomTag>
    // Function to get display text for an item
    getDisplayText: (item: CustomTag) => string
    // Currently selected item ID
    selectedId?: string
    // Callback when an item is selected
    onSelect?: (itemId: string) => void
    // Callback when items are reordered
    onReorder?: (draggedId: string, newIndex: number) => void
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
  let dropPosition = $state<number | null>(null)
  let dropOnItem = $state<string | null>(null)
  let dragOverTarget = $state<'reorder' | 'make-child' | null>(null)
  let dragLeaveTimeout: ReturnType<typeof setTimeout> | null = null

  // Reference to the container (used for both scrolling and SVG)
  let container = $state<HTMLElement>()
  const nodeEls = new Map<string, HTMLElement>()
  let nodeBindings: Record<string, HTMLElement | null> = $state({})

  // SVG edge data
  let edges = $state<Array<{ from: string; to: string; path: string }>>([])
  let svgWidth = $state(0)
  let svgHeight = $state(0)

  // Build hierarchical tree structure
  const treeNodes = $derived.by(() => {
    const nodes: TreeNode[] = []
    const processed = new Set<string>()

    // Function to add item and its children recursively
    function addToTree(itemId: string, level: number = 0) {
      if (processed.has(itemId) || !items[itemId]) return

      processed.add(itemId)
      const customTag = items[itemId]
      nodes.push({ id: itemId, level, data: customTag })

      // Add CustomTag children (parentId/children relationship)
      if (customTag.children) {
        customTag.children.forEach((childId: string) => {
          addToTree(childId, level + 1)
        })
      }

      // Add tags as children (tag content)
      if (customTag.tags && customTag.tags.length > 0) {
        if (customTag.type === 'sequential' || customTag.type === 'regular') {
          // For sequential and regular types, combine all tags into one node
          const combinedTags = customTag.tags.join(', ')
          const tagNodeId = `${itemId}_combined_tags`
          nodes.push({ 
            id: tagNodeId, 
            level: level + 1, 
            data: { name: combinedTags, tags: [], type: 'regular' } as CustomTag 
          })
        } else {
          // For random and consistent-random types, show each tag separately
          customTag.tags.forEach((tag: string) => {
            // If the tag exists as a CustomTag in items, add it recursively
            if (items[tag]) {
              addToTree(tag, level + 1)
            } else {
              // If it's just a regular tag string, add it as a leaf node
              const tagNodeId = `${itemId}_tag_${tag}`
              nodes.push({ 
                id: tagNodeId, 
                level: level + 1, 
                data: { name: tag, tags: [], type: 'regular' } as CustomTag 
              })
            }
          })
        }
      }
    }

    // First, add all root items (items without parent)
    Object.keys(items).forEach((itemId) => {
      const item = items[itemId]
      if (item && !item.parentId) {
        addToTree(itemId)
      }
    })

    // Then add any orphaned items (in case of data inconsistency)
    Object.keys(items).forEach((itemId) => {
      if (!processed.has(itemId)) {
        addToTree(itemId)
      }
    })

    return nodes
  })

  // Collect visible edges for SVG lines
  function collectEdges() {
    const edgeList: Array<{ from: string; to: string; path: string }> = []
    
    for (let i = 0; i < treeNodes.length; i++) {
      const node = treeNodes[i]
      if (node.level === 0) continue // Skip root nodes
      
      // Find parent node
      let parentNode = null
      for (let j = i - 1; j >= 0; j--) {
        if (treeNodes[j].level === node.level - 1) {
          parentNode = treeNodes[j]
          break
        }
      }
      
      if (parentNode) {
        edgeList.push({
          from: parentNode.id,
          to: node.id,
          path: ''
        })
      }
    }
    
    return edgeList
  }

  function getPorts(parentId: string, childId: string) {
    if (!container) return null
    
    const cr = container.getBoundingClientRect()
    const p = nodeEls.get(parentId)?.getBoundingClientRect()
    const c = nodeEls.get(childId)?.getBoundingClientRect()
    
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
    
    // Update container size
    const rect = container.getBoundingClientRect()
    svgWidth = rect.width
    svgHeight = rect.height
    
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
    treeNodes.forEach(node => {
      if (!(node.id in nodeBindings)) {
        nodeBindings[node.id] = null
      }
    })
  })

  $effect(() => {
    // Update nodeEls map when bindings change
    Object.entries(nodeBindings).forEach(([id, el]) => {
      if (el) {
        nodeEls.set(id, el)
      }
    })
    recomputeEdges()
  })
  
  onDestroy(() => {
    resizeObserver?.disconnect()
    window.removeEventListener('resize', handleResize)
  })

  function handleItemClick(itemId: string) {
    onSelect?.(itemId)
  }

  function handleDragStart(event: DragEvent, itemId: string) {
    draggedItemId = itemId
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', itemId)
    }
  }

  function handleDragEnd() {
    // Clear any pending timeout
    if (dragLeaveTimeout) {
      clearTimeout(dragLeaveTimeout)
      dragLeaveTimeout = null
    }

    draggedItemId = null
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

    // Clear any pending dragLeave timeout
    if (dragLeaveTimeout) {
      clearTimeout(dragLeaveTimeout)
      dragLeaveTimeout = null
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
    // Check if targetId is a descendant of draggedId
    const draggedItem = items[draggedId] as { children?: string[] }
    if (!draggedItem || !draggedItem.children) return false

    function isDescendant(itemId: string, ancestorId: string): boolean {
      if (itemId === ancestorId) return true

      const item = items[itemId] as { children?: string[] }
      if (!item || !item.children) return false

      return item.children.some((childId: string) => isDescendant(childId, ancestorId))
    }

    return isDescendant(draggedId, targetId)
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    event.stopPropagation()

    // Clear any pending timeout
    if (dragLeaveTimeout) {
      clearTimeout(dragLeaveTimeout)
      dragLeaveTimeout = null
    }

    if (!draggedItemId) return

    if (dragOverTarget === 'make-child' && dropOnItem) {
      // Double-check for circular dependencies before making child
      if (
        !wouldCreateCircularDependency(draggedItemId, dropOnItem) &&
        draggedItemId !== dropOnItem
      ) {
        onMakeChild?.(draggedItemId, dropOnItem)
      }
    } else if (dragOverTarget === 'reorder' && dropPosition !== null) {
      // Reorder items
      onReorder?.(draggedItemId, dropPosition)
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

  // Export the public method for parent component access
  export { scrollToItem }
</script>

<div class="flex-1 overflow-y-auto overflow-x-hidden space-y-1 flex flex-col pr-2 relative" role="list" bind:this={container}>
    <!-- Single overlay SVG for all tree connections -->
    <svg 
      class="absolute inset-0 pointer-events-none z-0" 
      width={svgWidth} 
      height={svgHeight}
      aria-hidden="true"
    >
      {#each edges as edge (`${edge.from}-${edge.to}`)}
        {#if edge.path}
          <path 
            d={edge.path} 
            fill="none" 
            stroke="#9ca3af" 
            stroke-width="1"
          />
        {/if}
      {/each}
    </svg>
  {#each treeNodes as node, index (node.id)}
    <div
      class="relative flex justify-start"
      role="listitem"
      ondragenter={handleDragEnter}
      ondragover={(e) => handleDragOver(e, index, node.id)}
      ondrop={handleDrop}
    >
      <!-- Drop indicator before this item -->
      {#if dropPosition === index && draggedItemId !== null && dragOverTarget === 'reorder'}
        <div class="absolute w-full h-0.5 bg-blue-500 z-10 -top-0.5 left-0 animate-pulse"></div>
      {/if}

      <!-- Drop indicator for making child -->
      {#if dropOnItem === node.id && draggedItemId !== null && dragOverTarget === 'make-child'}
        <div
          class="absolute inset-0 bg-green-200 border-2 border-green-500 border-dashed z-10 rounded transition-opacity duration-100"
          style="animation: pulse 1s infinite;"
        ></div>
      {/if}

      <div class="flex items-center min-w-0" style="margin-left: {node.level * levelIndent}px;">
        <button
          type="button"
          draggable="true"
          class="text-left flex-1 min-w-0 {getItemDisplayClasses(node)} relative z-10"
          data-item-id={node.id}
          onclick={() => handleItemClick(node.id)}
          ondragstart={(e) => handleDragStart(e, node.id)}
          ondragend={handleDragEnd}
          aria-label="Drag to reorder or make child: {getDisplayText(node.data)}"
          bind:this={nodeBindings[node.id]}
        >
          <div class="flex items-center w-full">
            <div class="flex items-center gap-1 flex-1 min-w-0">
              <span class="truncate">{getDisplayText(node.data)}</span>
            </div>

            {#if getIndicators}
              <div class="flex items-center gap-1 ml-auto">
                {#each getIndicators(node.data) as indicator, idx (idx)}
                  {#if indicator.icon}
                    {@const IconComponent = indicator.icon as Component}
                    <IconComponent class="w-4 h-4 flex-shrink-0 {indicator.classes || ''}" />
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
        </button>
      </div>

      <!-- Drop indicator after this item (for last position) -->
      {#if dropPosition === index + 1 && draggedItemId !== null && dragOverTarget === 'reorder'}
        <div class="absolute w-full h-0.5 bg-blue-500 z-10 -bottom-0.5 left-0 animate-pulse"></div>
      {/if}
    </div>
  {/each}

  {#if Object.keys(items).length === 0}
    {#if empty}
      {@render empty()}
    {:else}
      <p class="text-gray-400 text-sm italic">No custom tags available</p>
    {/if}
  {/if}
</div>

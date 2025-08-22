<!-- Generic TreeView component for hierarchical data with drag and drop -->
<script lang="ts">
  import type { Component } from 'svelte'

  interface TreeNode {
    id: string
    level: number
    data: unknown
  }

  interface Props {
    // Tree data as key-value pairs with parent-child relationships
    items: Record<string, unknown>
    // Function to get display text for an item
    getDisplayText: (item: unknown) => string
    // Function to get additional classes for an item
    getItemClasses?: (item: unknown, selected: boolean, dragged: boolean) => string
    // Currently selected item ID
    selectedId?: string
    // Callback when an item is selected
    onSelect?: (itemId: string) => void
    // Callback when items are reordered
    onReorder?: (draggedId: string, newIndex: number) => void
    // Callback when an item becomes a child of another
    onMakeChild?: (childId: string, parentId: string) => void
    // Function to determine if an item has special indicators
    getIndicators?: (item: unknown) => { icon?: unknown; classes?: string }[]
    // Custom styling for tree levels
    levelIndent?: number
    // Empty state content
    empty?: import('svelte').Snippet
  }

  let {
    items = {},
    getDisplayText,
    getItemClasses,
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

  // Build hierarchical tree structure
  const treeNodes = $derived.by(() => {
    const nodes: TreeNode[] = []
    const processed = new Set<string>()

    // Function to add item and its children recursively
    function addToTree(itemId: string, level: number = 0) {
      if (processed.has(itemId) || !items[itemId]) return

      processed.add(itemId)
      nodes.push({ id: itemId, level, data: items[itemId] })

      // Add children if they exist
      const item = items[itemId] as { children?: string[] }
      if (item && item.children) {
        item.children.forEach((childId: string) => {
          addToTree(childId, level + 1)
        })
      }
    }

    // First, add all root items (items without parent)
    Object.keys(items).forEach((itemId) => {
      const item = items[itemId] as { parentId?: string }
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
    const newDropPosition = isMiddleArea ? null : (y < height * 0.5 ? index : index + 1)
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
        (newDragOverTarget === 'make-child' && newDropOnItem && draggedItemId && !wouldCreateCircularDependency(draggedItemId, newDropOnItem) && draggedItemId !== newDropOnItem) ||
        (newDragOverTarget === 'reorder')
      
      event.dataTransfer.dropEffect = canDrop ? 'move' : 'none'
    }
  }

  function handleDragLeave(_event: DragEvent) {
    // Disabled to prevent flickering - state will be cleared only on dragEnd
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
    const baseClasses = getItemClasses
      ? getItemClasses(node.data, selectedId === node.id, draggedItemId === node.id)
      : 'w-full text-left py-1.5 pr-3 cursor-move hover:bg-gray-100 rounded'

    return baseClasses
  }
</script>

<div class="space-y-1" role="list">
  {#each treeNodes as node, index (node.id)}
    <div 
      class="relative"
      role="listitem"
      ondragenter={handleDragEnter}
      ondragover={(e) => handleDragOver(e, index, node.id)}
      ondragleave={(e) => handleDragLeave(e)}
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

      <button
        type="button"
        draggable="true"
        class={getItemDisplayClasses(node)}
        style="padding-left: {8 + node.level * levelIndent}px"
        data-item-id={node.id}
        onclick={() => handleItemClick(node.id)}
        ondragstart={(e) => handleDragStart(e, node.id)}
        ondragend={handleDragEnd}
        aria-label="Drag to reorder or make child: {getDisplayText(node.data)}"
      >
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center gap-1">
            {#if node.level > 0}
              <span class="text-gray-400 text-xs">└─</span>
            {/if}
            <span>{getDisplayText(node.data)}</span>
          </div>

          {#if getIndicators}
            <div class="flex items-center gap-1">
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

<!-- Component for displaying tags as boxes with delete functionality -->
<script lang="ts">
  import TagItem from './TagItem.svelte'
  import type { CustomTag } from './types'

  interface Props {
    id: string
    tags: CustomTag[]
    placeholder?: string
    readonly?: boolean
    onTagsChange?: () => void
    onCustomTagDoubleClick?: (tagName: string) => void
    currentRandomTagResolutions?: Record<string, string>
  }

  let {
    id,
    tags = $bindable(),
    placeholder = '',
    readonly = false,
    onTagsChange,
    onCustomTagDoubleClick,
    currentRandomTagResolutions = {}
  }: Props = $props()

  let draggedIndex: number | null = $state(null)
  let dropPosition: number | null = $state(null)

  function removeTag(tagNameToRemove: string) {
    if (readonly) return

    tags = tags.filter((tag) => tag.name !== tagNameToRemove)
    onTagsChange?.()
  }

  function handleKeydown(event: KeyboardEvent) {
    // Allow focus navigation with Tab
    if (event.key === 'Tab') {
      return
    }
  }


  function handleDragStart(event: DragEvent, index: number) {
    if (readonly) return

    draggedIndex = index
    event.dataTransfer!.effectAllowed = 'move'
    event.dataTransfer!.setData('text/plain', index.toString())

    // Add dragging class to the element
    if (event.target instanceof HTMLElement) {
      event.target.classList.add('dragging')
    }
  }

  function handleDragEnd(event: DragEvent) {
    draggedIndex = null
    dropPosition = null

    // Remove dragging class
    if (event.target instanceof HTMLElement) {
      event.target.classList.remove('dragging')
    }
  }

  function handleDragOver(event: DragEvent, index: number) {
    if (readonly || draggedIndex === null) return

    event.preventDefault()
    event.dataTransfer!.dropEffect = 'move'

    // Calculate drop position based on mouse position within the element
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const elementWidth = rect.width

    // If mouse is in the left half, insert before; if right half, insert after
    if (mouseX < elementWidth / 2) {
      dropPosition = index
    } else {
      dropPosition = index + 1
    }
  }

  function handleDragLeave() {
    dropPosition = null
  }

  function handleDrop(event: DragEvent) {
    if (readonly || draggedIndex === null || dropPosition === null) return

    event.preventDefault()

    const sourceIndex = draggedIndex
    const targetPosition = dropPosition

    // Calculate the actual insertion index accounting for the removed element
    let insertIndex = targetPosition
    if (sourceIndex < targetPosition) {
      insertIndex = targetPosition - 1
    }

    if (sourceIndex !== insertIndex) {
      // Create a new array with reordered tags
      const newTags = [...tags]
      const [draggedTag] = newTags.splice(sourceIndex, 1)
      newTags.splice(insertIndex, 0, draggedTag)

      tags = newTags
      onTagsChange?.()
    }

    draggedIndex = null
    dropPosition = null
  }
</script>

<div
  {id}
  class="w-full min-h-[6rem] p-1 border border-gray-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-sky-500 focus-within:border-sky-500 {readonly
    ? 'bg-gray-50'
    : ''}"
  tabindex="0"
  role="textbox"
  aria-label={placeholder}
  onkeydown={handleKeydown}
>
  {#if tags.length > 0}
    <div class="flex flex-wrap gap-1 text-left relative">
      {#each tags as tag, index (tag.name)}
        <TagItem
          {tag}
          {index}
          {readonly}
          {draggedIndex}
          {dropPosition}
          {currentRandomTagResolutions}
          onRemove={removeTag}
          onCustomTagDoubleClick={onCustomTagDoubleClick}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />
      {/each}
    </div>
  {:else}
    <div class="text-gray-400 text-sm italic">
      {placeholder}
    </div>
  {/if}
</div>

<!-- Component for displaying tags as boxes with delete functionality -->
<script lang="ts">
  import TagItem from './TagItem.svelte'
  import type { CustomTag } from './types'

  interface Props {
    id: string
    tags: CustomTag[]
    onTagsChange?: () => void
    onCustomTagDoubleClick?: (tagName: string) => void
    onTagClick?: (tagName: string) => void
    currentRandomTagResolutions?: Record<string, string>
    testOverrideTag?: string
  }

  let {
    id,
    tags = $bindable(),
    onTagsChange,
    onCustomTagDoubleClick,
    onTagClick,
    currentRandomTagResolutions = {},
    testOverrideTag = ''
  }: Props = $props()

  let draggedIndex: number | null = $state(null)
  let dropPosition: number | null = $state(null)

  function removeTag(tagNameToRemove: string) {
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
    if (draggedIndex === null) return

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
    if (draggedIndex === null || dropPosition === null) return

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
  class="w-full min-h-[6rem] p-1 border border-gray-300 rounded-lg bg-white"
  tabindex="-1"
  role="textbox"
  aria-label="Tag display area"
  onkeydown={handleKeydown}
>
  {#if tags.length > 0}
    <div class="flex flex-wrap gap-1 text-left relative">
      {#each tags as tag, index (tag.name)}
        <TagItem
          bind:tag={tags[index]}
          {index}
          {draggedIndex}
          {dropPosition}
          {currentRandomTagResolutions}
          {testOverrideTag}
          onRemove={removeTag}
          onCustomTagDoubleClick={onCustomTagDoubleClick}
          onTagClick={onTagClick}
          onWeightChange={onTagsChange}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />
      {/each}
    </div>
  {/if}
</div>

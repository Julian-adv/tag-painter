<!-- Component for displaying tags as boxes with delete functionality -->
<script lang="ts">
  import { XMark } from 'svelte-heros-v2'
  import { isCustomTag } from './stores/tagsStore'
  import { promptsData } from './stores/promptsStore'
  import { get } from 'svelte/store'

  interface Props {
    id: string
    tags: string[]
    placeholder?: string
    readonly?: boolean
    onTagsChange?: () => void
    onCustomTagDoubleClick?: (tagName: string) => void
  }

  let {
    id,
    tags = $bindable(),
    placeholder = '',
    readonly = false,
    onTagsChange,
    onCustomTagDoubleClick
  }: Props = $props()

  let draggedIndex: number | null = $state(null)
  let dropPosition: number | null = $state(null)

  function removeTag(tagToRemove: string) {
    if (readonly) return

    tags = tags.filter((tag) => tag !== tagToRemove)
    onTagsChange?.()
  }

  function handleKeydown(event: KeyboardEvent) {
    // Allow focus navigation with Tab
    if (event.key === 'Tab') {
      return
    }
  }

  function handleTagDoubleClick(tag: string) {
    if (isCustomTag(tag) && onCustomTagDoubleClick) {
      onCustomTagDoubleClick(tag)
    }
  }

  function handleTagKeydown(event: KeyboardEvent, tag: string) {
    if (isCustomTag(tag) && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      handleTagDoubleClick(tag)
    }
  }

  function getCustomTagContent(tagName: string): string {
    if (!isCustomTag(tagName)) return ''

    const currentData = get(promptsData)
    const tagContent = currentData.customTags[tagName]

    if (!tagContent || tagContent.length === 0) {
      return 'Empty custom tag'
    }

    // Show first few tags with ellipsis if there are many
    const maxTags = 50
    if (tagContent.length <= maxTags) {
      return tagContent.join(', ')
    } else {
      return `${tagContent.slice(0, maxTags).join(', ')}... (${tagContent.length} tags total)`
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
      {#each tags as tag, index (tag)}
        <div class="relative">
          <!-- Drop indicator before this tag -->
          {#if dropPosition === index && draggedIndex !== null}
            <div
              class="absolute w-0.5 h-8 bg-blue-500 z-10 -left-1 top-1/2 -translate-y-1/2 animate-pulse"
            ></div>
          {/if}

          <div
            draggable={!readonly}
            ondragstart={(e) => handleDragStart(e, index)}
            ondragend={handleDragEnd}
            ondragover={(e) => handleDragOver(e, index)}
            ondragleave={handleDragLeave}
            ondrop={handleDrop}
            role="button"
            tabindex={readonly ? -1 : 0}
            aria-label="Drag to reorder tag: {tag}"
            class="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-md text-sm transition-all duration-200 {isCustomTag(
              tag
            )
              ? 'bg-pink-100 text-pink-800'
              : 'bg-sky-100 text-sky-800'} {!readonly
              ? 'cursor-move hover:shadow-md'
              : ''} {draggedIndex === index ? 'opacity-50 scale-95' : ''}"
          >
            {#if isCustomTag(tag)}
              <button
                type="button"
                class="text-left cursor-pointer bg-transparent border-none p-0 font-inherit text-inherit focus:outline-none"
                ondblclick={() => handleTagDoubleClick(tag)}
                onkeydown={(e) => handleTagKeydown(e, tag)}
                title={getCustomTagContent(tag)}
                aria-label={`Edit custom tag ${tag}`}
              >
                {tag}
              </button>
            {:else}
              <span class="text-left">
                {tag}
              </span>
            {/if}
            {#if !readonly}
              <button
                type="button"
                class="rounded-full w-4 h-4 inline-flex items-center justify-center {isCustomTag(
                  tag
                )
                  ? 'text-pink-600 hover:text-pink-800 hover:bg-pink-200'
                  : 'text-sky-600 hover:text-sky-800 hover:bg-sky-200'}"
                onclick={() => removeTag(tag)}
                aria-label="Remove {tag}"
              >
                <XMark class="w-3 h-3" />
              </button>
            {/if}
          </div>

          <!-- Drop indicator after this tag (for last position) -->
          {#if dropPosition === index + 1 && draggedIndex !== null}
            <div
              class="absolute w-0.5 h-8 bg-blue-500 z-10 -right-1 top-1/2 -translate-y-1/2 animate-pulse"
            ></div>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="text-gray-400 text-sm italic">
      {placeholder}
    </div>
  {/if}
</div>

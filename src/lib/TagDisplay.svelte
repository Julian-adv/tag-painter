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

  function getTagType(tagName: string): 'regular' | 'custom' | 'random' {
    const currentData = get(promptsData)
    const customTag = currentData.customTags[tagName]
    return customTag?.type ?? 'regular'
  }

  function getDisplayText(tagName: string): string {
    const tagType = getTagType(tagName)
    if (tagType === 'random' && currentRandomTagResolutions[tagName]) {
      return `${tagName} (${currentRandomTagResolutions[tagName]})`
    }
    return tagName
  }

  function getCustomTagContent(tagName: string): string {
    if (!isCustomTag(tagName)) return ''

    const currentData = get(promptsData)
    const customTag = currentData.customTags[tagName]

    if (!customTag || customTag.tags.length === 0) {
      return 'Empty custom tag'
    }

    // Show first few tags with ellipsis if there are many
    const maxTags = 50
    const tagTypeLabel = customTag.type === 'random' ? ' (random)' : ''
    if (customTag.tags.length <= maxTags) {
      return `${customTag.tags.join(', ')}${tagTypeLabel}`
    } else {
      return `${customTag.tags.slice(0, maxTags).join(', ')}... (${customTag.tags.length} tags total)${tagTypeLabel}`
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
        {@const tagType = getTagType(tag)}
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
            class="inline-flex items-center gap-1 rounded-md text-sm transition-all duration-200 {tagType === 'random'
              ? 'bg-purple-100 text-purple-800 border-2 border-dashed border-purple-400 pl-1.5 pr-0.5 py-0.5'
              : tagType === 'custom'
                ? 'bg-pink-100 text-pink-800 pl-2 pr-1 py-1'
                : 'bg-sky-100 text-sky-800 pl-2 pr-1 py-1'} {!readonly
              ? 'cursor-move hover:shadow-md'
              : ''} {draggedIndex === index ? 'opacity-50 scale-95' : ''}"
          >
            {#if tagType === 'custom' || tagType === 'random'}
              <button
                type="button"
                class="text-left cursor-pointer bg-transparent border-none p-0 font-inherit text-inherit focus:outline-none"
                ondblclick={() => handleTagDoubleClick(tag)}
                onkeydown={(e) => handleTagKeydown(e, tag)}
                title={getCustomTagContent(tag)}
                aria-label={`Edit custom tag ${tag}`}
              >
                {getDisplayText(tag)}
              </button>
            {:else}
              <span class="text-left">
                {getDisplayText(tag)}
              </span>
            {/if}
            {#if !readonly}
              <button
                type="button"
                class="rounded-full w-4 h-4 inline-flex items-center justify-center {tagType === 'random'
                  ? 'text-purple-600 hover:text-purple-800 hover:bg-purple-200'
                  : tagType === 'custom'
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

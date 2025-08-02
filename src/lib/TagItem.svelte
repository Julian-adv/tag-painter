<!-- Individual tag item component with drag & drop and editing functionality -->
<script lang="ts">
  import { XMark } from 'svelte-heros-v2'
  import { isCustomTag } from './stores/tagsStore'
  import { promptsData } from './stores/promptsStore'
  import { get } from 'svelte/store'

  interface Props {
    tag: string
    index: number
    readonly?: boolean
    draggedIndex: number | null
    dropPosition: number | null
    currentRandomTagResolutions?: Record<string, string>
    onRemove: (tag: string) => void
    onCustomTagDoubleClick?: (tagName: string) => void
    onDragStart: (event: DragEvent, index: number) => void
    onDragEnd: (event: DragEvent) => void
    onDragOver: (event: DragEvent, index: number) => void
    onDragLeave: () => void
    onDrop: (event: DragEvent) => void
  }

  let {
    tag,
    index,
    readonly = false,
    draggedIndex,
    dropPosition,
    currentRandomTagResolutions = {},
    onRemove,
    onCustomTagDoubleClick,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop
  }: Props = $props()

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

  const tagType = $derived(getTagType(tag))
</script>

<div class="relative">
  <!-- Drop indicator before this tag -->
  {#if dropPosition === index && draggedIndex !== null}
    <div
      class="absolute w-0.5 h-8 bg-blue-500 z-10 -left-1 top-1/2 -translate-y-1/2 animate-pulse"
    ></div>
  {/if}

  <div
    draggable={!readonly}
    ondragstart={(e) => onDragStart(e, index)}
    ondragend={onDragEnd}
    ondragover={(e) => onDragOver(e, index)}
    ondragleave={onDragLeave}
    ondrop={onDrop}
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
        onclick={() => onRemove(tag)}
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
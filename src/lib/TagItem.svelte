<!-- Individual tag item component with drag & drop and editing functionality -->
<script lang="ts">
  import { XMark } from 'svelte-heros-v2'
  import { getTagClasses, getTagRemoveButtonClasses } from './utils/tagStyling'
  import type { CustomTag } from './types'

  interface Props {
    tag: CustomTag
    index: number
    readonly?: boolean
    draggedIndex: number | null
    dropPosition: number | null
    currentRandomTagResolutions?: Record<string, string>
    onRemove: (tagName: string) => void
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

  function handleTagDoubleClick() {
    if (onCustomTagDoubleClick) {
      onCustomTagDoubleClick(tag.name)
    }
  }

  function handleTagKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleTagDoubleClick()
    }
  }

  function getDisplayText(): string {
    if (
      (tag.type === 'random' || tag.type === 'sequential' || tag.type === 'consistent-random') &&
      currentRandomTagResolutions[tag.name]
    ) {
      return `${tag.name}: ${currentRandomTagResolutions[tag.name]}`
    }
    return tag.name
  }

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
    tabindex="-1"
    aria-label="Drag to reorder tag: {tag.name}"
    class="inline-flex items-center gap-1 {getTagClasses({
      tag,
      dragged: draggedIndex === index,
      additionalClasses: 'pl-1.5 pr-0.5 py-0.5'
    })}"
  >
    <button
      type="button"
      class="text-left cursor-pointer bg-transparent border-none p-0 font-inherit text-inherit focus:outline-none"
      tabindex="-1"
      ondblclick={handleTagDoubleClick}
      onkeydown={handleTagKeydown}
      title={tag.type === 'regular'
        ? `Double-click to create custom tag from: ${tag.name}`
        : `Double-click to edit ${tag.name}`}
      aria-label={tag.type === 'regular'
        ? `Create custom tag from ${tag.name}`
        : `Edit custom tag ${tag.name}`}
    >
      {getDisplayText()}
    </button>
    {#if !readonly}
      <button
        type="button"
        class={getTagRemoveButtonClasses(tag)}
        tabindex="-1"
        onclick={() => onRemove(tag.name)}
        aria-label="Remove {tag.name}"
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

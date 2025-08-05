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
    testOverrideTag?: string
    onRemove: (tagName: string) => void
    onCustomTagDoubleClick?: (tagName: string) => void
    onTagClick?: (tagName: string) => void
    onWeightChange?: () => void
    onDragStart: (event: DragEvent, index: number) => void
    onDragEnd: (event: DragEvent) => void
    onDragOver: (event: DragEvent, index: number) => void
    onDragLeave: () => void
    onDrop: (event: DragEvent) => void
  }

  let {
    tag = $bindable(),
    index,
    readonly = false,
    draggedIndex,
    dropPosition,
    currentRandomTagResolutions = {},
    testOverrideTag = '',
    onRemove,
    onCustomTagDoubleClick,
    onTagClick,
    onWeightChange,
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

  function handleTagClick() {
    if (onTagClick) {
      onTagClick(tag.name)
    }
  }

  function handleTagKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleTagDoubleClick()
    }
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault()
    
    const delta = event.deltaY > 0 ? -0.1 : 0.1 // Scroll down = decrease, scroll up = increase
    const currentWeight = tag.weight ?? 1.0
    const newWeight = Math.max(0.1, Math.min(2.0, currentWeight + delta)) // Clamp between 0.1 and 2.0
    
    // Round to 1 decimal place
    const roundedWeight = Math.round(newWeight * 10) / 10
    
    // Update the tag weight directly
    tag.weight = roundedWeight === 1.0 ? undefined : roundedWeight
    
    // Notify parent of weight change
    onWeightChange?.()
  }

  function getDisplayText(): string {
    const weight = tag.weight ?? 1.0
    
    if (
      (tag.type === 'random' || tag.type === 'sequential' || tag.type === 'consistent-random') &&
      currentRandomTagResolutions[tag.name]
    ) {
      // For expanded tags, show weight at the end if different from 1.0
      if (weight !== 1.0) {
        return `${tag.name}: ${currentRandomTagResolutions[tag.name]}:${weight}`
      }
      return `${tag.name}: ${currentRandomTagResolutions[tag.name]}`
    }
    
    // For non-expanded tags, show weight if different from 1.0
    if (weight !== 1.0) {
      return `${tag.name}:${weight}`
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
    onwheel={handleWheel}
    role="button"
    tabindex="-1"
    aria-label="Drag to reorder tag: {tag.name}. Scroll to adjust weight."
    class="inline-flex items-center gap-1 {getTagClasses({
      tag,
      dragged: draggedIndex === index,
      testSelected: testOverrideTag === tag.name,
      additionalClasses: 'pl-1.5 pr-0.5 py-0.5'
    })}"
  >
    <button
      type="button"
      class="text-left cursor-pointer bg-transparent border-none p-0 font-inherit text-inherit focus:outline-none"
      tabindex="-1"
      onclick={handleTagClick}
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

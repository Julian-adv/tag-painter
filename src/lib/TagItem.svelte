<!-- Individual tag item component with drag & drop and editing functionality -->
<script lang="ts">
  import { XMark, LockClosed } from 'svelte-heros-v2'
  import { getTagClasses, getTagRemoveButtonClasses } from './utils/tagStyling'
  import type { CustomTag } from './types'

  interface Props {
    tag: CustomTag
    index: number
    draggedIndex: number | null
    dropPosition: number | null
    currentRandomTagResolutions?: Record<string, string>
    isTestSelected?: boolean
    isForceOverridden?: boolean
    disabled?: boolean
    onRemove: (tagName: string) => void
    onCustomTagDoubleClick?: (tagName: string) => void
    onWeightChange?: () => void
    onRightClick: (event: MouseEvent, index: number) => void
    onDragStart: (event: DragEvent, index: number) => void
    onDragEnd: (event: DragEvent) => void
    onDragOver: (event: DragEvent, index: number) => void
    onDragLeave: () => void
    onDrop: (event: DragEvent) => void
  }

  let {
    tag = $bindable(),
    index,
    draggedIndex,
    dropPosition,
    currentRandomTagResolutions = {},
    isTestSelected = false,
    isForceOverridden = false,
    disabled = false,
    onRemove,
    onCustomTagDoubleClick,
    onWeightChange,
    onRightClick,
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

  function handleWheel(event: WheelEvent) {
    // Don't handle weight adjustment if disabled
    if (disabled) return

    // Only handle weight adjustment when Ctrl key is pressed
    if (!event.ctrlKey) {
      return // Let the normal scroll behavior happen
    }

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

  function handleRightClick(event: MouseEvent) {
    onRightClick(event, index)
  }

  function getNameBackgroundClass(tag: CustomTag): string {
    if (isTestSelected) {
      // Test mode - darker versions of main colors
      switch (tag.type) {
        case 'random':
        case 'sequential':
          return 'bg-purple-700'
        case 'consistent-random':
          return 'bg-orange-700'
        case 'regular':
        default:
          return 'bg-sky-700'
      }
    }

    // Normal mode - slightly darker than tag background
    switch (tag.type) {
      case 'random':
      case 'sequential':
        return 'bg-purple-200'
      case 'consistent-random':
        return 'bg-orange-200'
      case 'regular':
      default:
        return 'bg-sky-200'
    }
  }

  let displayParts = $derived.by(() => {
    const weight = tag.weight ?? 1.0

    if (
      (tag.type === 'random' || tag.type === 'sequential' || tag.type === 'consistent-random') &&
      currentRandomTagResolutions[tag.name]
    ) {
      // For expanded tags, use the resolution directly (no parsing needed)
      return {
        name: tag.name,
        content: currentRandomTagResolutions[tag.name],
        weight: weight !== 1.0 ? weight.toString() : ''
      }
    }

    // For non-expanded tags
    return {
      name: tag.name,
      content: '',
      weight: weight !== 1.0 ? weight.toString() : ''
    }
  })
</script>

<div class="relative">
  <!-- Drop indicator before this tag -->
  {#if dropPosition === index && draggedIndex !== null}
    <div
      class="absolute top-1/2 -left-1 z-10 h-8 w-0.5 -translate-y-1/2 animate-pulse bg-blue-500"
    ></div>
  {/if}

  <div
    draggable={true}
    ondragstart={(e) => onDragStart(e, index)}
    ondragend={onDragEnd}
    ondragover={(e) => onDragOver(e, index)}
    ondragleave={onDragLeave}
    ondrop={onDrop}
    onwheel={handleWheel}
    oncontextmenu={handleRightClick}
    role="button"
    tabindex="-1"
    aria-label="Drag to reorder tag: {tag.name}. Ctrl+Scroll to adjust weight. Right-click for options."
    class="relative inline-block max-w-full {getTagClasses({
      tag,
      dragged: draggedIndex === index,
      testSelected: isTestSelected,
      additionalClasses: 'py-0.5 pr-1 pl-1.5'
    })}"
  >
    <!-- Label pinned to top-left corner of the chip -->
    <span
      class="pointer-events-none font-medium {getNameBackgroundClass(
        tag
      )} absolute top-0 left-0 z-10 rounded-tl rounded-bl px-1 pt-0.5 pb-0.5"
      >{displayParts.name}</span
    >
    <span
      class="font-inherit inline cursor-pointer border-none bg-transparent p-0 text-left text-inherit focus:outline-none"
      tabindex="-1"
      ondblclick={handleTagDoubleClick}
      onkeydown={handleTagKeydown}
      oncontextmenu={handleRightClick}
      title={tag.type === 'regular'
        ? `Double-click to create custom tag from: ${tag.name}`
        : `Double-click to edit ${tag.name}. Right-click for options.`}
      aria-label={tag.type === 'regular'
        ? `Create custom tag from ${tag.name}`
        : `Edit custom tag ${tag.name}. Right-click for options.`}
      role="button"
    >
      <div class="inline-block">
        <span class="invisible px-1 font-medium">{displayParts.name}</span>
        {#if isTestSelected}
          <LockClosed class="ml-1 inline-block h-3 w-3 text-white" />
        {:else if isForceOverridden}
          <LockClosed class="ml-1 inline-block h-3 w-3 text-orange-500" />
        {/if}
        {#if displayParts.content}
          <span class="text-gray-600">{displayParts.content}</span>
        {/if}
        <!-- 2) Invisible dummy to reserve right-edge space for weight + X -->
        <span class="invisible align-top whitespace-nowrap" aria-hidden="true">
          {#if displayParts.weight}
            <span class="font-semibold text-blue-600">{displayParts.weight}</span>
          {/if}xx</span
        >
      </div>
    </span>
    <!-- 1+3) Real weight + X pinned to top-right corner -->
    <span
      class="absolute right-1 bottom-0.5 z-20 inline-flex items-center gap-0.5 whitespace-nowrap"
    >
      {#if displayParts.weight}
        <span class="font-semibold text-blue-600">{displayParts.weight}</span>
      {/if}
      <button
        type="button"
        class={getTagRemoveButtonClasses(tag, isTestSelected)}
        tabindex="-1"
        onclick={() => onRemove(tag.name)}
        aria-label="Remove {tag.name}"
      >
        <XMark class="h-3 w-3" />
      </button>
    </span>
  </div>

  <!-- Drop indicator after this tag (for last position) -->
  {#if dropPosition === index + 1 && draggedIndex !== null}
    <div
      class="absolute top-1/2 -right-1 z-10 h-8 w-0.5 -translate-y-1/2 animate-pulse bg-blue-500"
    ></div>
  {/if}
</div>

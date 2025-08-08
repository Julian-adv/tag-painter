<!-- Component for displaying tags as boxes with delete functionality -->
<script lang="ts">
  import TagItem from './TagItem.svelte'
  import {
    testModeStore,
    setTestModeOverride,
    removeTestModeOverride
  } from './stores/testModeStore.svelte'
  import { LockClosed } from 'svelte-heros-v2'
  import type { CustomTag } from './types'

  interface Props {
    id: string
    tags: CustomTag[]
    onTagsChange?: () => void
    onCustomTagDoubleClick?: (tagName: string) => void
    currentRandomTagResolutions?: Record<string, string>
    testOverrideTag?: string
    disabled?: boolean
    parentTagType?: string // Add parent tag type for context menu logic
    onPinToggle?: (tagName: string, targetTag: string, shouldPin: boolean) => void
  }

  let {
    id,
    tags = $bindable(),
    onTagsChange,
    onCustomTagDoubleClick,
    currentRandomTagResolutions = {},
    testOverrideTag = '',
    disabled = false,
    parentTagType = '',
    onPinToggle
  }: Props = $props()

  let draggedIndex: number | null = $state(null)
  let dropPosition: number | null = $state(null)

  // Context menu state
  let contextMenuState = $state<{
    visible: boolean
    x: number
    y: number
    tagName: string
    tagIndex: number
  }>({
    visible: false,
    x: 0,
    y: 0,
    tagName: '',
    tagIndex: -1
  })

  function removeTag(tagNameToRemove: string) {
    tags = tags.filter((tag) => tag.name !== tagNameToRemove)
    onTagsChange?.()
  }

  function handleRightClick(event: MouseEvent, tagIndex: number) {
    const tag = tags[tagIndex]

    // Show context menu if:
    // 1. Parent tag is random/consistent-random (for pinning child options in CustomTagsManageDialog)
    // 2. This tag itself is random/sequential/consistent-random (for main screen usage)
    const shouldShowContextMenu =
      parentTagType === 'random' ||
      parentTagType === 'consistent-random' ||
      (parentTagType === '' &&
        (tag.type === 'random' || tag.type === 'sequential' || tag.type === 'consistent-random'))

    if (!shouldShowContextMenu) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()

    // Position context menu within viewport bounds
    const menuWidth = 160
    const menuHeight = 60

    const x = Math.min(event.clientX, window.innerWidth - menuWidth)
    const y = Math.min(event.clientY, window.innerHeight - menuHeight)

    contextMenuState = {
      visible: true,
      x: Math.max(10, x),
      y: Math.max(10, y),
      tagName: tag.name,
      tagIndex
    }

    // Close context menu when clicking elsewhere
    const handleClickOutside = () => {
      contextMenuState = { ...contextMenuState, visible: false }
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('contextmenu', handleClickOutside)
    }

    // Add listener after current event loop to avoid immediate closing
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
      document.addEventListener('contextmenu', handleClickOutside)
    }, 0)
  }

  function handlePinToggle() {
    const tag = tags[contextMenuState.tagIndex]
    const isForceOverridden = !!testModeStore[tag.name]?.overrideTag

    // Use current resolution if available, otherwise use the tag name itself
    const targetTag = currentRandomTagResolutions[tag.name] || tag.name

    if (onPinToggle) {
      // Let parent component handle the pin toggle logic
      onPinToggle(tag.name, targetTag, !isForceOverridden)
    } else {
      // Fallback to local handling (for backward compatibility)
      if (isForceOverridden) {
        removeTestModeOverride(tag.name)
      } else {
        setTestModeOverride(tag.name, targetTag)
      }
    }

    contextMenuState = { ...contextMenuState, visible: false }
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
          isTestSelected={testOverrideTag === tag.name}
          isForceOverridden={!!testModeStore[tag.name]?.overrideTag}
          {disabled}
          onRemove={removeTag}
          {onCustomTagDoubleClick}
          onWeightChange={onTagsChange}
          onRightClick={handleRightClick}
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

<!-- Context Menu -->
{#if contextMenuState.visible}
  <div
    class="fixed bg-white border border-gray-300 rounded-lg shadow-lg py-1 z-[100] min-w-40"
    style="left: {contextMenuState.x}px; top: {contextMenuState.y}px;"
  >
    <button
      type="button"
      class="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
      onclick={handlePinToggle}
    >
      {#if contextMenuState.tagIndex >= 0}
        {@const tag = tags[contextMenuState.tagIndex]}
        {@const isForceOverridden = !!testModeStore[tag.name]?.overrideTag}
        <LockClosed class="w-4 h-4 {isForceOverridden ? 'text-orange-500' : 'text-gray-500'}" />
        <span>
          {isForceOverridden ? 'Unpin this option' : 'Pin this option'}
        </span>
      {/if}
    </button>
    {#if contextMenuState.tagIndex >= 0}
      {@const tag = tags[contextMenuState.tagIndex]}
      {@const isForceOverridden = !!testModeStore[tag.name]?.overrideTag}
      {@const displayContent = currentRandomTagResolutions[tag.name]}

      {#if displayContent && !isForceOverridden}
        <div class="px-3 py-1 text-xs text-gray-500 border-t border-gray-200">
          Will pin: <span class="font-medium">{displayContent}</span>
        </div>
      {/if}
      {#if isForceOverridden && testModeStore[tag.name]?.overrideTag}
        <div class="px-3 py-1 text-xs text-gray-500 border-t border-gray-200">
          Pinned to: <span class="font-medium">{testModeStore[tag.name].overrideTag}</span>
        </div>
      {/if}
    {/if}
  </div>
{/if}

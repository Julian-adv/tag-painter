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
  import { getWildcardModel } from './stores/tagsStore'
  import { createPlaceholderRegex } from '$lib/constants'

  // Cache referenced placeholder containers per model+tag to avoid rescanning on every render
  const refCacheByModel: WeakMap<object, Map<string, string[]>> = new WeakMap()

  function getReferencedContainers(tagName: string): string[] {
    const model = getWildcardModel()
    let map = refCacheByModel.get(model)
    if (!map) {
      map = new Map<string, string[]>()
      refCacheByModel.set(model, map)
    }
    const cached = map.get(tagName)
    if (cached) return cached

    const id = model.pathSymbols[tagName] || model.symbols[tagName]
    const out: string[] = []
    const seen = new Set<string>()
    if (id) {
      const node = model.nodes[id]
      if (node && node.kind === 'array') {
        const placeholderAny = createPlaceholderRegex()
        for (const cid of node.children) {
          const c = model.nodes[cid]
          if (!c || c.kind !== 'leaf') continue
          const val = String(c.value ?? '')
          placeholderAny.lastIndex = 0
          let m: RegExpExecArray | null
          while ((m = placeholderAny.exec(val)) !== null) {
            const refName = m[1]
            if (!seen.has(refName)) {
              seen.add(refName)
              out.push(refName)
            }
          }
        }
      }
    }
    map.set(tagName, out)
    return out
  }

  interface Props {
    id: string
    tags: CustomTag[]
    onTagsChange?: (removedTagName?: string) => void
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
    onTagsChange?.(tagNameToRemove)
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

  // Determine if a tag's displayed content is currently forced by a pin.
  // This is true if there's an override for the tag itself (by name),
  // or for any descendant path under that tag (e.g., "parent/child").
  function isOverriddenForTag(tagName: string): boolean {
    const st = testModeStore[tagName]
    if (st && st.enabled && (!!st.overrideTag || !!st.pinnedLeafPath)) return true
    for (const [k, v] of Object.entries(testModeStore)) {
      if (!k || k === tagName) continue
      if (k.startsWith(tagName + '/') && v && v.enabled && (!!v.overrideTag || !!v.pinnedLeafPath))
        return true
    }

    // Also handle alias/placeholder expansions (e.g., pose/d → pose/action)
    const refs = getReferencedContainers(tagName)
    if (refs.length > 0) {
      for (const [k, v] of Object.entries(testModeStore)) {
        if (!v || !v.enabled || (!v.overrideTag && !v.pinnedLeafPath)) continue
        for (const refName of refs) {
          if (k === refName || k.startsWith(refName + '/')) return true
        }
      }
    }
    return false
  }

  function handlePinToggle() {
    const tag = tags[contextMenuState.tagIndex]
    const store = testModeStore[tag.name]
    const isForceOverridden = !!(store?.overrideTag || store?.pinnedLeafPath)

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
  class="min-h-[6rem] w-full rounded-lg border border-gray-300 bg-white p-1"
  tabindex="-1"
  role="textbox"
  aria-label="Tag display area"
  onkeydown={handleKeydown}
>
  {#if tags.length > 0}
    <div class="relative flex flex-wrap gap-1 text-left">
      {#each tags as tag, index (tag.name)}
        <TagItem
          bind:tag={tags[index]}
          {index}
          {draggedIndex}
          {dropPosition}
          {currentRandomTagResolutions}
          isTestSelected={testOverrideTag === tag.name}
          isForceOverridden={isOverriddenForTag(tag.name)}
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
    class="fixed z-[100] min-w-40 rounded-lg border border-gray-300 bg-white py-1 shadow-lg"
    style="left: {contextMenuState.x}px; top: {contextMenuState.y}px;"
  >
    <button
      type="button"
      class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100"
      onclick={handlePinToggle}
    >
      {#if contextMenuState.tagIndex >= 0}
        {@const tag = tags[contextMenuState.tagIndex]}
        {@const store = testModeStore[tag.name]}
        {@const isForceOverridden = !!(store?.overrideTag || store?.pinnedLeafPath)}
        <LockClosed class="h-4 w-4 {isForceOverridden ? 'text-orange-500' : 'text-gray-500'}" />
        <span>
          {isForceOverridden ? 'Unpin this option' : 'Pin this option'}
        </span>
      {/if}
    </button>
    {#if contextMenuState.tagIndex >= 0}
      {@const tag = tags[contextMenuState.tagIndex]}
      {@const store = testModeStore[tag.name]}
      {@const isForceOverridden = !!(store?.overrideTag || store?.pinnedLeafPath)}
      {@const displayContent = currentRandomTagResolutions[tag.name]}

      {#if displayContent && !isForceOverridden}
        <div class="border-t border-gray-200 px-3 py-1 text-xs text-gray-500">
          Will pin: <span class="font-medium">{displayContent}</span>
        </div>
      {/if}
      {#if isForceOverridden}
        <div class="border-t border-gray-200 px-3 py-1 text-xs text-gray-500">
          Pinned to: <span class="font-medium">{store?.overrideTag || 'path-based pin'}</span>
        </div>
      {/if}
    {/if}
  </div>
{/if}

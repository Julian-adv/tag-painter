<!-- Component for tag input zones -->
<script lang="ts">
  import LeafNodeEditor from './LeafNodeEditor.svelte'
  import WildcardsEditorDialog from './TreeEdit/WildcardsEditorDialog.svelte'
  import { promptsData } from './stores/promptsStore'
  import { wildcardTagType } from './stores/tagsStore'
  import { readWildcardZones, writeWildcardZones } from './utils/wildcardZones'
  import { testModeStore, clearAllPins as clearAllPinsStore } from './stores/testModeStore.svelte'
  import { Tag, LockOpen } from 'svelte-heros-v2'
  import type { Settings } from './types'
  import { m } from '$lib/paraglide/messages'
  import { getEffectiveModelSettings } from './utils/generationCommon'
  // Use callback prop instead of deprecated createEventDispatcher

  interface Props {
    currentRandomTagResolutions?: {
      all: Record<string, string>
      zone1: Record<string, string>
      zone2: Record<string, string>
      negative: Record<string, string>
      inpainting: Record<string, string>
    }
    settings: Settings
    onOpenSettings?: (focusField: 'quality' | 'negative') => void
  }

  let {
    currentRandomTagResolutions = { all: {}, zone1: {}, zone2: {}, negative: {}, inpainting: {} },
    settings,
    onOpenSettings
  }: Props = $props()

  // Expose saveTagsImmediately function for parent component to call
  export { saveTagsImmediately }

  let allTags = $state<string>('')
  let firstZoneTags = $state<string>('')
  let secondZoneTags = $state<string>('')
  let negativeTags = $state<string>('')
  let inpaintingTags = $state<string>('')
  let showTreeEditDialog = $state(false)
  let preselectTagName = $state('')
  let preselectTargetText = $state('')
  let wildcardsRefreshToken = $state(0)

  // Display-only prefixes from Settings per selected model
  let qualityPrefixText = $state('')
  let negativePrefixText = $state('')
  let lastModelSignature = $state('')

  let currentModelType = $derived.by(() => {
    const key = $promptsData.selectedCheckpoint || 'Default'
    const effectiveModel = getEffectiveModelSettings(settings, key)
    return effectiveModel?.modelType === 'qwen' ? 'qwen' : undefined
  })

  let isQwenModel = $derived(currentModelType === 'qwen')

  let hasLoadedTags = $state(false)
  let saveTimeout: ReturnType<typeof setTimeout> | null = null

  $effect(() => {
    const key = $promptsData.selectedCheckpoint || 'Default'
    const effectiveModel = getEffectiveModelSettings(settings, key)
    qualityPrefixText = effectiveModel?.qualityPrefix || ''
    negativePrefixText = effectiveModel?.negativePrefix || ''
    const signature = `${currentModelType === 'qwen' ? 'qwen' : 'default'}|${key}`
    if (signature !== lastModelSignature || !hasLoadedTags) {
      lastModelSignature = signature
      hasLoadedTags = true
      void loadTagsFromWildcards(currentModelType)
    }
  })

  // Note: We don't load on mount because settings might not be ready yet
  // Loading happens in $effect when isQwenModel is properly determined

  // Load tags from wildcard zones
  async function loadTagsFromWildcards(modelTypeOverride?: string) {
    const targetModelType = (modelTypeOverride ?? currentModelType) === 'qwen' ? 'qwen' : undefined
    const zones = await readWildcardZones(targetModelType)
    allTags = zones.all
    firstZoneTags = zones.zone1
    secondZoneTags = zones.zone2
    negativeTags = zones.negative
    inpaintingTags = zones.inpainting
  }

  // Debounced save - only saves after user stops typing for 2 seconds
  function debouncedSave() {
    if (saveTimeout) {
      clearTimeout(saveTimeout)
    }

    saveTimeout = setTimeout(() => {
      saveTags()
      saveTimeout = null
    }, 10000) // 10 second debounce
  }

  // Immediate save function for when we need to save right away
  async function saveTags() {
    try {
      const zones = {
        all: allTags,
        zone1: firstZoneTags,
        zone2: secondZoneTags,
        negative: negativeTags,
        inpainting: inpaintingTags
      }

      const targetModelType = currentModelType === 'qwen' ? 'qwen' : undefined
      await writeWildcardZones(zones, targetModelType)

      if (saveTimeout) {
        clearTimeout(saveTimeout)
        saveTimeout = null
      }
    } catch (error) {
      console.error('Failed to save tags to wildcard zones:', error)
    }
  }

  // Force immediate save (for image generation, dialog opening, etc.)
  async function saveTagsImmediately() {
    if (saveTimeout) {
      clearTimeout(saveTimeout)
      saveTimeout = null
    }
    await saveTags()
  }

  async function openTreeEditDialog() {
    // Save any pending changes before opening dialog
    await saveTagsImmediately()
    showTreeEditDialog = true
  }

  async function handleWildcardsSaved() {
    try {
      await loadTagsFromWildcards(currentModelType)
      wildcardsRefreshToken += 1
    } catch (error) {
      console.error('Failed to reload wildcard zones after save:', error)
    }
  }

  async function handleCustomTagDoubleClickForZone(
    zoneId: 'all' | 'zone1' | 'zone2' | 'negative' | 'inpainting',
    tagName: string
  ) {
    preselectTagName = tagName
    preselectTargetText = ''

    const tagType = wildcardTagType(tagName)

    if (tagType === 'random' || tagType === 'consistent-random' || tagType === 'sequential') {
      const zoneMap = currentRandomTagResolutions[zoneId] || {}
      const resolved = zoneMap[tagName]
      if (resolved) {
        preselectTargetText = String(resolved)
      }
    }

    await openTreeEditDialog()
  }

  // Check if there are any pinned tags across all zones
  function hasAnyPinnedTags(): boolean {
    return Object.values(testModeStore).some((state) => state?.pinnedLeafPath)
  }

  // Clear all pinned tag resolutions
  function clearAllPins() {
    clearAllPinsStore()
  }
</script>

<div class="flex h-full w-full flex-shrink-1 flex-col">
  <div class="flex items-center justify-between pb-2">
    <h3 class="text-left text-sm font-bold text-gray-800">{m['tagZones.title']()}</h3>
    <div class="flex gap-1">
      {#if hasAnyPinnedTags()}
        <button
          type="button"
          onclick={clearAllPins}
          class="flex h-5 w-5 items-center justify-center rounded bg-gray-300 text-gray-700 transition-colors hover:bg-gray-400 focus:ring-2 focus:ring-gray-300 focus:ring-offset-1 focus:outline-none"
          title={m['tagZones.clearPins']()}
        >
          <LockOpen class="h-3 w-3" />
        </button>
      {/if}
      <button
        type="button"
        onclick={openTreeEditDialog}
        class="flex h-5 w-5 items-center justify-center rounded bg-gray-300 text-gray-700 transition-colors hover:bg-gray-400 focus:ring-2 focus:ring-gray-300 focus:ring-offset-1 focus:outline-none"
        title={m['tagZones.manageCustom']()}
      >
        <Tag class="h-3 w-3" />
      </button>
    </div>
  </div>

  <!-- Tag zones input sections -->
  <div class="tags-scroll flex-1 space-y-4 overflow-y-auto border-y-1 border-gray-300 p-2">
    <!-- Settings-derived prefixes preview -->
    <div>
      <div class="mb-1 flex items-center justify-between">
        <div class="text-left text-xs font-medium text-gray-700">
          {m['tagZones.qualityPreview']()}
        </div>
      </div>
      <div
        id="quality-prefix-preview"
        class="prefix-preview"
        role="button"
        tabindex="0"
        ondblclick={() => onOpenSettings?.('quality')}
      >
        {qualityPrefixText || ''}
      </div>
    </div>

    <div>
      <div class="mb-1 flex items-center justify-between">
        <div class="text-left text-xs font-medium text-gray-700">
          {m['tagZones.negativePreview']()}
        </div>
      </div>
      <div
        id="negative-prefix-preview"
        class="prefix-preview"
        role="button"
        tabindex="0"
        ondblclick={() => onOpenSettings?.('negative')}
      >
        {negativePrefixText || ''}
      </div>
    </div>
    <LeafNodeEditor
      id="all-tags"
      label={m['tagZones.allLabel']()}
      bind:value={allTags}
      onValueChange={debouncedSave}
      onCustomTagDoubleClick={(name) => handleCustomTagDoubleClickForZone('all', name)}
      currentRandomTagResolutions={currentRandomTagResolutions.all}
      {wildcardsRefreshToken}
    />

    <LeafNodeEditor
      id="first-zone-tags"
      label={m['tagZones.firstLabel']()}
      bind:value={firstZoneTags}
      onValueChange={debouncedSave}
      onCustomTagDoubleClick={(name) => handleCustomTagDoubleClickForZone('zone1', name)}
      currentRandomTagResolutions={currentRandomTagResolutions.zone1}
      disabled={isQwenModel}
      {wildcardsRefreshToken}
    />

    <LeafNodeEditor
      id="second-zone-tags"
      label={m['tagZones.secondLabel']()}
      bind:value={secondZoneTags}
      onValueChange={debouncedSave}
      onCustomTagDoubleClick={(name) => handleCustomTagDoubleClickForZone('zone2', name)}
      currentRandomTagResolutions={currentRandomTagResolutions.zone2}
      disabled={isQwenModel || $promptsData.selectedComposition === 'all'}
      {wildcardsRefreshToken}
    />

    <LeafNodeEditor
      id="negative-tags"
      label={m['tagZones.negativeLabel']()}
      bind:value={negativeTags}
      onValueChange={debouncedSave}
      onCustomTagDoubleClick={(name) => handleCustomTagDoubleClickForZone('negative', name)}
      currentRandomTagResolutions={currentRandomTagResolutions.negative}
      {wildcardsRefreshToken}
    />

    <LeafNodeEditor
      id="inpainting-tags"
      label={m['tagZones.inpaintingLabel']()}
      bind:value={inpaintingTags}
      onValueChange={debouncedSave}
      onCustomTagDoubleClick={(name) => handleCustomTagDoubleClickForZone('inpainting', name)}
      currentRandomTagResolutions={currentRandomTagResolutions.inpainting}
      {wildcardsRefreshToken}
    />
  </div>

  <!-- Wildcards editor dialog (single instance, opened from button or double-click) -->
  <WildcardsEditorDialog
    bind:isOpen={showTreeEditDialog}
    initialSelectedName={preselectTagName}
    initialTargetText={preselectTargetText}
    modelType={currentModelType}
    onSaved={handleWildcardsSaved}
  />
</div>

<style>
  .tags-scroll {
    scrollbar-width: thin;
    scrollbar-color: #cbd5e0 #f7fafc;
  }

  .tags-scroll::-webkit-scrollbar {
    width: 6px;
  }

  .tags-scroll::-webkit-scrollbar-track {
    background: #f7fafc;
    border-radius: 3px;
  }

  .tags-scroll::-webkit-scrollbar-thumb {
    background: #cbd5e0;
    border-radius: 3px;
  }

  .tags-scroll::-webkit-scrollbar-thumb:hover {
    background: #a0aec0;
  }

  .prefix-preview {
    width: 100%;
    border: 1px solid #e5e7eb; /* gray-200 */
    border-radius: 0.25rem; /* rounded */
    background-color: #f9fafb; /* gray-50 */
    padding: 0.25rem; /* p-1 */
    font-size: 0.875rem; /* text-sm */
    white-space: pre-wrap;
    min-height: 3.6em; /* approx 3 lines */
    cursor: pointer;
    user-select: none;
    text-align: left;
  }
</style>

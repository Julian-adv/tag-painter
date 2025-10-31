<!-- Component for tag input zones -->
<script lang="ts">
  import ChipEditor from '$lib/placeholder/ChipEditor.svelte'
  import WildcardsEditorDialog from '$lib/TreeEdit/WildcardsEditorDialog.svelte'
  import { promptsData } from '$lib/stores/promptsStore'
  import { wildcardTagType } from '$lib/stores/tagsStore'
  import { readWildcardZones, writeWildcardZones } from '$lib/utils/wildcardZones'
  import { testModeStore, clearAllPins as clearAllPinsStore } from '$lib/stores/testModeStore.svelte'
  import { Tag, LockOpen } from 'svelte-heros-v2'
  import type { Settings } from '$lib/types'
  import { m } from '$lib/paraglide/messages'
  import { getEffectiveModelSettings } from '$lib/generation/generationCommon'
  // Use callback prop instead of deprecated createEventDispatcher

  interface Props {
    currentRandomTagResolutions?: {
      all: Record<string, string>
      zone1: Record<string, string>
      zone2: Record<string, string>
      negative: Record<string, string>
      inpainting: Record<string, string>
    }
    disabledZones?: Set<string>
    settings: Settings
    onOpenSettings?: (focusField: 'quality' | 'negative') => void
  }

  let {
    currentRandomTagResolutions = { all: {}, zone1: {}, zone2: {}, negative: {}, inpainting: {} },
    disabledZones = new Set(),
    settings,
    onOpenSettings
  }: Props = $props()

  let allTags = $state<string>('')
  let firstZoneTags = $state<string>('')
  let secondZoneTags = $state<string>('')
  let negativeTags = $state<string>('')
  let inpaintingTags = $state<string>('')
  let showTreeEditDialog = $state(false)
  let preselectTagName = $state('')
  let preselectTargetText = $state('')
  let wildcardsRefreshToken = $state(0)
  let directiveDisabledZones = $state<Set<string>>(new Set())

  let effectiveDisabledZones = $derived.by(() => {
    const combined = new Set<string>()
    for (const zone of disabledZones) {
      combined.add(zone)
    }
    for (const zone of directiveDisabledZones) {
      combined.add(zone)
    }
    return combined
  })

  // ChipEditor refs for getting text content
  type ChipEditorHandle = { getText: () => string; readText: (input: string) => void }
  let allTagsEditorRef: ChipEditorHandle | undefined = $state()
  let firstZoneEditorRef: ChipEditorHandle | undefined = $state()
  let secondZoneEditorRef: ChipEditorHandle | undefined = $state()
  let negativeEditorRef: ChipEditorHandle | undefined = $state()
  let inpaintingEditorRef: ChipEditorHandle | undefined = $state()

  // Display-only prefixes from Settings per selected model
  let qualityPrefixText = $state('')
  let negativePrefixText = $state('')
  let lastModelSignature = $state('')

  let currentModelType = $derived.by(() => {
    const key = $promptsData.selectedCheckpoint || 'Default'
    const effectiveModel = getEffectiveModelSettings(settings, key)
    const mt = effectiveModel?.modelType
    return mt === 'qwen' || mt === 'chroma' ? mt : undefined
  })

  let currentWildcardsFile = $derived.by(() => {
    const key = $promptsData.selectedCheckpoint || 'Default'
    const effectiveModel = getEffectiveModelSettings(settings, key)
    return effectiveModel?.wildcardsFile || undefined
  })

  let hasLoadedTags = $state(false)

  $effect(() => {
    const key = $promptsData.selectedCheckpoint || 'Default'
    const effectiveModel = getEffectiveModelSettings(settings, key)
    qualityPrefixText = effectiveModel?.qualityPrefix || ''
    negativePrefixText = effectiveModel?.negativePrefix || ''
    const signature = `${currentWildcardsFile || 'default'}|${key}`
    if (signature !== lastModelSignature || !hasLoadedTags) {
      lastModelSignature = signature
      hasLoadedTags = true
      void loadTagsFromWildcards(currentWildcardsFile, { reroll: true })
    }
  })

  // Note: We don't load on mount because settings might not be ready yet
  // Loading happens in $effect when isQwenModel is properly determined

  // Load tags from wildcard zones
  async function loadTagsFromWildcards(
    filenameOverride?: string,
    options?: { reroll?: boolean; skipRefresh?: boolean }
  ) {
    const targetFile = filenameOverride ?? currentWildcardsFile
    const shouldReroll = options?.reroll ?? false
    const skipRefresh = options?.skipRefresh ?? false
    try {
      const zones = await readWildcardZones(targetFile, { reroll: shouldReroll, skipRefresh })
      allTags = zones.all
      firstZoneTags = zones.zone1
      secondZoneTags = zones.zone2
      negativeTags = zones.negative
      inpaintingTags = zones.inpainting
      directiveDisabledZones = new Set(zones.directives?.disabledZones ?? [])
      wildcardsRefreshToken += 1
    } catch (error) {
      // If wildcards file doesn't exist, start with empty zones
      // Error will be shown as toast when user tries to generate image
      allTags = ''
      firstZoneTags = ''
      secondZoneTags = ''
      negativeTags = ''
      inpaintingTags = ''
      directiveDisabledZones = new Set()
    }
  }

  // Save function
  async function saveTags() {
    try {
      const zones = {
        all: allTagsEditorRef?.getText() ?? '',
        zone1: firstZoneEditorRef?.getText() ?? '',
        zone2: secondZoneEditorRef?.getText() ?? '',
        negative: negativeEditorRef?.getText() ?? '',
        inpainting: inpaintingEditorRef?.getText() ?? ''
      }

      await writeWildcardZones(zones, currentWildcardsFile)
    } catch (error) {
      // Silently fail - error will be shown as toast when generating image
    }
  }

  async function refreshSelectedTags() {
    await loadTagsFromWildcards(currentWildcardsFile, { skipRefresh: true })
  }

  async function openTreeEditDialog() {
    // Save any pending changes before opening dialog
    await saveTags()
    showTreeEditDialog = true
  }

  async function handleWildcardsSaved() {
    try {
      await loadTagsFromWildcards(currentWildcardsFile)
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

  // Expose functions for parent component to call
  export { saveTags, refreshSelectedTags }
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
    <ChipEditor
      bind:this={allTagsEditorRef}
      id="all-tags"
      label={m['tagZones.allLabel']()}
      value={allTags}
      onTagDoubleClick={(name) => handleCustomTagDoubleClickForZone('all', name)}
      currentRandomTagResolutions={currentRandomTagResolutions.all}
    />

    <ChipEditor
      bind:this={firstZoneEditorRef}
      id="first-zone-tags"
      label={m['tagZones.firstLabel']()}
      value={firstZoneTags}
      onTagDoubleClick={(name) => handleCustomTagDoubleClickForZone('zone1', name)}
      currentRandomTagResolutions={currentRandomTagResolutions.zone1}
      disabled={effectiveDisabledZones.has('zone1')}
    />

    <ChipEditor
      bind:this={secondZoneEditorRef}
      id="second-zone-tags"
      label={m['tagZones.secondLabel']()}
      value={secondZoneTags}
      onTagDoubleClick={(name) => handleCustomTagDoubleClickForZone('zone2', name)}
      currentRandomTagResolutions={currentRandomTagResolutions.zone2}
      disabled={$promptsData.selectedComposition === 'all' || effectiveDisabledZones.has('zone2')}
    />

    <ChipEditor
      bind:this={negativeEditorRef}
      id="negative-tags"
      label={m['tagZones.negativeLabel']()}
      value={negativeTags}
      onTagDoubleClick={(name) => handleCustomTagDoubleClickForZone('negative', name)}
      currentRandomTagResolutions={currentRandomTagResolutions.negative}
    />

    <ChipEditor
      bind:this={inpaintingEditorRef}
      id="inpainting-tags"
      label={m['tagZones.inpaintingLabel']()}
      value={inpaintingTags}
      onTagDoubleClick={(name) => handleCustomTagDoubleClickForZone('inpainting', name)}
      currentRandomTagResolutions={currentRandomTagResolutions.inpainting}
    />
  </div>

  <!-- Wildcards editor dialog (single instance, opened from button or double-click) -->
  <WildcardsEditorDialog
    bind:isOpen={showTreeEditDialog}
    initialSelectedName={preselectTagName}
    initialTargetText={preselectTargetText}
    filename={currentWildcardsFile}
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

<!-- Component for tag input zones -->
<script lang="ts">
  import TagInput from './TagInput.svelte'
  import WildcardsEditorDialog from './TreeEdit/WildcardsEditorDialog.svelte'
  import { promptsData, updateTags, savePromptsData } from './stores/promptsStore'
  import { wildcardTagType } from './stores/tagsStore'
  import { onMount } from 'svelte'
  import { Tag } from 'svelte-heros-v2'
  import { get } from 'svelte/store'
  import type { CustomTag } from './types'

  interface Props {
    currentRandomTagResolutions?: {
      all: Record<string, string>
      zone1: Record<string, string>
      zone2: Record<string, string>
      negative: Record<string, string>
      inpainting: Record<string, string>
    }
  }

  let {
    currentRandomTagResolutions = { all: {}, zone1: {}, zone2: {}, negative: {}, inpainting: {} }
  }: Props = $props()

  let allTags = $state<CustomTag[]>([])
  let firstZoneTags = $state<CustomTag[]>([])
  let secondZoneTags = $state<CustomTag[]>([])
  let negativeTags = $state<CustomTag[]>([])
  let inpaintingTags = $state<CustomTag[]>([])
  let showTreeEditDialog = $state(false)
  let preselectTagName = $state('')
  let preselectTargetText = $state('')

  // Parse weight from tag string
  function parseTagWithWeight(tagString: string): { name: string; weight?: number } {
    const weightMatch = tagString.match(/^(.+):(\d+(?:\.\d+)?)$/)
    if (weightMatch) {
      const [, name, weightStr] = weightMatch
      const weight = parseFloat(weightStr)
      return { name, weight: weight !== 1.0 ? weight : undefined }
    }
    return { name: tagString }
  }

  // Convert string array to CustomTag array
  function convertToCustomTags(tagNames: string[]): CustomTag[] {
    const currentData = get(promptsData)
    return tagNames.map((tagString: string): CustomTag => {
      const { name, weight } = parseTagWithWeight(tagString)
      const customTag = currentData.customTags[name]

      if (customTag) {
        // Create a copy so each usage can have its own weight
        return { ...customTag, weight }
      }

      // Create regular tag object for non-custom tags
      return {
        name,
        tags: [name],
        // Determine via wildcards.yaml array behavior (random or consistent-random)
        type: wildcardTagType(name),
        weight
      }
    })
  }

  // Load tags from store on mount
  onMount(() => {
    const unsubscribe = promptsData.subscribe((data) => {
      allTags = convertToCustomTags(data.tags.all)
      firstZoneTags = convertToCustomTags(data.tags.zone1)
      secondZoneTags = convertToCustomTags(data.tags.zone2)
      negativeTags = convertToCustomTags(data.tags.negative)
      inpaintingTags = convertToCustomTags(data.tags.inpainting)
    })
    return unsubscribe
  })

  // Convert CustomTag to string with weight
  function tagToString(tag: CustomTag): string {
    if (tag.weight && tag.weight !== 1.0) {
      return `${tag.name}:${tag.weight}`
    }
    return tag.name
  }

  // Save tags whenever they change
  async function saveTags() {
    updateTags(
      allTags.map(tagToString),
      firstZoneTags.map(tagToString),
      secondZoneTags.map(tagToString),
      negativeTags.map(tagToString),
      inpaintingTags.map(tagToString)
    )
    await savePromptsData()
  }

  function openTreeEditDialog() {
    showTreeEditDialog = true
  }

  function handleCustomTagDoubleClickForZone(
    zoneId: 'all' | 'zone1' | 'zone2' | 'negative' | 'inpainting',
    tagName: string
  ) {
    preselectTagName = tagName
    preselectTargetText = ''

    // Determine tag object from the respective zone to check type
    let src: CustomTag[] = []
    if (zoneId === 'all') src = allTags
    else if (zoneId === 'zone1') src = firstZoneTags
    else if (zoneId === 'zone2') src = secondZoneTags
    else if (zoneId === 'negative') src = negativeTags
    else if (zoneId === 'inpainting') src = inpaintingTags

    const tagObj = src.find((t) => t.name === tagName)
    const tagType = tagObj ? tagObj.type : wildcardTagType(tagName)

    if (tagType === 'random' || tagType === 'consistent-random' || tagType === 'sequential') {
      const zoneMap = currentRandomTagResolutions[zoneId] || {}
      const resolved = zoneMap[tagName]
      if (resolved) {
        preselectTargetText = String(resolved)
      }
    }

    showTreeEditDialog = true
  }
</script>

<div class="flex h-full w-full flex-shrink-1 flex-col">
  <div class="flex items-center justify-between pb-2">
    <h3 class="text-left text-sm font-bold text-gray-800">Tags</h3>
    <button
      type="button"
      onclick={openTreeEditDialog}
      class="flex h-5 w-5 items-center justify-center rounded bg-gray-300 text-gray-700 transition-colors hover:bg-gray-400 focus:ring-2 focus:ring-gray-300 focus:ring-offset-1 focus:outline-none"
      title="Manage custom tags"
    >
      <Tag class="h-3 w-3" />
    </button>
  </div>

  <!-- Tag zones input sections -->
  <div class="tags-scroll flex-1 space-y-4 overflow-y-auto border-y-1 border-gray-300 p-2">
    <TagInput
      id="all-tags"
      label="All"
      bind:tags={allTags}
      onTagsChange={saveTags}
      onCustomTagDoubleClick={(name) => handleCustomTagDoubleClickForZone('all', name)}
      currentRandomTagResolutions={currentRandomTagResolutions.all}
    />

    <TagInput
      id="first-zone-tags"
      label="First Zone"
      bind:tags={firstZoneTags}
      onTagsChange={saveTags}
      onCustomTagDoubleClick={(name) => handleCustomTagDoubleClickForZone('zone1', name)}
      currentRandomTagResolutions={currentRandomTagResolutions.zone1}
    />

    <TagInput
      id="second-zone-tags"
      label="Second Zone"
      bind:tags={secondZoneTags}
      onTagsChange={saveTags}
      onCustomTagDoubleClick={(name) => handleCustomTagDoubleClickForZone('zone2', name)}
      currentRandomTagResolutions={currentRandomTagResolutions.zone2}
      disabled={$promptsData.selectedComposition === 'all'}
    />

    <TagInput
      id="negative-tags"
      label="Negative Tags"
      bind:tags={negativeTags}
      onTagsChange={saveTags}
      onCustomTagDoubleClick={(name) => handleCustomTagDoubleClickForZone('negative', name)}
      currentRandomTagResolutions={currentRandomTagResolutions.negative}
    />

    <TagInput
      id="inpainting-tags"
      label="Inpainting Prompt"
      bind:tags={inpaintingTags}
      onTagsChange={saveTags}
      onCustomTagDoubleClick={(name) => handleCustomTagDoubleClickForZone('inpainting', name)}
      currentRandomTagResolutions={currentRandomTagResolutions.inpainting}
    />
  </div>

  <!-- Wildcards editor dialog (single instance, opened from button or double-click) -->
  <WildcardsEditorDialog
    bind:isOpen={showTreeEditDialog}
    initialSelectedName={preselectTagName}
    initialTargetText={preselectTargetText}
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
</style>

<!-- Component for tag input zones -->
<script lang="ts">
  import TagInput from './TagInput.svelte'
  import CustomTagsManageDialog from './CustomTagsManageDialog.svelte'
  import { promptsData, updateTags, savePromptsData } from './stores/promptsStore'
  import { onMount } from 'svelte'
  import { Tag } from 'svelte-heros-v2'

  interface Props {
    currentRandomTagResolutions?: {
      all: Record<string, string>
      zone1: Record<string, string>
      zone2: Record<string, string>
      negative: Record<string, string>
    }
  }

  let { currentRandomTagResolutions = { all: {}, zone1: {}, zone2: {}, negative: {} } }: Props = $props()

  let allTags = $state<string[]>([])
  let firstZoneTags = $state<string[]>([])
  let secondZoneTags = $state<string[]>([])
  let negativeTags = $state<string[]>([])
  let showCustomTagsDialog = $state(false)
  let selectedCustomTagName = $state<string>('')

  // Load tags from store on mount
  onMount(() => {
    const unsubscribe = promptsData.subscribe((data) => {
      allTags = [...data.tags.all]
      firstZoneTags = [...data.tags.zone1]
      secondZoneTags = [...data.tags.zone2]
      negativeTags = [...data.tags.negative]
    })
    return unsubscribe
  })

  // Save tags whenever they change
  async function saveTags() {
    updateTags(allTags, firstZoneTags, secondZoneTags, negativeTags)
    await savePromptsData()
  }

  function openCustomTagsDialog() {
    selectedCustomTagName = ''
    showCustomTagsDialog = true
  }

  function handleCustomTagDoubleClick(tagName: string) {
    selectedCustomTagName = tagName
    showCustomTagsDialog = true
  }
</script>

<div class="w-full h-full flex flex-col flex-shrink-1">
  <div class="flex items-center justify-between pb-2">
    <h3 class="text-sm font-bold text-gray-800 text-left">Tags</h3>
    <button
      type="button"
      onclick={openCustomTagsDialog}
      class="w-5 h-5 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1 transition-colors flex items-center justify-center"
      title="Manage custom tags"
    >
      <Tag class="w-3 h-3" />
    </button>
  </div>

  <!-- Tag zones input sections -->
  <div class="flex-1 space-y-4 p-2 overflow-y-auto border-y-1 border-gray-300 tags-scroll">
    <TagInput
      id="all-tags"
      label="All"
      placeholder="Enter tags for all zones..."
      bind:tags={allTags}
      onTagsChange={saveTags}
      onCustomTagDoubleClick={handleCustomTagDoubleClick}
      currentRandomTagResolutions={currentRandomTagResolutions.all}
    />

    <TagInput
      id="first-zone-tags"
      label="First Zone"
      placeholder="Enter tags for first zone..."
      bind:tags={firstZoneTags}
      onTagsChange={saveTags}
      onCustomTagDoubleClick={handleCustomTagDoubleClick}
      currentRandomTagResolutions={currentRandomTagResolutions.zone1}
    />

    <TagInput
      id="second-zone-tags"
      label="Second Zone"
      placeholder="Enter tags for second zone..."
      bind:tags={secondZoneTags}
      onTagsChange={saveTags}
      onCustomTagDoubleClick={handleCustomTagDoubleClick}
      currentRandomTagResolutions={currentRandomTagResolutions.zone2}
    />

    <TagInput
      id="negative-tags"
      label="Negative Tags"
      placeholder="Enter negative tags..."
      bind:tags={negativeTags}
      onTagsChange={saveTags}
      onCustomTagDoubleClick={handleCustomTagDoubleClick}
      currentRandomTagResolutions={currentRandomTagResolutions.negative}
    />
  </div>

  <!-- Custom tags management dialog -->
  <CustomTagsManageDialog bind:isOpen={showCustomTagsDialog} initialSelectedTag={selectedCustomTagName} />
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

<!-- Component for tag input zones -->
<script lang="ts">
  import TagInput from './TagInput.svelte'
  import { promptsData, updateTags, savePromptsData } from './stores/promptsStore'
  import { onMount } from 'svelte'

  let allTags = $state<string[]>([])
  let firstZoneTags = $state<string[]>([])
  let secondZoneTags = $state<string[]>([])
  let negativeTags = $state<string[]>([])

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
  function saveTags() {
    updateTags(allTags, firstZoneTags, secondZoneTags, negativeTags)
    savePromptsData()
  }
</script>

<div class="h-full flex flex-col flex-shrink-1">
  <div>
    <h3 class="text-sm font-bold text-gray-800 text-left pb-2">Tags</h3>
  </div>

  <!-- Tag zones input sections -->
  <div class="flex-1 space-y-4 p-2 overflow-y-auto border-y-1 border-gray-300">
    <TagInput
      id="all-tags"
      label="All"
      placeholder="Enter tags for all zones..."
      bind:tags={allTags}
      onTagsChange={saveTags}
    />

    <TagInput
      id="first-zone-tags"
      label="First Zone"
      placeholder="Enter tags for first zone..."
      bind:tags={firstZoneTags}
      onTagsChange={saveTags}
    />

    <TagInput
      id="second-zone-tags"
      label="Second Zone"
      placeholder="Enter tags for second zone..."
      bind:tags={secondZoneTags}
      onTagsChange={saveTags}
    />

    <TagInput
      id="negative-tags"
      label="Negative Tags"
      placeholder="Enter negative tags..."
      bind:tags={negativeTags}
      onTagsChange={saveTags}
    />
  </div>
</div>

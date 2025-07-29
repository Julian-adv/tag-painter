<!-- Component for tag input zones -->
<script lang="ts">
  import TagInput from './TagInput.svelte'
  import { promptsData, updateTags, savePromptsData } from './stores/promptsStore'
  import { onMount } from 'svelte'
  
  let allTags = $state<string[]>([])
  let firstZoneTags = $state<string[]>([])
  let secondZoneTags = $state<string[]>([])

  // Load tags from store on mount
  onMount(() => {
    const unsubscribe = promptsData.subscribe(data => {
      allTags = [...data.tags.all]
      firstZoneTags = [...data.tags.zone1]
      secondZoneTags = [...data.tags.zone2]
    })
    return unsubscribe
  })

  // Save tags whenever they change
  function saveTags() {
    updateTags(allTags, firstZoneTags, secondZoneTags)
    savePromptsData()
  }
</script>

<div class="h-full flex flex-col">
  <div>
    <h3 class="text-sm font-medium text-gray-800 p-2 text-left">Tags</h3>
  </div>

  <!-- Tag zones input sections -->
  <div class="flex-1 space-y-4 p-2 overflow-y-auto">
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
  </div>
</div>
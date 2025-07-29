<!-- Component for tag input zones -->
<script lang="ts">
  import TagInput from './TagInput.svelte'
  
  let allTags = $state<string[]>([])
  let firstZoneTags = $state<string[]>([])
  let secondZoneTags = $state<string[]>([])
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
    />
    
    <TagInput 
      id="first-zone-tags"
      label="First Zone" 
      placeholder="Enter tags for first zone..."
      bind:tags={firstZoneTags}
    />
    
    <TagInput 
      id="second-zone-tags"
      label="Second Zone" 
      placeholder="Enter tags for second zone..."
      bind:tags={secondZoneTags}
    />
  </div>
</div>
<!-- Component for tag input zones -->
<script lang="ts">
  let allTags = $state('')
  let firstZoneTags = $state('')
  let secondZoneTags = $state('')
</script>

<div class="h-full flex flex-col">
  <div>
    <h3 class="text-sm font-medium text-gray-800 p-2 text-left">Tags</h3>
  </div>

  <!-- Tag zones input sections -->
  <div class="flex-1 space-y-4 p-2 overflow-y-auto">
  <!-- All tags section -->
  <div>
    <label for="all-tags" class="block text-xs font-medium text-gray-700 mb-2 text-left">All</label>
    <textarea 
      id="all-tags"
      bind:value={allTags}
      class="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
      rows="6"
      placeholder="Enter tags for all zones..."
    ></textarea>
  </div>

  <!-- First Zone section -->
  <div>
    <label for="first-zone-tags" class="block text-xs font-medium text-gray-700 mb-2 text-left">First Zone</label>
    <textarea 
      id="first-zone-tags"
      bind:value={firstZoneTags}
      class="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
      rows="6"
      placeholder="Enter tags for first zone..."
    ></textarea>
  </div>

  <!-- Second Zone section -->
  <div>
    <label for="second-zone-tags" class="block text-xs font-medium text-gray-700 mb-2 text-left">Second Zone</label>
    <textarea 
      id="second-zone-tags"
      bind:value={secondZoneTags}
      class="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
      rows="6"
      placeholder="Enter tags for second zone..."
    ></textarea>
  </div>
  </div>
</div>
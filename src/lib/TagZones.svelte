<!-- Component for tag input zones -->
<script lang="ts">
  let allTags = $state('')
  let firstZoneTags = $state('')
  let secondZoneTags = $state('')
</script>

<div class="border-b border-gray-200">
  <h3 class="text-sm font-medium text-gray-800 p-2 text-left">Tags</h3>
</div>

<!-- Tag zones input sections -->
<div class="space-y-4 p-2">
  <!-- All tags section -->
  <div>
    <label class="block text-sm font-medium text-gray-700 mb-2">All</label>
    <textarea 
      bind:value={allTags}
      class="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
      rows="3"
      placeholder="Enter tags for all zones..."
    ></textarea>
  </div>

  <!-- First Zone section -->
  <div>
    <label class="block text-sm font-medium text-gray-700 mb-2">First Zone</label>
    <textarea 
      bind:value={firstZoneTags}
      class="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
      rows="3"
      placeholder="Enter tags for first zone..."
    ></textarea>
  </div>

  <!-- Second Zone section -->
  <div>
    <label class="block text-sm font-medium text-gray-700 mb-2">Second Zone</label>
    <textarea 
      bind:value={secondZoneTags}
      class="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
      rows="3"
      placeholder="Enter tags for second zone..."
    ></textarea>
  </div>
</div>
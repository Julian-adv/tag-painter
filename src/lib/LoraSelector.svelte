<script lang="ts">
  import { onMount } from 'svelte'
  import LoraItem from './LoraItem.svelte'
  import LoraSelectionModal from './LoraSelectionModal.svelte'
  import { Plus } from 'svelte-heros-v2'

  interface Props {
    selectedLoras: string[]
    onLoraChange: (loras: string[]) => void
    loraWeight: number
    onWeightChange: (weight: number) => void
  }

  let { selectedLoras, onLoraChange, loraWeight, onWeightChange }: Props = $props()

  let availableLoras: string[] = $state([])
  let loading = $state(true)
  let error = $state('')
  let isModalOpen = $state(false)

  // Convert selectedLoras array to LoraData objects with weights
  let loraDataList = $derived.by(() => {
    return selectedLoras.map((name) => ({
      name,
      weight: loraWeight
    }))
  })

  async function fetchLoras() {
    try {
      loading = true
      const response = await fetch('/api/loras')
      const data = await response.json()

      if (response.ok) {
        availableLoras = data.loras || []
        error = ''
      } else {
        error = data.error || 'Failed to fetch LoRA models'
        availableLoras = []
      }
    } catch (err) {
      error = 'Failed to connect to ComfyUI'
      availableLoras = []
      console.error('Error fetching LoRAs:', err)
    } finally {
      loading = false
    }
  }

  function handleLoraAdd(lora: string) {
    const newSelectedLoras = [...selectedLoras, lora]
    onLoraChange(newSelectedLoras)
    isModalOpen = false
  }

  function handleLoraRemove(loraName: string) {
    const newSelectedLoras = selectedLoras.filter((l) => l !== loraName)
    onLoraChange(newSelectedLoras)
  }

  function handleLoraWeightChange(loraName: string, weight: number) {
    // For now, all LoRAs share the same weight, so update the global weight
    onWeightChange(weight)
  }

  function openModal() {
    isModalOpen = true
  }

  function closeModal() {
    isModalOpen = false
  }

  onMount(() => {
    fetchLoras()
  })
</script>

<div class="lora-selector">
  <h3 class="mb-2 pt-1 text-left text-sm font-bold text-gray-700">LoRA Models</h3>

  {#if loading}
    <div class="text-sm text-gray-500">Loading LoRA models...</div>
  {:else if error}
    <div class="text-sm text-red-600">{error}</div>
    <button onclick={fetchLoras} class="mt-1 text-xs text-blue-600 hover:text-blue-800">
      Retry
    </button>
  {:else}
    <!-- Selected LoRAs display area -->
    <div
      class="lora-display-area max-h-24 min-h-[6rem] w-full overflow-y-auto rounded-lg border border-gray-300 bg-white p-2"
    >
      {#if loraDataList.length > 0}
        <div class="flex flex-wrap gap-1">
          {#each loraDataList as loraData, index (loraData.name)}
            <LoraItem
              bind:lora={loraDataList[index]}
              onRemove={handleLoraRemove}
              onWeightChange={handleLoraWeightChange}
            />
          {/each}
        </div>
      {/if}
    </div>

    <!-- Add LoRA button -->
    <div class="mt-2 flex items-center justify-between">
      <button
        type="button"
        onclick={openModal}
        class="flex items-center gap-1 rounded-lg border border-green-300 bg-green-50 px-2 py-1 text-xs text-green-600 hover:bg-green-100 focus:ring-2 focus:ring-green-500 focus:outline-none"
        disabled={availableLoras.length === 0}
      >
        <Plus class="h-3 w-3" />
        Add LoRA
      </button>

      <div class="text-xs text-gray-600">
        {selectedLoras.length} selected
      </div>
    </div>
  {/if}
</div>

<!-- LoRA Selection Modal -->
<LoraSelectionModal
  isOpen={isModalOpen}
  {availableLoras}
  {selectedLoras}
  onClose={closeModal}
  onLoraSelect={handleLoraAdd}
/>

<style>
  .lora-display-area {
    scrollbar-width: thin;
    scrollbar-color: #cbd5e0 #f7fafc;
  }

  .lora-display-area::-webkit-scrollbar {
    width: 6px;
  }

  .lora-display-area::-webkit-scrollbar-track {
    background: #f7fafc;
    border-radius: 3px;
  }

  .lora-display-area::-webkit-scrollbar-thumb {
    background: #cbd5e0;
    border-radius: 3px;
  }

  .lora-display-area::-webkit-scrollbar-thumb:hover {
    background: #a0aec0;
  }
</style>

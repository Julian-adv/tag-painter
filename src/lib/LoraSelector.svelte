<script lang="ts">
  import { onMount } from 'svelte'
  import LoraItem from './LoraItem.svelte'
  import LoraSelectionModal from './LoraSelectionModal.svelte'
  import { Plus } from 'svelte-heros-v2'
  import { m } from '$lib/paraglide/messages'
  import { normalizeLoraNameForDisplay } from '$lib/utils/loraPath'

  interface LoraWithWeight {
    name: string
    weight: number
  }

  interface Props {
    selectedLoras: LoraWithWeight[]
    onLoraChange: (loras: LoraWithWeight[]) => void
  }

  let { selectedLoras, onLoraChange }: Props = $props()

  let availableLoras: string[] = $state([])
  let loading = $state(true)
  let error = $state('')
  let isModalOpen = $state(false)

  // selectedLoras already contains LoraWithWeight objects

  async function fetchLoras() {
    try {
      loading = true
      const response = await fetch('/api/loras')
      const data = await response.json()

      if (response.ok) {
        const rawLoras = Array.isArray(data?.loras) ? data.loras : []
        availableLoras = rawLoras.map((name: string) => normalizeLoraNameForDisplay(name))
        error = ''
      } else {
        error = data.error ? String(data.error) : m['loraSelector.fetchError']()
        availableLoras = []
      }
    } catch (err) {
      error = m['loraSelector.connectError']()
      availableLoras = []
      console.error('Error fetching LoRAs:', err)
    } finally {
      loading = false
    }
  }

  function handleLoraAdd(lora: string) {
    const newSelectedLoras = [...selectedLoras, { name: lora, weight: 1.0 }]
    onLoraChange(newSelectedLoras)
    isModalOpen = false
  }

  function handleLoraRemove(loraName: string) {
    const newSelectedLoras = selectedLoras.filter((l) => l.name !== loraName)
    onLoraChange(newSelectedLoras)
  }

  function handleLoraWeightChange(loraName: string, weight: number) {
    const newSelectedLoras = selectedLoras.map((l) => (l.name === loraName ? { ...l, weight } : l))
    onLoraChange(newSelectedLoras)
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

  // Expose a refresh method to parent components
  export function refresh() {
    fetchLoras()
  }
</script>

<div class="lora-selector">
  <h3 class="mb-2 pt-1 text-left text-sm font-bold text-gray-700">{m['loraSelector.title']()}</h3>

  <!-- Stable-height container prevents layout jump during refresh -->
  <div
    class="lora-display-area max-h-24 min-h-[6rem] w-full overflow-y-auto rounded-lg border border-gray-300 bg-white p-2"
  >
    {#if loading}
      <div class="text-sm text-gray-500" aria-live="polite">{m['loraSelector.loading']()}</div>
    {:else if error}
      <div class="text-sm text-red-600">{error}</div>
      <button onclick={fetchLoras} class="mt-1 text-xs text-blue-600 hover:text-blue-800">
        {m['loraSelector.retry']()}
      </button>
    {:else if selectedLoras.length > 0}
      <div class="flex flex-wrap gap-1">
        {#each selectedLoras as lora (lora.name)}
          <LoraItem {lora} onRemove={handleLoraRemove} onWeightChange={handleLoraWeightChange} />
        {/each}
      </div>
    {/if}
  </div>

  <!-- Always render controls to keep layout stable; disable when unavailable/loading -->
  <div class="mt-2 flex items-center justify-between">
    <button
      type="button"
      onclick={openModal}
      class="flex items-center gap-1 rounded-lg border border-green-300 bg-green-50 px-2 py-1 text-xs text-green-600 hover:bg-green-100 focus:ring-2 focus:ring-green-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      disabled={loading || availableLoras.length === 0}
    >
      <Plus class="h-3 w-3" />
      {m['loraSelector.add']()}
    </button>

    <div class="text-xs text-gray-600">
      {m['loraSelector.selectedCount']({ count: String(selectedLoras.length) })}
    </div>
  </div>
</div>

<!-- LoRA Selection Modal -->
<LoraSelectionModal
  isOpen={isModalOpen}
  {availableLoras}
  selectedLoras={selectedLoras.map((l) => l.name)}
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

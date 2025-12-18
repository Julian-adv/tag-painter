<script lang="ts">
  import { onMount } from 'svelte'
  import LoraItem from './LoraItem.svelte'
  import LoraSelectionModal from './LoraSelectionModal.svelte'
  import { Plus, Trash } from 'svelte-heros-v2'
  import { m } from '$lib/paraglide/messages'
  import { normalizeLoraNameForDisplay } from '$lib/utils/loraPath'
  import type { LoraPreset } from '$lib/types'

  interface LoraWithWeight {
    name: string
    weight: number
  }

  interface Props {
    selectedLoras: LoraWithWeight[]
    onLoraChange: (loras: LoraWithWeight[]) => void
    presets: LoraPreset[]
    onPresetsChange: (presets: LoraPreset[]) => void
  }

  let { selectedLoras, onLoraChange, presets = [], onPresetsChange }: Props = $props()

  let availableLoras: string[] = $state([])
  let loading = $state(true)
  let error = $state('')
  let isModalOpen = $state(false)
  let selectedPresetName: string = $state('')
  let isPresetNameModalOpen = $state(false)
  let presetNameInput: string = $state('')
  let isDeleteConfirmModalOpen = $state(false)

  // Check if current loras match a preset
  function findMatchingPreset(): string {
    if (selectedLoras.length === 0) {
      return ''
    }

    for (const preset of presets) {
      if (preset.loras.length !== selectedLoras.length) {
        continue
      }

      // Check if all loras match (same name and weight)
      const allMatch = preset.loras.every((presetLora) =>
        selectedLoras.some(
          (selectedLora) =>
            selectedLora.name === presetLora.name && selectedLora.weight === presetLora.weight
        )
      )

      if (allMatch) {
        return preset.name
      }
    }

    return ''
  }

  // Initialize preset selection on mount
  function initializePresetSelection() {
    selectedPresetName = findMatchingPreset()
  }

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
    // Clear preset selection when manually adding
    selectedPresetName = ''
  }

  function handleLoraRemove(loraName: string) {
    const newSelectedLoras = selectedLoras.filter((l) => l.name !== loraName)
    onLoraChange(newSelectedLoras)
    // Clear preset selection when manually removing
    selectedPresetName = ''
  }

  function handleLoraWeightChange(loraName: string, weight: number) {
    const newSelectedLoras = selectedLoras.map((l) => (l.name === loraName ? { ...l, weight } : l))
    onLoraChange(newSelectedLoras)
    // Clear preset selection when modifying weights
    selectedPresetName = ''
  }

  function openModal() {
    isModalOpen = true
  }

  function closeModal() {
    isModalOpen = false
  }

  function handlePresetChange(e: Event) {
    const target = e.target as HTMLSelectElement
    const presetName = target.value
    selectedPresetName = presetName

    if (presetName === '') {
      // "None" selected - clear loras
      onLoraChange([])
      return
    }

    const preset = presets.find((p) => p.name === presetName)
    if (preset) {
      // Deep copy loras to avoid reference issues
      const lorasCopy = preset.loras.map((l) => ({ ...l }))
      onLoraChange(lorasCopy)
    }
  }

  function openPresetNameModal() {
    if (selectedLoras.length === 0) {
      return
    }
    presetNameInput = ''
    isPresetNameModalOpen = true
  }

  function closePresetNameModal() {
    isPresetNameModalOpen = false
    presetNameInput = ''
  }

  function confirmSavePreset() {
    if (!presetNameInput.trim()) {
      return
    }

    const trimmedName = presetNameInput.trim()
    const existingIndex = presets.findIndex((p) => p.name === trimmedName)
    const newPreset: LoraPreset = {
      name: trimmedName,
      loras: selectedLoras.map((l) => ({ ...l }))
    }

    let newPresets: LoraPreset[]
    if (existingIndex >= 0) {
      // Update existing preset
      newPresets = presets.map((p, i) => (i === existingIndex ? newPreset : p))
    } else {
      // Add new preset
      newPresets = [...presets, newPreset]
    }

    onPresetsChange(newPresets)
    selectedPresetName = trimmedName
    closePresetNameModal()
  }

  function openDeleteConfirmModal() {
    if (!selectedPresetName) {
      return
    }
    isDeleteConfirmModalOpen = true
  }

  function closeDeleteConfirmModal() {
    isDeleteConfirmModalOpen = false
  }

  function confirmDeletePreset() {
    const newPresets = presets.filter((p) => p.name !== selectedPresetName)
    onPresetsChange(newPresets)
    selectedPresetName = ''
    closeDeleteConfirmModal()
  }

  onMount(() => {
    fetchLoras()
    initializePresetSelection()
  })

  // Expose a refresh method to parent components
  export function refresh() {
    fetchLoras()
  }

  // Expose preset initialization for when dialog opens
  export function syncPresetSelection() {
    selectedPresetName = findMatchingPreset()
  }
</script>

<div class="lora-selector">
  <h3 class="mb-2 pt-1 text-left text-sm font-bold text-gray-700">{m['loraSelector.title']()}</h3>

  <!-- Preset selector -->
  <div class="mb-2 flex items-center gap-2">
    <label for="lora-preset" class="text-xs text-gray-600">{m['loraSelector.preset']()}:</label>
    <select
      id="lora-preset"
      class="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
      value={selectedPresetName}
      onchange={handlePresetChange}
    >
      <option value="">{m['loraSelector.presetNone']()}</option>
      {#each presets as preset (preset.name)}
        <option value={preset.name}>{preset.name}</option>
      {/each}
    </select>
    <button
      type="button"
      onclick={openPresetNameModal}
      class="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs text-blue-600 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={selectedLoras.length === 0}
      title={m['loraSelector.savePreset']()}
    >
      {m['loraSelector.savePreset']()}
    </button>
    <button
      type="button"
      onclick={openDeleteConfirmModal}
      class="rounded border border-red-300 bg-red-50 p-1 text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={!selectedPresetName}
      title={m['loraSelector.deletePreset']()}
    >
      <Trash class="h-3 w-3" />
    </button>
  </div>

  <!-- Stable-height container prevents layout jump during refresh -->
  <div
    class="lora-display-area max-h-40 min-h-40 w-full overflow-y-auto rounded-lg border border-gray-300 bg-white p-2"
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

<!-- Preset Name Input Modal -->
{#if isPresetNameModalOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50"
    onclick={closePresetNameModal}
    onkeydown={(e) => e.key === 'Escape' && closePresetNameModal()}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="w-80 rounded-lg bg-white p-4 shadow-xl" onclick={(e) => e.stopPropagation()}>
      <h3 class="mb-3 text-sm font-semibold text-gray-800">
        {m['loraSelector.presetNamePrompt']()}
      </h3>
      <input
        type="text"
        bind:value={presetNameInput}
        class="mb-4 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        placeholder="Preset name"
        onkeydown={(e) => e.key === 'Enter' && confirmSavePreset()}
      />
      <div class="flex justify-end gap-2">
        <button
          type="button"
          onclick={closePresetNameModal}
          class="rounded bg-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-300"
        >
          {m['loraSelector.cancel']()}
        </button>
        <button
          type="button"
          onclick={confirmSavePreset}
          class="rounded bg-blue-500 px-3 py-1.5 text-xs text-white hover:bg-blue-600 disabled:opacity-50"
          disabled={!presetNameInput.trim()}
        >
          {m['loraSelector.savePreset']()}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Confirm Modal -->
{#if isDeleteConfirmModalOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50"
    onclick={closeDeleteConfirmModal}
    onkeydown={(e) => e.key === 'Escape' && closeDeleteConfirmModal()}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="w-80 rounded-lg bg-white p-4 shadow-xl" onclick={(e) => e.stopPropagation()}>
      <h3 class="mb-3 text-sm font-semibold text-gray-800">
        {m['loraSelector.presetDeleteConfirm']({ name: selectedPresetName })}
      </h3>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          onclick={closeDeleteConfirmModal}
          class="rounded bg-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-300"
        >
          {m['loraSelector.cancel']()}
        </button>
        <button
          type="button"
          onclick={confirmDeletePreset}
          class="rounded bg-red-500 px-3 py-1.5 text-xs text-white hover:bg-red-600"
        >
          {m['loraSelector.deletePreset']()}
        </button>
      </div>
    </div>
  </div>
{/if}

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

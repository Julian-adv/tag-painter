<script lang="ts">
  import type { TreeModel } from './model'
  import CustomSelect from '../CustomSelect.svelte'

  interface Props {
    model: TreeModel
    selectedIds: string[]
    onModelChanged?: () => void
  }

  let { model, selectedIds, onModelChanged }: Props = $props()

  let loras: string[] = $state([])
  let selectedLora = $state('')
  let isLoading = $state(false)

  async function fetchLoras() {
    isLoading = true
    try {
      const response = await fetch('/api/loras')
      const data = await response.json()
      loras = data.loras || []
    } catch (error) {
      console.error('Failed to fetch LoRAs:', error)
      loras = []
    } finally {
      isLoading = false
    }
  }

  // Fetch LoRAs on mount
  $effect(() => {
    fetchLoras()
  })

  function handleInsert() {
    if (!selectedLora || selectedIds.length !== 1) return

    const selectedId = selectedIds[0]
    const node = model.nodes[selectedId]
    if (!node || node.kind !== 'leaf') return

    const currentValue = String(node.value || '').trim()

    // Extract last component of path and remove .safetensors extension
    const loraName =
      selectedLora
        .split('/')
        .pop()
        ?.replace(/\.safetensors$/i, '') || selectedLora
    const loraTag = `<lora:${loraName}>`

    // Parse the value to insert LoRA before disables directive
    const disablesMatch = currentValue.match(/(.*?)(,?\s*disables=\[[^\]]*\])(.*)$/i)

    if (disablesMatch) {
      // Insert before disables directive
      const beforeDisables = disablesMatch[1].trim()
      const disablesDirective = disablesMatch[2].trim()
      const afterDisables = disablesMatch[3].trim()

      // Remove leading comma from disablesDirective if present
      const cleanDisables = disablesDirective.replace(/^,\s*/, '')

      if (beforeDisables) {
        node.value = `${beforeDisables}, ${loraTag}, ${cleanDisables}${afterDisables ? ' ' + afterDisables : ''}`
      } else {
        node.value = `${loraTag}, ${cleanDisables}${afterDisables ? ' ' + afterDisables : ''}`
      }
    } else {
      // No disables directive, just append
      node.value = currentValue ? `${currentValue}, ${loraTag}` : loraTag
    }

    onModelChanged?.()
    selectedLora = '' // Reset selection
  }
</script>

<div class="directive-row">
  <label for="lora-select" class="directive-label">LoRA</label>
  <div class="lora-select-group">
    <CustomSelect
      id="lora-select"
      bind:value={selectedLora}
      options={[
        { value: '', label: isLoading ? 'Loading...' : 'Select LoRA' },
        ...loras.map((lora) => ({ value: lora, label: lora }))
      ]}
      class="lora-select"
    />
    <button
      class="add-lora-btn"
      onclick={handleInsert}
      disabled={!selectedLora || isLoading}
      title="Insert LoRA tag"
    >
      Add
    </button>
  </div>
</div>

<style>
  .directive-row {
    display: grid;
    grid-template-columns: 8rem minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
    width: 100%;
  }
  .directive-label {
    font-size: 0.875rem;
    color: #374151;
    font-weight: 500;
    justify-self: start;
  }
  .lora-select-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-self: start;
    width: 100%;
  }
  .lora-select-group :global(.lora-select) {
    flex: 1;
    min-width: 0;
  }
  .add-lora-btn {
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
    color: white;
    background-color: #3b82f6;
    border: 1px solid #2563eb;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .add-lora-btn:hover:not(:disabled) {
    background-color: #2563eb;
    border-color: #1d4ed8;
  }
  .add-lora-btn:active:not(:disabled) {
    background-color: #1d4ed8;
  }
  .add-lora-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .add-lora-btn:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
  }
</style>

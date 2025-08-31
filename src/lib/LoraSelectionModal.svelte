<!-- Modal for selecting LoRA models -->
<script lang="ts">
  import { XMark } from 'svelte-heros-v2'

  interface Props {
    isOpen: boolean
    availableLoras: string[]
    selectedLoras: string[]
    onClose: () => void
    onLoraSelect: (lora: string) => void
  }

  let {
    isOpen,
    availableLoras,
    selectedLoras,
    onClose,
    onLoraSelect
  }: Props = $props()

  let searchQuery = $state('')

  // Filter available loras based on search and exclude already selected ones
  let filteredLoras = $derived.by(() => {
    return availableLoras
      .filter(lora => !selectedLoras.includes(lora))
      .filter(lora => 
        searchQuery === '' || 
        lora.toLowerCase().includes(searchQuery.toLowerCase())
      )
  })

  function handleLoraClick(lora: string) {
    onLoraSelect(lora)
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose()
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-label="Select LoRA models"
    tabindex="-1"
  >
    <!-- Modal content -->
    <div class="relative max-h-[80vh] w-full max-w-lg rounded-lg bg-white shadow-lg">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2 class="text-lg font-semibold text-gray-800">Add LoRA Model</h2>
        <button
          type="button"
          class="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          onclick={onClose}
          aria-label="Close modal"
        >
          <XMark class="h-5 w-5" />
        </button>
      </div>

      <!-- Search input -->
      <div class="border-b border-gray-200 p-4">
        <input
          type="text"
          placeholder="Search LoRA models..."
          bind:value={searchQuery}
          class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <!-- LoRA list -->
      <div class="max-h-96 overflow-y-auto p-2">
        {#if filteredLoras.length === 0}
          <div class="py-8 text-center text-gray-500">
            {searchQuery ? 'No LoRA models match your search' : 'No available LoRA models'}
          </div>
        {:else}
          <div class="flex flex-wrap gap-2">
            {#each filteredLoras as lora (lora)}
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md border border-purple-300 bg-purple-50 px-3 py-0.5 text-sm text-purple-800 hover:bg-purple-100 focus:bg-purple-100 focus:outline-none max-w-full cursor-pointer"
                onclick={() => handleLoraClick(lora)}
              >
                <span class="font-medium break-words min-w-0 flex-1" title={lora}>
                  {lora.endsWith('.safetensors') ? lora.slice(0, -12) : lora}
                </span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Footer info -->
      <div class="border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
        {filteredLoras.length} available models
      </div>
    </div>
  </div>
{/if}

<style>
  .max-h-96::-webkit-scrollbar {
    width: 6px;
  }

  .max-h-96::-webkit-scrollbar-track {
    background: #f7fafc;
    border-radius: 3px;
  }

  .max-h-96::-webkit-scrollbar-thumb {
    background: #cbd5e0;
    border-radius: 3px;
  }

  .max-h-96::-webkit-scrollbar-thumb:hover {
    background: #a0aec0;
  }
</style>
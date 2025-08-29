<script lang="ts">
  import TreeEdit from './TreeEdit.svelte'
  import { updateWildcardsFromText } from '../stores/tagsStore'

  interface Props {
    isOpen: boolean
  }

  let { isOpen = $bindable() }: Props = $props()

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      isOpen = false
    }
  }

  function handleClose() {
    isOpen = false
  }

  // Reference to child TreeEdit to load/get/mark saved
  let tree: { load: (t: string) => void; getYaml: () => string; markSaved: () => void } | null =
    $state(null)
  let hasUnsavedChanges = $state(false)

  // When dialog opens, load YAML from server and populate child
  $effect(() => {
    if (isOpen) {
      fetch('/api/wildcards')
        .then((res) => (res.ok ? res.text() : ''))
        .then((text) => {
          if (tree && typeof text === 'string') {
            tree.load(text)
          }
        })
        .catch((err) => console.error('Failed to load wildcards.yaml:', err))
    }
  })

  function onSave() {
    if (!tree) return
    const body = tree.getYaml()
    // Immediately reflect changes in combinedTags using the text we save
    // (avoids waiting for a subsequent fetch)
    updateWildcardsFromText(body)
    fetch('/api/wildcards', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to save')
        tree?.markSaved()
      })
      .catch((err) => console.error('Save failed:', err))
  }
</script>

{#if isOpen}
  <!-- Modal backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={handleBackdropClick}
    onkeydown={(e) => e.key === 'Escape' && handleClose()}
  >
    <!-- Modal content -->
    <div class="flex h-[700px] w-full max-w-5xl flex-col rounded-lg bg-white shadow-xl">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-gray-300 p-6">
        <h2 class="text-lg font-semibold text-gray-900">Wildcards Editor</h2>
        <button
          type="button"
          class="text-gray-400 transition-colors hover:text-gray-600"
          onclick={handleClose}
          aria-label="Close dialog"
        >
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            ></path>
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-auto p-6">
        <TreeEdit bind:this={tree} bind:hasUnsavedChanges />
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end gap-2 border-t border-gray-300 p-4">
        <button
          type="button"
          class="rounded-md bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:cursor-default disabled:opacity-50 disabled:hover:bg-blue-500 disabled:focus:ring-0"
          onclick={onSave}
          disabled={!hasUnsavedChanges}
        >
          Save
        </button>
        <button
          type="button"
          class="rounded-md bg-gray-200 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-300 focus:ring-2 focus:ring-gray-500 focus:outline-none"
          onclick={handleClose}
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}

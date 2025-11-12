<!-- Dialog component for managing tags with input and display -->
<script lang="ts">
  import TagDisplay from './TagDisplay.svelte'
  import type { CustomTag } from './types'

  interface Props {
    isOpen: boolean
    title: string
    tags: CustomTag[]
    onSave: (customTagName: string, originalTags: string[]) => void
    onCancel: () => void
  }

  let { isOpen = $bindable(), title, tags, onSave, onCancel }: Props = $props()

  let newTagInput = $state('')
  let dialogTags = $state<CustomTag[]>([...tags])

  // Update internal tags when props change
  $effect(() => {
    if (isOpen) {
      dialogTags = [...tags]
      newTagInput = ''
    }
  })

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSave()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      handleCancel()
    }
  }

  async function handleSave() {
    // Save as custom tag if user entered a name
    if (newTagInput.trim()) {
      const customTagName = newTagInput.trim()
      const currentDialogTagNames = dialogTags.map((tag) => tag.name) // Convert to string array

      // Pass the custom tag name and original tags to parent for processing
      onSave(customTagName, currentDialogTagNames)

      isOpen = false
    }
  }

  function handleCancel() {
    onCancel()
    isOpen = false
  }

  function handleBackdropClick(event: MouseEvent) {
    // Only close if clicked directly on the backdrop, not on child elements
    if (event.target === event.currentTarget) {
      handleCancel()
    }
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
    onkeydown={(e) => e.key === 'Escape' && handleCancel()}
  >
    <!-- Modal content -->
    <div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
      <!-- Header -->
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900">{title}</h2>
        <button
          type="button"
          class="text-gray-400 transition-colors hover:text-gray-600"
          onclick={handleCancel}
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

      <!-- New tag input -->
      <div class="mb-4">
        <label for="new-tag-input" class="mb-2 block text-left text-sm font-medium text-gray-700">
          Custom Tag Name (optional)
        </label>
        <input
          id="new-tag-input"
          type="text"
          bind:value={newTagInput}
          placeholder="Enter custom tag name to save..."
          class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          onkeydown={handleKeydown}
        />
      </div>

      <!-- Current tags display -->
      <div class="mb-6">
        <label for="dialog-tags" class="mb-2 block text-left text-sm font-medium text-gray-700"
          >Current Tags</label
        >
        <TagDisplay id="dialog-tags" bind:tags={dialogTags} />
      </div>

      <!-- Action buttons -->
      <div class="flex justify-end gap-3">
        <button
          type="button"
          onclick={handleCancel}
          class="rounded-md bg-gray-200 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-300 focus:ring-2 focus:ring-gray-500 focus:outline-none"
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={handleSave}
          class="rounded-md bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          Save
        </button>
      </div>
    </div>
  </div>
{/if}

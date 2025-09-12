<script lang="ts">
  interface Props {
    isOpen: boolean
  }

  let { isOpen = $bindable() }: Props = $props()

  function handleBackdropClick(event: MouseEvent) {
    // Only close if clicking exactly on the backdrop (not bubbled from children)
    if (event.target === event.currentTarget) {
      isOpen = false
    }
  }

  function handleClose() {
    isOpen = false
  }

  function openHuggingFace() {
    window.open('https://huggingface.co/models?pipeline_tag=text-to-image&sort=trending', '_blank')
  }

  function openCivitai() {
    window.open('https://civitai.com/models?type=Checkpoint', '_blank')
  }

  async function openCheckpointsFolder() {
    try {
      const response = await fetch('/api/open-folder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          folderPath: 'vendor/ComfyUI/models/checkpoints'
        })
      })

      if (response.ok) {
        console.log('Folder opened successfully')
      } else {
        const result = await response.json()
        console.warn('API returned error but folder may have opened:', result.error)
      }
    } catch (error) {
      console.warn('API call failed but this is expected:', error)
      // Don't call fallback since the folder likely opened anyway
    }
  }
</script>

{#if isOpen}
  <div
    class="bg-opacity-0 fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onclick={handleBackdropClick}
    onkeydown={(e) => e.key === 'Escape' && handleClose()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="no-checkpoints-title"
    tabindex="-1"
  >
    <div
      class="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800"
      role="document"
    >
      <div class="mb-4 flex items-center justify-between">
        <h2 id="no-checkpoints-title" class="text-xl font-semibold text-gray-900 dark:text-white">
          No Checkpoint Models Found
        </h2>
        <button
          type="button"
          class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          onclick={handleClose}
          aria-label="Close dialog"
        >
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div class="space-y-4">
        <p class="text-gray-700 dark:text-gray-300">
          No checkpoint models were found in ComfyUI. You need to download at least one checkpoint
          model to generate images.
        </p>

        <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
          <div class="mb-2 flex items-center justify-between">
            <p class="text-sm font-medium text-gray-900 dark:text-white">Installation Path:</p>
            <button
              type="button"
              class="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
              onclick={openCheckpointsFolder}
              title="Open folder"
            >
              <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              Open
            </button>
          </div>
          <code
            class="rounded bg-gray-100 px-2 py-1 text-sm text-gray-800 dark:bg-gray-600 dark:text-gray-200"
          >
            vendor/ComfyUI/models/checkpoints/
          </code>
        </div>

        <div>
          <p class="mb-3 text-sm font-medium text-gray-900 dark:text-white">
            Download models from:
          </p>
          <div class="flex gap-2">
            <button
              type="button"
              class="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              onclick={openHuggingFace}
            >
              🤗 Hugging Face
            </button>
            <button
              type="button"
              class="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
              onclick={openCivitai}
            >
              🎨 Civitai
            </button>
          </div>
        </div>

        <div
          class="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20"
        >
          <p class="text-sm text-amber-800 dark:text-amber-200">
            <strong>Next steps:</strong> After downloading a model file, place it in the checkpoints
            folder and click the refresh button (🔄) to reload the model list.
          </p>
        </div>
      </div>

      <div class="mt-6 flex justify-end">
        <button
          type="button"
          class="rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          onclick={handleClose}
        >
          Got it
        </button>
      </div>
    </div>
  </div>
{/if}

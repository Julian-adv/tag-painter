<script lang="ts">
  import TreeEdit from './TreeEdit.svelte'

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
        <h2 class="text-lg font-semibold text-gray-900">TreeEdit Test Dialog</h2>
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
        <TreeEdit />
      </div>
    </div>
  </div>
{/if}

<!-- Component for model and generation option controls -->
<script lang="ts">
  import { ArrowPath } from 'svelte-heros-v2'
  import { m } from '$lib/paraglide/messages'
  import { promptsData, updateCheckpoint } from '$lib/stores/promptsStore'

  interface Props {
    availableCheckpoints: string[]
    onRefreshModels: (event: MouseEvent) => void
    showToast: (type: 'info' | 'success' | 'error', message: string) => void
  }

  let { availableCheckpoints, onRefreshModels, showToast }: Props = $props()

  let isRotating = $state(false)

  async function handleRefreshClick(event: MouseEvent) {
    if (isRotating) return

    isRotating = true
    onRefreshModels(event)
    showToast('success', m['imageGenerator.modelsRefreshed']())

    // Reset rotation after animation completes
    setTimeout(() => {
      isRotating = false
    }, 900)
  }
</script>

<div class="flex flex-shrink-0 flex-col gap-1">
  <!-- Checkpoint Selector -->
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between gap-2">
      <label for="checkpoint" class="text-left text-sm font-bold text-black">
        {m['imageGenerator.checkpointLabel']()}
      </label>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-1 py-0.5 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        title={m['imageGenerator.reloadCheckpoints']()}
        onclick={handleRefreshClick}
        disabled={isRotating}
      >
        <ArrowPath class="h-3 w-3 {isRotating ? 'animate-spin' : ''}" />
      </button>
    </div>
    <select
      id="checkpoint"
      value={$promptsData.selectedCheckpoint || ''}
      onchange={(e) => updateCheckpoint((e.target as HTMLSelectElement).value)}
      class="box-border w-full rounded border border-gray-300 bg-white p-1 text-xs transition-colors duration-200 focus:border-green-500 focus:shadow-[0_0_0_2px_rgba(76,175,80,0.2)] focus:outline-none"
    >
      <option value="">{m['imageGenerator.selectCheckpoint']()}</option>
      {#each availableCheckpoints as checkpoint (checkpoint)}
        <option value={checkpoint}>{checkpoint}</option>
      {/each}
    </select>
  </div>
</div>

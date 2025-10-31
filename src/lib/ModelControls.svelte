<!-- Component for model and generation option controls -->
<script lang="ts">
  import { ArrowPath } from 'svelte-heros-v2'
  import { m } from '$lib/paraglide/messages'
  import { promptsData, updateCheckpoint, updateUpscale, updateFaceDetailer } from './stores/promptsStore'

  interface Props {
    availableCheckpoints: string[]
    onRefreshModels: (event: MouseEvent) => void
  }

  let { availableCheckpoints, onRefreshModels }: Props = $props()
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
        class="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-1 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
        title={m['imageGenerator.reloadCheckpoints']()}
        onclick={onRefreshModels}
      >
        <ArrowPath class="h-3 w-3" />
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

  <!-- Upscale Option -->
  <div class="flex flex-col gap-2">
    <label class="flex cursor-pointer flex-row items-center gap-2 text-xs font-normal">
      <input
        type="checkbox"
        checked={$promptsData.useUpscale}
        onchange={(e) => updateUpscale((e.target as HTMLInputElement).checked)}
        class="m-0 cursor-pointer accent-sky-600"
      />
      {m['imageGenerator.useUpscale']()}
    </label>
  </div>

  <!-- Face Detailer Option -->
  <div class="flex flex-col gap-2">
    <label class="flex cursor-pointer flex-row items-center gap-2 text-xs font-normal">
      <input
        type="checkbox"
        class="m-0 cursor-pointer accent-sky-600"
        checked={$promptsData.useFaceDetailer}
        onchange={(e) => updateFaceDetailer((e.target as HTMLInputElement).checked)}
      />
      {m['imageGenerator.useFaceDetailer']()}
    </label>
  </div>
</div>

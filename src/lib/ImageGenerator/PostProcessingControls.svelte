<!-- Component for post-processing controls (refine, face detailer, film grain) -->
<script lang="ts">
  import { m } from '$lib/paraglide/messages'

  interface Props {
    enableRefine: boolean
    enableFaceDetailer: boolean
    useFilmGrain: boolean
    refineCheckpoint: string
    faceDetailerCheckpoint: string
  }

  let {
    enableRefine = $bindable(),
    enableFaceDetailer = $bindable(),
    useFilmGrain = $bindable(),
    refineCheckpoint,
    faceDetailerCheckpoint
  }: Props = $props()
</script>

<div class="flex flex-shrink-0 flex-col gap-2">
  <!-- Refine and Face Detailer Checkboxes -->
  <div class="flex flex-col gap-2">
    <label class="flex cursor-pointer flex-row items-center gap-2 text-xs font-normal">
      <input
        type="checkbox"
        bind:checked={enableRefine}
        class="m-0 cursor-pointer accent-sky-600"
      />
      <span>
        {m['postProcessing.refineMode']()}
        {#if refineCheckpoint}
          <span class="text-gray-500">({refineCheckpoint})</span>
        {/if}
      </span>
    </label>

    <label class="flex cursor-pointer flex-row items-center gap-2 text-xs font-normal">
      <input
        type="checkbox"
        bind:checked={enableFaceDetailer}
        class="m-0 cursor-pointer accent-sky-600"
      />
      <span>
        {m['postProcessing.faceDetailer']()}
        {#if faceDetailerCheckpoint}
          <span class="text-gray-500">({faceDetailerCheckpoint})</span>
        {/if}
      </span>
    </label>

    <label class="flex cursor-pointer flex-row items-center gap-2 text-xs font-normal">
      <input
        type="checkbox"
        bind:checked={useFilmGrain}
        class="m-0 cursor-pointer accent-sky-600"
      />
      {m['postProcessing.useFilmGrain']()}
    </label>
  </div>
</div>

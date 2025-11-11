<!-- Component for post-processing controls (refine, face detailer, film grain) -->
<script lang="ts">
  import { RefineMode, FaceDetailerMode } from '$lib/types'
  import type {
    RefineMode as RefineModeType,
    FaceDetailerMode as FaceDetailerModeType
  } from '$lib/types'
  import CustomSelect from '$lib/CustomSelect.svelte'
  import { m } from '$lib/paraglide/messages'

  interface Props {
    selectedRefineMode: RefineModeType
    selectedFaceDetailerMode: FaceDetailerModeType
    useFilmGrain: boolean
  }

  let {
    selectedRefineMode = $bindable(),
    selectedFaceDetailerMode = $bindable(),
    useFilmGrain = $bindable()
  }: Props = $props()

  const refineModeOptions = [
    { value: String(RefineMode.none), label: 'None' },
    { value: String(RefineMode.upscale_only), label: 'Upscale Only' },
    { value: String(RefineMode.refine), label: 'Refine' },
    { value: String(RefineMode.refine_sdxl), label: 'Refine SDXL' }
  ]

  const faceDetailerModeOptions = [
    { value: String(FaceDetailerMode.none), label: 'None' },
    { value: String(FaceDetailerMode.face_detail), label: 'Face Detail' },
    { value: String(FaceDetailerMode.face_detail_sdxl), label: 'Face Detail SDXL' }
  ]

  let refineModeString = $state(String(selectedRefineMode))
  let faceDetailerModeString = $state(String(selectedFaceDetailerMode))

  $effect(() => {
    selectedRefineMode = Number(refineModeString) as RefineModeType
  })

  $effect(() => {
    selectedFaceDetailerMode = Number(faceDetailerModeString) as FaceDetailerModeType
  })

  $effect(() => {
    refineModeString = String(selectedRefineMode)
  })

  $effect(() => {
    faceDetailerModeString = String(selectedFaceDetailerMode)
  })
</script>

<div class="flex flex-shrink-0 flex-col gap-2">
  <!-- Refine and Face Detailer Mode Selectors - Grid Layout -->
  <div class="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-x-2 gap-y-2">
    <label for="refine-mode" class="text-xs font-medium text-gray-700">
      {m['postProcessing.refineMode']()}
    </label>
    <CustomSelect
      id="refine-mode"
      bind:value={refineModeString}
      options={refineModeOptions}
      class="text-xs"
    />

    <label for="face-detailer-mode" class="text-xs font-medium text-gray-700">
      {m['postProcessing.faceDetailer']()}
    </label>
    <CustomSelect
      id="face-detailer-mode"
      bind:value={faceDetailerModeString}
      options={faceDetailerModeOptions}
      class="text-xs"
    />
  </div>

  <!-- Film Grain Option -->
  <div class="flex flex-col gap-2">
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

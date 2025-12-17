<script lang="ts">
  import type { FaceDetailerSettings } from '$lib/types'
  import SamplerSelector from '$lib/SamplerSelector.svelte'
  import SchedulerSelector from '$lib/SchedulerSelector.svelte'
  import CustomSelect from '$lib/CustomSelect.svelte'
  import { m } from '$lib/paraglide/messages'

  interface Props {
    faceDetailerSettings: FaceDetailerSettings
    availableCheckpoints: string[]
    availableVaes: string[]
  }

  let {
    faceDetailerSettings = $bindable(),
    availableCheckpoints,
    availableVaes
  }: Props = $props()
</script>

<div
  class="section-title"
  style="grid-column: 1 / 4; font-weight: 600; color: #333; text-align: left; justify-self: start; margin-top: 16px;"
>
  {m['settingsDialog.faceDetailerTitle']()}
</div>

<label for="fd-checkpoint" class="two-col-label"
  >{m['settingsDialog.faceDetailerCheckpoint']()}</label
>
<CustomSelect
  id="fd-checkpoint"
  class="two-col-input-wide"
  bind:value={faceDetailerSettings.checkpoint}
  options={availableCheckpoints.map((cp) => ({ value: cp, label: cp }))}
/>

<label for="fd-model-type" class="two-col-label"
  >{m['settingsDialog.faceDetailerModelType']()}</label
>
<CustomSelect
  id="fd-model-type"
  class="two-col-input"
  bind:value={faceDetailerSettings.modelType}
  options={[
    { value: 'sdxl', label: 'SDXL' },
    { value: 'qwen', label: 'Qwen' },
    { value: 'chroma', label: 'Chroma' }
  ]}
/>

<label for="fd-steps" class="two-col-label">{m['settingsDialog.faceDetailerSteps']()}</label>
<input
  id="fd-steps"
  type="number"
  bind:value={faceDetailerSettings.steps}
  min="1"
  max="100"
  step="1"
  class="two-col-input"
/>

<label for="fd-cfg" class="two-col-label">{m['settingsDialog.faceDetailerCfgScale']()}</label>
<input
  id="fd-cfg"
  type="number"
  bind:value={faceDetailerSettings.cfgScale}
  min="1"
  max="20"
  step="0.5"
  class="two-col-input"
/>

<label for="fd-sampler" class="two-col-label">{m['settingsDialog.faceDetailerSampler']()}</label>
<SamplerSelector id="fd-sampler" bind:value={faceDetailerSettings.sampler} class="two-col-input" />

<label for="fd-scheduler" class="two-col-label">{m['settingsDialog.faceDetailerScheduler']()}</label
>
<SchedulerSelector
  id="fd-scheduler"
  bind:value={faceDetailerSettings.scheduler}
  class="two-col-input"
/>

<label for="fd-denoise" class="two-col-label">{m['settingsDialog.faceDetailerDenoise']()}</label>
<input
  id="fd-denoise"
  type="number"
  bind:value={faceDetailerSettings.denoise}
  min="0"
  max="1"
  step="0.05"
  class="two-col-input"
/>

<label for="fd-vae" class="two-col-label">{m['settingsDialog.faceDetailerVae']()}</label>
<CustomSelect
  id="fd-vae"
  bind:value={faceDetailerSettings.selectedVae}
  class="two-col-input-wide"
  options={[
    { value: '__embedded__', label: m['settingsDialog.useEmbeddedVae']() },
    ...availableVaes.map((vae) => ({ value: vae, label: vae }))
  ]}
/>

<style>
  .two-col-label {
    grid-column: 1;
    text-align: right;
    justify-self: end;
    font-weight: 500;
    color: #333;
    font-size: 13px;
  }

  .two-col-input {
    grid-column: 2;
    padding: 6px 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 13px;
    width: 100%;
  }

  .two-col-input:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }

  :global(.two-col-input-wide) {
    grid-column: 2 / 4;
  }
</style>

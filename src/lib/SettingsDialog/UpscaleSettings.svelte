<script lang="ts">
  import type { UpscaleSettings } from '$lib/types'
  import SamplerSelector from '$lib/SamplerSelector.svelte'
  import SchedulerSelector from '$lib/SchedulerSelector.svelte'
  import CustomSelect from '$lib/CustomSelect.svelte'
  import { m } from '$lib/paraglide/messages'

  interface Props {
    upscaleSettings: UpscaleSettings
    availableCheckpoints: string[]
    availableVaes: string[]
  }

  let { upscaleSettings = $bindable(), availableCheckpoints, availableVaes }: Props = $props()
</script>

<div
  class="section-title"
  style="grid-column: 1 / 4; font-weight: 600; color: #333; text-align: left; justify-self: start; margin-top: 16px;"
>
  {m['settingsDialog.upscaleTitle']()}
</div>

<label for="us-checkpoint" class="two-col-label">{m['settingsDialog.upscaleCheckpoint']()}</label>
<CustomSelect
  id="us-checkpoint"
  class="two-col-input-wide"
  bind:value={upscaleSettings.checkpoint}
  options={availableCheckpoints.map((cp) => ({ value: cp, label: cp }))}
/>

<label for="us-model-type" class="two-col-label">{m['settingsDialog.upscaleModelType']()}</label>
<CustomSelect
  id="us-model-type"
  class="two-col-input"
  bind:value={upscaleSettings.modelType}
  options={[
    { value: 'sdxl', label: 'SDXL' },
    { value: 'qwen', label: 'Qwen' },
    { value: 'chroma', label: 'Chroma' },
    { value: 'z_image', label: 'Z Image' }
  ]}
/>

<label for="us-scale" class="two-col-label">{m['settingsDialog.upscaleScale']()}</label>
<input
  id="us-scale"
  type="number"
  bind:value={upscaleSettings.scale}
  min="1.0"
  max="4.0"
  step="0.1"
  class="two-col-input"
/>

<label for="us-steps" class="two-col-label">{m['settingsDialog.upscaleSteps']()}</label>
<input
  id="us-steps"
  type="number"
  bind:value={upscaleSettings.steps}
  min="1"
  max="150"
  class="two-col-input"
/>

<label for="us-cfg" class="two-col-label">{m['settingsDialog.upscaleCfgScale']()}</label>
<input
  id="us-cfg"
  type="number"
  bind:value={upscaleSettings.cfgScale}
  min="1"
  max="20"
  step="0.1"
  class="two-col-input"
/>

<label for="us-sampler" class="two-col-label">{m['settingsDialog.upscaleSampler']()}</label>
<SamplerSelector
  id="us-sampler"
  bind:value={upscaleSettings.sampler}
  class="two-col-input-wide"
/>

<label for="us-scheduler" class="two-col-label">{m['settingsDialog.upscaleScheduler']()}</label>
<SchedulerSelector
  id="us-scheduler"
  bind:value={upscaleSettings.scheduler}
  class="two-col-input-wide"
/>

<label for="us-denoise" class="two-col-label">{m['settingsDialog.upscaleDenoise']()}</label>
<input
  id="us-denoise"
  type="number"
  bind:value={upscaleSettings.denoise}
  min="0"
  max="1"
  step="0.05"
  class="two-col-input"
/>

<label for="us-vae" class="two-col-label">{m['settingsDialog.upscaleVae']()}</label>
<CustomSelect
  id="us-vae"
  bind:value={upscaleSettings.selectedVae}
  class="two-col-input-wide"
  options={[
    { value: '__embedded__', label: m['settingsDialog.useEmbeddedVae']() },
    ...availableVaes.map((vae) => ({ value: vae, label: vae }))
  ]}
/>

<label for="us-save-upscale" class="two-col-label">{m['settingsDialog.saveUpscaleImages']()}</label>
<div class="two-col-input checkbox-container">
  <input id="us-save-upscale" type="checkbox" bind:checked={upscaleSettings.saveUpscaleImages} />
</div>

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

  .checkbox-container {
    display: flex;
    align-items: center;
  }

  .checkbox-container input[type='checkbox'] {
    width: auto;
    cursor: pointer;
  }
</style>

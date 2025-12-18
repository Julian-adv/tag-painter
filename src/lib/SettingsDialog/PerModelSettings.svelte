<script lang="ts">
  import type { ModelSettings, LoraWithWeight, LoraPreset } from '$lib/types'
  import LoraSelector from './LoraSelector.svelte'
  import AutoCompleteTextarea from '$lib/AutoCompleteTextarea.svelte'
  import SamplerSelector from '$lib/SamplerSelector.svelte'
  import SchedulerSelector from '$lib/SchedulerSelector.svelte'
  import CustomSelect from '$lib/CustomSelect.svelte'
  import { m } from '$lib/paraglide/messages'

  interface Props {
    modelSettings: ModelSettings
    availableVaes: string[]
    availableWorkflows: string[]
    loraPresets: LoraPreset[]
    onLoraPresetsChange: (presets: LoraPreset[]) => void
  }

  let {
    modelSettings = $bindable(),
    availableVaes,
    availableWorkflows,
    loraPresets,
    onLoraPresetsChange
  }: Props = $props()
</script>

<label for="pm-model-type" class="two-col-label">{m['settingsDialog.modelType']()}</label>
<CustomSelect
  id="pm-model-type"
  class="two-col-input"
  bind:value={modelSettings.modelType}
  options={[
    { value: 'sdxl', label: 'SDXL' },
    { value: 'qwen', label: 'Qwen' },
    { value: 'qwen_nunchaku', label: 'Qwen Nunchaku' },
    { value: 'chroma', label: 'Chroma' },
    { value: 'flux1_krea', label: 'Flux1 Krea' },
    { value: 'z_image', label: 'Z Image' }
  ]}
/>

<label for="pm-cfg" class="two-col-label">{m['settingsDialog.cfgScale']()}</label>
<input
  id="pm-cfg"
  type="number"
  bind:value={modelSettings.cfgScale}
  min="1"
  max="20"
  step="0.5"
  class="two-col-input"
/>

<label for="pm-steps" class="two-col-label">{m['settingsDialog.steps']()}</label>
<input
  id="pm-steps"
  type="number"
  bind:value={modelSettings.steps}
  min="1"
  max="100"
  step="1"
  class="two-col-input"
/>

<label for="pm-sampler" class="two-col-label">{m['settingsDialog.sampler']()}</label>
<SamplerSelector id="pm-sampler" bind:value={modelSettings.sampler} class="two-col-input" />

<label for="pm-scheduler" class="two-col-label">{m['settingsDialog.scheduler']()}</label>
<SchedulerSelector id="pm-scheduler" bind:value={modelSettings.scheduler} class="two-col-input" />

<label for="pm-vae" class="two-col-label">{m['settingsDialog.vae']()}</label>
<CustomSelect
  id="pm-vae"
  bind:value={modelSettings.selectedVae}
  class="two-col-input-wide"
  options={[
    { value: '__embedded__', label: m['settingsDialog.useEmbeddedVae']() },
    ...availableVaes.map((vae) => ({ value: vae, label: vae }))
  ]}
/>

<label for="pm-clipskip" class="two-col-label">{m['settingsDialog.clipSkip']()}</label>
<input
  id="pm-clipskip"
  type="number"
  bind:value={modelSettings.clipSkip}
  min="1"
  max="12"
  step="1"
  class="two-col-input"
/>

<label for="pm-workflow" class="two-col-label">Workflow</label>
<CustomSelect
  id="pm-workflow"
  value={modelSettings.customWorkflowPath || ''}
  class="two-col-input-wide"
  options={[
    { value: '', label: 'None (Use global or default)' },
    ...availableWorkflows.map((w) => ({ value: w, label: w }))
  ]}
  onchange={(v) => (modelSettings.customWorkflowPath = v)}
/>

<label for="pm-wildcards-file" class="two-col-label">Wildcards File</label>
<input
  id="pm-wildcards-file"
  type="text"
  bind:value={modelSettings.wildcardsFile}
  placeholder="wildcards.yaml"
  class="two-col-input-wide"
/>

<label for="pm-quality" class="two-col-label">{m['settingsDialog.qualityPrefix']()}</label>
<div class="two-col-input-wide">
  <AutoCompleteTextarea
    id="pm-quality"
    value={modelSettings.qualityPrefix}
    onValueChange={(v) => (modelSettings.qualityPrefix = v)}
    placeholder={m['settingsDialog.qualityPlaceholder']()}
    rows={3}
  />
</div>

<label for="pm-negative" class="two-col-label">{m['settingsDialog.negativePrefix']()}</label>
<div class="two-col-input-wide">
  <AutoCompleteTextarea
    id="pm-negative"
    value={modelSettings.negativePrefix}
    onValueChange={(v) => (modelSettings.negativePrefix = v)}
    placeholder={m['settingsDialog.negativePlaceholder']()}
    rows={3}
  />
</div>

<label for="lora-selector" class="two-col-label">
  {m['settingsDialog.loraModels']()}
</label>
<div class="two-col-input-wide lora-embed">
  <LoraSelector
    selectedLoras={modelSettings.loras as LoraWithWeight[]}
    onLoraChange={(loras) => (modelSettings.loras = loras)}
    presets={loraPresets}
    onPresetsChange={onLoraPresetsChange}
  />
</div>

<label for="pm-save-base" class="two-col-label">{m['settingsDialog.saveBaseImages']()}</label>
<div class="two-col-input checkbox-container">
  <input id="pm-save-base" type="checkbox" bind:checked={modelSettings.saveBaseImages} />
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

  .two-col-input-wide {
    grid-column: 2 / 4;
  }

  /* Hide embedded LoRA header inside settings */
  .lora-embed :global(.lora-selector h3) {
    display: none;
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

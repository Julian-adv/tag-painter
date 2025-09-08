<script lang="ts">
  import type { Settings } from '$lib/types'
  import { fetchVaeModels } from './utils/comfyui'

  interface Props {
    show: boolean
    settings: Settings
    onClose: () => void
    onSave: (settings: Settings) => void
  }

  let { show, settings, onClose, onSave }: Props = $props()

  // Local copy of settings for editing
  let localSettings: Settings = $state({
    imageWidth: settings.imageWidth,
    imageHeight: settings.imageHeight,
    cfgScale: settings.cfgScale,
    steps: settings.steps,
    seed: settings.seed,
    sampler: settings.sampler,
    outputDirectory: settings.outputDirectory,
    selectedVae: settings.selectedVae
  })

  // Update local settings when props change
  $effect(() => {
    if (show) {
      localSettings = {
        imageWidth: settings.imageWidth,
        imageHeight: settings.imageHeight,
        cfgScale: settings.cfgScale,
        steps: settings.steps,
        seed: settings.seed,
        sampler: settings.sampler,
        outputDirectory: settings.outputDirectory,
        selectedVae: settings.selectedVae
      }
    }
  })

  let availableVaes: string[] = $state([])

  $effect(() => {
    if (show) {
      fetchVaeModels()
        .then((vaes) => {
          availableVaes = vaes || []
        })
        .catch(() => {
          availableVaes = []
        })
    }
  })

  function handleSave() {
    onSave(localSettings)
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose()
    }
  }
</script>

{#if show}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dialog-overlay" onclick={onClose} onkeydown={handleKeydown}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="dialog-content" onclick={(e) => e.stopPropagation()}>
      <div class="dialog-header">
        <h3>Settings</h3>
        <button class="close-button" onclick={onClose}>×</button>
      </div>

      <div class="dialog-body">
        <label for="image-width" class="two-col-label">Image Width:</label>
        <input
          id="image-width"
          type="number"
          bind:value={localSettings.imageWidth}
          min="256"
          max="2048"
          step="64"
          class="two-col-input"
        />

        <label for="image-height" class="two-col-label">Image Height:</label>
        <input
          id="image-height"
          type="number"
          bind:value={localSettings.imageHeight}
          min="256"
          max="2048"
          step="64"
          class="two-col-input"
        />

        <label for="cfg-scale" class="two-col-label">CFG Scale:</label>
        <input
          id="cfg-scale"
          type="number"
          bind:value={localSettings.cfgScale}
          min="1"
          max="20"
          step="0.5"
          class="two-col-input"
        />

        <label for="steps" class="two-col-label">Steps:</label>
        <input
          id="steps"
          type="number"
          bind:value={localSettings.steps}
          min="1"
          max="100"
          step="1"
          class="two-col-input"
        />

        <label for="seed" class="two-col-label">Seed (-1 for random):</label>
        <input
          id="seed"
          type="number"
          bind:value={localSettings.seed}
          min="-1"
          max="999999999"
          step="1"
          class="two-col-input"
        />

      <label for="sampler" class="two-col-label">Sampler:</label>
      <select id="sampler" bind:value={localSettings.sampler} class="two-col-input">
        <option value="euler_ancestral">Euler Ancestral</option>
        <option value="euler">Euler</option>
        <option value="dpmpp_2m">DPM++ 2M</option>
        <option value="dpmpp_sde">DPM++ SDE</option>
        <option value="ddim">DDIM</option>
      </select>

      <label for="vae" class="two-col-label">VAE:</label>
      <select id="vae" bind:value={localSettings.selectedVae} class="two-col-input">
        <option value="__embedded__">Use checkpoint's embedded VAE (default)</option>
        {#each availableVaes as vae (vae)}
          <option value={vae}>{vae}</option>
        {/each}
      </select>

        <label for="output-directory" class="output-dir-label">Output Directory:</label>
        <input
          id="output-directory"
          type="text"
          bind:value={localSettings.outputDirectory}
          placeholder="/path/to/output/directory"
          class="output-dir-input"
        />
      </div>

      <div class="dialog-footer">
        <button onclick={onClose} class="secondary-button">Cancel</button>
        <button onclick={handleSave} class="primary-button">Save</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Dialog Styles */
  .dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  }

  .dialog-content {
    background: white;
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
    max-width: 600px;
    width: 90%;
    max-height: 80vh;
    overflow: hidden;
  }

  .dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 20px 10px 20px;
    border-bottom: 1px solid #eee;
  }

  .dialog-header h3 {
    margin: 0;
    font-size: 1.25rem;
    color: #333;
  }

  .close-button {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #666;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-button:hover {
    background-color: #f5f5f5;
    border-radius: 50%;
  }

  .dialog-body {
    display: grid;
    grid-template-columns: auto 1fr 1fr;
    gap: 15px 20px;
    padding: 20px;
    max-height: 50vh;
    overflow-y: auto;
    align-items: center;
  }

  .dialog-body label {
    font-weight: 500;
    color: #333;
    font-size: 14px;
    text-align: right;
  }

  .dialog-body input,
  .dialog-body select {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
    width: 100%;
  }

  .dialog-body input:focus,
  .dialog-body select:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }

  .two-col-label {
    grid-column: 1;
    text-align: right;
    justify-self: end;
  }

  .two-col-input {
    grid-column: 2;
  }

  .output-dir-label {
    grid-column: 1;
    text-align: right;
    justify-self: end;
    margin-top: 10px;
  }

  .output-dir-input {
    grid-column: 2 / 4;
    margin-top: 10px;
  }

  .dialog-footer {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    padding: 15px 20px 20px 20px;
    border-top: 1px solid #eee;
  }

  .primary-button {
    background-color: #007bff;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  }

  .primary-button:hover {
    background-color: #0056b3;
  }

  .secondary-button {
    background-color: #6c757d;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  }

  .secondary-button:hover {
    background-color: #545b62;
  }
</style>

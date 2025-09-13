<script lang="ts">
  import type { Settings, LoraWithWeight } from '$lib/types'
  import { fetchVaeModels, fetchCheckpoints } from './utils/comfyui'
  import LoraSelector from './LoraSelector.svelte'
  import { promptsData } from './stores/promptsStore'
  import AutoCompleteTextarea from './AutoCompleteTextarea.svelte'

  interface Props {
    show: boolean
    settings: Settings
    onClose: () => void
    onSave: (settings: Settings) => void
    initialFocus: 'quality' | 'negative' | null
  }

  let { show, settings, onClose, onSave, initialFocus }: Props = $props()

  // Local copy of settings for editing
  let localSettings: Settings = $state({
    imageWidth: settings.imageWidth,
    imageHeight: settings.imageHeight,
    cfgScale: settings.cfgScale,
    steps: settings.steps,
    seed: settings.seed,
    sampler: settings.sampler,
    outputDirectory: settings.outputDirectory,
    selectedVae: settings.selectedVae,
    clipSkip: settings.clipSkip,
    perModel: settings.perModel || {}
  })

  // Track original state to enable/disable Save when changed
  // Initialize with a neutral placeholder; set real baseline when dialog opens
  let originalLocalSettings: Settings = $state({
    imageWidth: 0,
    imageHeight: 0,
    cfgScale: 0,
    steps: 0,
    seed: 0,
    sampler: '',
    outputDirectory: '',
    selectedVae: '',
    clipSkip: 0,
    perModel: {}
  })
  let hasUnsavedChanges: boolean = $state(false)
  let sessionInitialized: boolean = $state(false)

  function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj))
  }
  function deepEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
  }

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
        selectedVae: settings.selectedVae,
        clipSkip: settings.clipSkip,
        perModel: settings.perModel || {}
      }
      // Reset session init so we can capture a fresh baseline below
      sessionInitialized = false
    }
  })

  // When dialog opens, ensure 'Default' per-model entry exists for initial render
  $effect(() => {
    if (show) {
      const hasDefault = !!(localSettings.perModel && localSettings.perModel['Default'])
      if (!hasDefault) {
        localSettings.perModel = {
          ...(localSettings.perModel || {}),
          Default: {
            qualityPrefix: '',
            negativePrefix: '',
            loras: [],
            cfgScale: localSettings.cfgScale,
            steps: localSettings.steps,
            sampler: localSettings.sampler,
            selectedVae: localSettings.selectedVae,
            clipSkip: localSettings.clipSkip
          }
        }
      }
    }
  })

  // Initialize baseline once per open session
  $effect(() => {
    if (show && !sessionInitialized) {
      // Ensure we have the 'Default' entry before snapshot
      ensureModelEntry('Default')
      // If dialog was opened with a target focus from TagZones,
      // ensure the selected model entry exists as well so the field renders.
      let currentSelected: string | null = null
      promptsData.subscribe((d) => (currentSelected = d.selectedCheckpoint || null))()
      const keyToEnsure = currentSelected || 'Default'
      if (initialFocus) {
        ensureModelEntry(keyToEnsure)
        selectedModelKey = keyToEnsure
      }
      originalLocalSettings = deepClone(localSettings)
      hasUnsavedChanges = false
      sessionInitialized = true
    }
    if (!show && sessionInitialized) {
      sessionInitialized = false
      hasUnsavedChanges = false
    }
  })

  let availableVaes: string[] = $state([])
  let availableCheckpoints: string[] = $state([])
  let selectedModelKey: string = $state('Default')

  function ensureModelEntry(key: string) {
    if (!localSettings.perModel[key]) {
      localSettings.perModel[key] = {
        qualityPrefix: '',
        negativePrefix: '',
        loras: [],
        cfgScale: localSettings.cfgScale,
        steps: localSettings.steps,
        sampler: localSettings.sampler,
        selectedVae: localSettings.selectedVae,
        clipSkip: localSettings.clipSkip
      }
    }
  }

  // Create per-model entry only on demand (via dropdown onchange)

  $effect(() => {
    if (show) {
      fetchVaeModels()
        .then((vaes) => {
          availableVaes = vaes || []
        })
        .catch(() => {
          availableVaes = []
        })
      fetchCheckpoints()
        .then((cps) => {
          availableCheckpoints = ['Default', ...(cps || [])]
        })
        .catch(() => {
          availableCheckpoints = ['Default']
        })
      // Initialize selected model key
      if (!selectedModelKey) selectedModelKey = 'Default'
    }
  })

  // When dialog opens, select current checkpoint from prompts store
  $effect(() => {
    if (show) {
      let currentSelected: string | null = null
      promptsData.subscribe((d) => (currentSelected = d.selectedCheckpoint || null))()
      selectedModelKey = currentSelected || 'Default'
    }
  })

  // Ensure model entry exists whenever selectedModelKey changes
  $effect(() => {
    if (show && selectedModelKey) {
      ensureModelEntry(selectedModelKey)
    }
  })

  // Focus requested field when dialog opens or when initialFocus changes
  $effect(() => {
    if (show) {
      const id =
        initialFocus === 'quality' ? 'pm-quality' : initialFocus === 'negative' ? 'pm-negative' : ''
      if (id) {
        setTimeout(() => {
          const el = document.getElementById(id) as HTMLTextAreaElement | null
          el?.focus()
        }, 0)
      }
    }
  })

  // Detect changes to enable/disable Save
  $effect(() => {
    if (show && sessionInitialized) {
      hasUnsavedChanges = !deepEqual(localSettings, originalLocalSettings)
    }
  })

  function handleSave() {
    onSave(localSettings)
    // Update baseline immediately so button disables if dialog remains open
    originalLocalSettings = deepClone(localSettings)
    hasUnsavedChanges = false
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
        <!-- Global settings -->
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

        <!-- Output directory remains global -->
        <label for="output-directory" class="output-dir-label">Output Directory:</label>
        <input
          id="output-directory"
          type="text"
          bind:value={localSettings.outputDirectory}
          placeholder="/path/to/output/directory"
          class="output-dir-input"
        />

        <!-- Per-model overrides -->
        <div class="section-spacer" style="grid-column: 1 / 4; height: 10px;"></div>
        <div
          class="section-title"
          style="grid-column: 1 / 4; font-weight: 600; color: #333; text-align: left; justify-self: start;"
        >
          Per-Model Overrides
        </div>

        <label for="model-key" class="two-col-label">Model:</label>
        <select
          id="model-key"
          class="two-col-input"
          bind:value={selectedModelKey}
          onchange={() => ensureModelEntry(selectedModelKey)}
        >
          {#each availableCheckpoints as cp (cp)}
            <option value={cp}>{cp}</option>
          {/each}
        </select>

        {#if localSettings.perModel[selectedModelKey]}
          <label for="pm-cfg" class="two-col-label">CFG Scale:</label>
          <input
            id="pm-cfg"
            type="number"
            bind:value={localSettings.perModel[selectedModelKey].cfgScale}
            min="1"
            max="20"
            step="0.5"
            class="two-col-input"
          />

          <label for="pm-steps" class="two-col-label">Steps:</label>
          <input
            id="pm-steps"
            type="number"
            bind:value={localSettings.perModel[selectedModelKey].steps}
            min="1"
            max="100"
            step="1"
            class="two-col-input"
          />

          <label for="pm-sampler" class="two-col-label">Sampler:</label>
          <select
            id="pm-sampler"
            bind:value={localSettings.perModel[selectedModelKey].sampler}
            class="two-col-input"
          >
            <option value="euler_ancestral">Euler Ancestral</option>
            <option value="euler">Euler</option>
            <option value="dpmpp_2m">DPM++ 2M</option>
            <option value="dpmpp_sde">DPM++ SDE</option>
            <option value="ddim">DDIM</option>
          </select>

          <label for="pm-vae" class="two-col-label">VAE:</label>
          <select
            id="pm-vae"
            bind:value={localSettings.perModel[selectedModelKey].selectedVae}
            class="two-col-input-wide"
          >
            <option value="__embedded__">Use checkpoint's embedded VAE (default)</option>
            {#each availableVaes as vae (vae)}
              <option value={vae}>{vae}</option>
            {/each}
          </select>

          <label for="pm-clipskip" class="two-col-label">CLIP Skip:</label>
          <input
            id="pm-clipskip"
            type="number"
            bind:value={localSettings.perModel[selectedModelKey].clipSkip}
            min="1"
            max="12"
            step="1"
            class="two-col-input"
          />

          <label for="pm-quality" class="two-col-label">Quality Prefix:</label>
          <div class="two-col-input-wide">
            <AutoCompleteTextarea
              id="pm-quality"
              value={localSettings.perModel[selectedModelKey].qualityPrefix}
              onValueChange={(v) => (localSettings.perModel[selectedModelKey].qualityPrefix = v)}
              placeholder="e.g., masterwork, high quality"
              rows={3}
            />
          </div>

          <label for="pm-negative" class="two-col-label">Negative Prefix:</label>
          <div class="two-col-input-wide">
            <AutoCompleteTextarea
              id="pm-negative"
              value={localSettings.perModel[selectedModelKey].negativePrefix}
              onValueChange={(v) => (localSettings.perModel[selectedModelKey].negativePrefix = v)}
              placeholder="e.g., lowres, bad anatomy"
              rows={3}
            />
          </div>

          <div class="two-col-label" style="text-align: right;">LoRA Models:</div>
          <div class="two-col-input-wide lora-embed">
            <LoraSelector
              selectedLoras={localSettings.perModel[selectedModelKey].loras as LoraWithWeight[]}
              onLoraChange={(loras) => (localSettings.perModel[selectedModelKey].loras = loras)}
            />
          </div>
        {/if}
      </div>

      <div class="dialog-footer">
        <button
          type="button"
          class={(hasUnsavedChanges
            ? 'bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-500 '
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300 focus:ring-gray-500 disabled:cursor-default ') +
            'rounded-md px-4 py-2 transition-colors focus:ring-2 focus:outline-none'}
          onclick={handleSave}
          disabled={!hasUnsavedChanges}
        >
          Save
        </button>
        <button
          type="button"
          class="rounded-md bg-gray-200 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-300 focus:ring-2 focus:ring-gray-500 focus:outline-none"
          onclick={onClose}
        >
          Close
        </button>
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
    padding: 12px 16px 8px 16px;
    border-bottom: 1px solid #eee;
  }

  .dialog-header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #333;
  }

  .close-button {
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    color: #666;
    padding: 0;
    width: 28px;
    height: 28px;
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
    gap: 10px 16px;
    padding: 12px 16px;
    max-height: 50vh;
    overflow-y: auto;
    align-items: center;
  }

  .dialog-body label {
    font-weight: 500;
    color: #333;
    font-size: 13px;
    text-align: right;
  }

  .dialog-body input,
  .dialog-body select {
    padding: 6px 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 13px;
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

  .two-col-input-wide {
    grid-column: 2 / 4;
  }

  .output-dir-label {
    grid-column: 1;
    text-align: right;
    justify-self: end;
    margin-top: 6px;
  }

  .output-dir-input {
    grid-column: 2 / 4;
    margin-top: 6px;
  }

  .dialog-footer {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    padding: 12px 16px 14px 16px;
    border-top: 1px solid #eee;
  }

  .primary-button {
    background-color: #007bff;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }

  .primary-button:hover {
    background-color: #0056b3;
  }

  .secondary-button {
    background-color: #6c757d;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }

  .secondary-button:hover {
    background-color: #545b62;
  }

  /* Hide embedded LoRA header inside settings */
  .lora-embed :global(.lora-selector h3) {
    display: none;
  }
</style>

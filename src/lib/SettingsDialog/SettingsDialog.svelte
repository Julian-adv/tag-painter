<script lang="ts">
  import type { Settings, ModelType, LoraPreset } from '$lib/types'
  import { fetchVaeModels, fetchCheckpoints } from '$lib/generation/comfyui'
  import { promptsData } from '$lib/stores/promptsStore'
  import CustomSelect from '$lib/CustomSelect.svelte'
  import { m } from '$lib/paraglide/messages'
  import { locales, baseLocale } from '$lib/paraglide/runtime.js'
  import {
    DEFAULT_FACE_DETAILER_SETTINGS,
    DEFAULT_UPSCALE_SETTINGS,
    MODEL_TYPE_DEFAULTS
  } from '$lib/constants'
  import PerModelSettings from './PerModelSettings.svelte'
  import UpscaleSettings from './UpscaleSettings.svelte'
  import FaceDetailerSettings from './FaceDetailerSettings.svelte'

  interface Props {
    show: boolean
    settings: Settings
    onClose: () => void
    onSave: (settings: Settings) => void
    onError?: (message: string) => void
    initialFocus: 'quality' | 'negative' | null
  }

  let { show, settings, onClose, onSave, onError, initialFocus }: Props = $props()

  // Local copy of settings for editing
  let localSettings: Settings = $state({
    imageWidth: settings.imageWidth,
    imageHeight: settings.imageHeight,
    cfgScale: settings.cfgScale,
    steps: settings.steps,
    seed: settings.seed,
    sampler: settings.sampler,
    scheduler: settings.scheduler,
    comfyUrl: settings.comfyUrl,
    outputDirectory: settings.outputDirectory,
    geminiApiKey: settings.geminiApiKey || '',
    openRouterApiKey: settings.openRouterApiKey || '',
    openRouterModel: settings.openRouterModel || '',
    ollamaBaseUrl: settings.ollamaBaseUrl || 'http://localhost:11434',
    ollamaModel: settings.ollamaModel || 'llama3.2',
    promptAnalyzerApiProvider: settings.promptAnalyzerApiProvider || 'gemini',
    chatPromptLanguage: settings.chatPromptLanguage || 'english',
    selectedVae: settings.selectedVae,
    clipSkip: settings.clipSkip,
    locale: settings.locale || baseLocale,
    perModel: settings.perModel || {},
    loraPresets: settings.loraPresets || []
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
    scheduler: '',
    comfyUrl: '',
    outputDirectory: '',
    geminiApiKey: '',
    openRouterApiKey: '',
    openRouterModel: '',
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.2',
    promptAnalyzerApiProvider: 'gemini',
    chatPromptLanguage: 'english',
    selectedVae: '',
    clipSkip: 0,
    locale: baseLocale,
    perModel: {},
    loraPresets: []
  })
  let hasUnsavedChanges: boolean = $state(false)
  let sessionInitialized: boolean = $state(false)
  let availableVaes: string[] = $state([])
  let availableCheckpoints: string[] = $state([])
  let availableWorkflows: string[] = $state([])
  let selectedModelKey: string = $state('Default')
  let originalSelectedModelKey: string = $state('Default')
  let selectedModelDirty: boolean = $state(false)
  let lastSelectedModelKey: string = $state('Default')
  let previousModelType: ModelType | null = $state(null)
  let perModelSettingsRef: PerModelSettings | undefined = $state()

  function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj))
  }
  function deepEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
  }

  function localeLabel(code: string): string {
    if (code === 'ko') return m['settingsDialog.localeKorean']()
    if (code === 'en') return m['settingsDialog.localeEnglish']()
    return code
  }

  // Update local settings when props change
  $effect(() => {
    if (show) {
      const cloned = deepClone(settings)
      cloned.locale = cloned.locale || baseLocale
      if (!cloned.perModel) {
        cloned.perModel = {}
      }
      if (!cloned.geminiApiKey) {
        cloned.geminiApiKey = ''
      }
      if (!cloned.openRouterApiKey) {
        cloned.openRouterApiKey = ''
      }
      if (!cloned.openRouterModel) {
        cloned.openRouterModel = ''
      }
      if (!cloned.ollamaBaseUrl) {
        cloned.ollamaBaseUrl = 'http://localhost:11434'
      }
      if (!cloned.ollamaModel) {
        cloned.ollamaModel = 'llama3.2'
      }
      if (cloned.promptAnalyzerApiProvider !== 'gemini' && cloned.promptAnalyzerApiProvider !== 'openrouter' && cloned.promptAnalyzerApiProvider !== 'ollama') {
        cloned.promptAnalyzerApiProvider = 'gemini'
      }
      if (cloned.chatPromptLanguage !== 'english' && cloned.chatPromptLanguage !== 'chinese') {
        cloned.chatPromptLanguage = 'english'
      }
      localSettings = cloned
      // Reset session init so we can capture a fresh baseline below
      sessionInitialized = false
    }
  })

  // Initialize baseline once per open session
  $effect(() => {
    if (show && !sessionInitialized) {
      // If dialog was opened with a target focus from TagZones,
      // ensure the selected model entry exists as well so the field renders.
      let currentSelected: string | null = null
      promptsData.subscribe((d) => (currentSelected = d.selectedCheckpoint || null))()
      const keyToEnsure = currentSelected || 'Default'
      if (initialFocus) {
        ensureModelEntry(keyToEnsure)
      }
      selectedModelKey = keyToEnsure
      ensureModelEntry('Default')
      ensureModelEntry(keyToEnsure)
      originalLocalSettings = deepClone(localSettings)
      hasUnsavedChanges = false
      originalSelectedModelKey = keyToEnsure
      selectedModelDirty = false
      lastSelectedModelKey = keyToEnsure
      sessionInitialized = true
      // Sync LoRA preset selection after dialog is fully initialized
      setTimeout(() => {
        perModelSettingsRef?.syncLoraPresetSelection()
      }, 0)
    }
    if (!show && sessionInitialized) {
      sessionInitialized = false
      hasUnsavedChanges = false
      selectedModelDirty = false
      originalSelectedModelKey = 'Default'
      lastSelectedModelKey = 'Default'
      previousModelType = null
    }
  })

  function ensureModelEntry(key: string) {
    if (localSettings.perModel[key]) {
      return
    }
    localSettings = {
      ...localSettings,
      perModel: {
        ...localSettings.perModel,
        [key]: {
          qualityPrefix: '',
          negativePrefix: '',
          loras: [],
          cfgScale: localSettings.cfgScale,
          steps: localSettings.steps,
          sampler: localSettings.sampler,
          scheduler: localSettings.scheduler,
          selectedVae: localSettings.selectedVae,
          clipSkip: localSettings.clipSkip,
          modelType: 'sdxl',
          faceDetailer: { ...DEFAULT_FACE_DETAILER_SETTINGS },
          upscale: { ...DEFAULT_UPSCALE_SETTINGS }
        }
      }
    }
  }

  // Create per-model entry when needed

  $effect(() => {
    if (show) {
      fetchVaeModels(localSettings.comfyUrl)
        .then((vaes) => {
          availableVaes = vaes || []
        })
        .catch(() => {
          availableVaes = []
        })
      fetchCheckpoints(localSettings.comfyUrl)
        .then((cps) => {
          availableCheckpoints = ['Default', ...(cps || [])]
        })
        .catch(() => {
          availableCheckpoints = ['Default']
        })
      // Fetch available workflow files
      fetch('/api/workflow')
        .then((res) => res.json())
        .then((data) => {
          availableWorkflows = data.workflows || []
        })
        .catch(() => {
          availableWorkflows = []
        })
      // Initialize selected model key
      if (!selectedModelKey) selectedModelKey = 'Default'
    }
  })

  // Track whether current selection differs from baseline
  $effect(() => {
    if (!show || !sessionInitialized) {
      return
    }
    selectedModelDirty = selectedModelKey !== originalSelectedModelKey
  })

  // Copy currently displayed settings into the newly selected model entry
  $effect(() => {
    if (!show || !sessionInitialized) {
      return
    }
    if (selectedModelKey === lastSelectedModelKey) {
      return
    }
    const previousKey = lastSelectedModelKey
    const nextKey = selectedModelKey
    ensureModelEntry(nextKey)
    if (localSettings.perModel[previousKey]) {
      const cloned = deepClone(localSettings.perModel[previousKey])
      localSettings = {
        ...localSettings,
        perModel: {
          ...localSettings.perModel,
          [nextKey]: cloned
        }
      }
      selectedModelDirty = true
    }
    lastSelectedModelKey = nextKey
    // Reset previousModelType when switching models to track the new model's type
    previousModelType = localSettings.perModel[nextKey]?.modelType || null
  })

  // Reset settings to model type defaults when model type changes
  $effect(() => {
    if (!show || !sessionInitialized) {
      return
    }
    const currentSettings = localSettings.perModel[selectedModelKey]
    if (!currentSettings) {
      return
    }
    const currentModelType = currentSettings.modelType
    if (previousModelType === null) {
      // Initialize on first render
      previousModelType = currentModelType
      return
    }
    if (currentModelType === previousModelType) {
      return
    }
    // Model type changed - apply defaults for the new type
    const defaults = MODEL_TYPE_DEFAULTS[currentModelType]
    if (defaults) {
      const nextLoras =
        'loras' in defaults && defaults.loras
          ? defaults.loras.map((entry: { name: string; weight: number }) => ({ ...entry }))
          : []
      localSettings = {
        ...localSettings,
        perModel: {
          ...localSettings.perModel,
          [selectedModelKey]: {
            ...currentSettings,
            cfgScale: defaults.cfgScale,
            steps: defaults.steps,
            sampler: defaults.sampler,
            scheduler: defaults.scheduler,
            clipSkip: defaults.clipSkip,
            qualityPrefix: defaults.qualityPrefix,
            negativePrefix: defaults.negativePrefix,
            wildcardsFile: defaults.wildcardsFile,
            selectedVae: defaults.selectedVae ?? '__embedded__',
            customWorkflowPath: defaults.customWorkflowPath ?? currentSettings.customWorkflowPath,
            loras: nextLoras
          }
        }
      }
    }
    previousModelType = currentModelType
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

  async function handleSave() {
    // Validate and create wildcards files if needed
    const wildcardsToCheck = new Set<string>()
    for (const modelSettings of Object.values(localSettings.perModel)) {
      if (modelSettings.wildcardsFile && modelSettings.wildcardsFile.trim()) {
        wildcardsToCheck.add(modelSettings.wildcardsFile.trim())
      }
    }

    // Check each unique wildcards file and create if missing
    for (const filename of wildcardsToCheck) {
      try {
        const params = `?filename=${encodeURIComponent(filename)}&createIfMissing=true`
        const res = await fetch(`/api/wildcards${params}`)
        if (!res.ok && res.status !== 404) {
          onError?.(`Failed to access wildcards file: ${filename}`)
          return
        }
      } catch (error) {
        onError?.(`Failed to check wildcards file: ${filename}`)
        return
      }
    }

    onSave(deepClone(localSettings))
    // Update baseline immediately so button disables if dialog remains open
    originalLocalSettings = deepClone(localSettings)
    hasUnsavedChanges = false
    originalSelectedModelKey = selectedModelKey
    selectedModelDirty = false
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
        <h3>{m['settingsDialog.title']()}</h3>
        <button class="close-button" onclick={onClose} aria-label={m['settingsDialog.close']()}>
          ×
        </button>
      </div>

      <div class="dialog-body">
        <label for="app-locale" class="two-col-label">{m['settingsDialog.locale']()}</label>
        <CustomSelect
          id="app-locale"
          class="two-col-input"
          bind:value={localSettings.locale}
          options={locales.map((code) => ({ value: code, label: localeLabel(code) }))}
        />

        <!-- Global settings -->
        <label for="image-width" class="two-col-label">{m['settingsDialog.imageWidth']()}</label>
        <input
          id="image-width"
          type="number"
          bind:value={localSettings.imageWidth}
          min="256"
          max="2048"
          step="64"
          class="two-col-input"
        />

        <label for="image-height" class="two-col-label">{m['settingsDialog.imageHeight']()}</label>
        <input
          id="image-height"
          type="number"
          bind:value={localSettings.imageHeight}
          min="256"
          max="2048"
          step="64"
          class="two-col-input"
        />

        <label for="seed" class="two-col-label">{m['settingsDialog.seed']()}</label>
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
        <label for="output-directory" class="output-dir-label"
          >{m['settingsDialog.outputDirectory']()}</label
        >
        <input
          id="output-directory"
          type="text"
          bind:value={localSettings.outputDirectory}
          placeholder={m['settingsDialog.outputPlaceholder']()}
          class="output-dir-input"
        />

        <label for="comfy-url" class="output-dir-label">{m['settingsDialog.comfyUrl']()}</label>
        <input
          id="comfy-url"
          type="text"
          bind:value={localSettings.comfyUrl}
          placeholder={m['settingsDialog.comfyUrlPlaceholder']()}
          class="output-dir-input"
        />

        <label for="prompt-analyzer-api" class="output-dir-label">
          {m['settingsDialog.promptAnalyzerApi']()}
        </label>
        <CustomSelect
          id="prompt-analyzer-api"
          class="output-dir-input"
          bind:value={localSettings.promptAnalyzerApiProvider}
          options={[
            { value: 'gemini', label: 'Gemini' },
            { value: 'openrouter', label: 'OpenRouter' },
            { value: 'ollama', label: 'Ollama' }
          ]}
        />

        <label for="gemini-api-key" class="output-dir-label">
          {m['settingsDialog.geminiApiKey']()}
        </label>
        <input
          id="gemini-api-key"
          type="password"
          bind:value={localSettings.geminiApiKey}
          placeholder={m['settingsDialog.geminiApiKeyPlaceholder']()}
          class="output-dir-input"
          autocomplete="off"
        />

        <label for="openrouter-api-key" class="output-dir-label">
          {m['settingsDialog.openRouterApiKey']()}
        </label>
        <input
          id="openrouter-api-key"
          type="password"
          bind:value={localSettings.openRouterApiKey}
          placeholder={m['settingsDialog.openRouterApiKeyPlaceholder']()}
          class="output-dir-input"
          autocomplete="off"
        />

        <label for="openrouter-model" class="output-dir-label">
          {m['settingsDialog.openRouterModel']()}
        </label>
        <input
          id="openrouter-model"
          type="text"
          bind:value={localSettings.openRouterModel}
          placeholder={m['settingsDialog.openRouterModelPlaceholder']()}
          class="output-dir-input"
          autocomplete="off"
        />

        <label for="ollama-base-url" class="output-dir-label">
          {m['settingsDialog.ollamaBaseUrl']()}
        </label>
        <input
          id="ollama-base-url"
          type="text"
          bind:value={localSettings.ollamaBaseUrl}
          placeholder="http://localhost:11434"
          class="output-dir-input"
          autocomplete="off"
        />

        <label for="ollama-model" class="output-dir-label">
          {m['settingsDialog.ollamaModel']()}
        </label>
        <input
          id="ollama-model"
          type="text"
          bind:value={localSettings.ollamaModel}
          placeholder="llama3.2"
          class="output-dir-input"
          autocomplete="off"
        />

        <label for="chat-prompt-language" class="output-dir-label">
          {m['settingsDialog.chatPromptLanguage']()}
        </label>
        <CustomSelect
          id="chat-prompt-language"
          class="output-dir-input"
          bind:value={localSettings.chatPromptLanguage}
          options={[
            { value: 'english', label: m['settingsDialog.chatPromptLanguageEnglish']() },
            { value: 'chinese', label: m['settingsDialog.chatPromptLanguageChinese']() }
          ]}
        />

        <label for="global-workflow" class="output-dir-label">
          {m['settingsDialog.globalWorkflow']()}
        </label>
        <CustomSelect
          id="global-workflow"
          value={localSettings.customWorkflowPath || ''}
          class="output-dir-input"
          options={[
            { value: '', label: m['settingsDialog.globalWorkflowNone']() },
            ...availableWorkflows.map((w) => ({ value: w, label: w }))
          ]}
          onchange={(v) => (localSettings.customWorkflowPath = v)}
        />

        <!-- Per-model overrides -->
        <div class="section-spacer" style="grid-column: 1 / 4; height: 10px;"></div>
        <div
          class="section-title"
          style="grid-column: 1 / 4; font-weight: 600; color: #333; text-align: left; justify-self: start;"
        >
          {m['settingsDialog.perModelTitle']()}
        </div>

        <label for="model-key" class="two-col-label">{m['settingsDialog.model']()}</label>
        <CustomSelect
          id="model-key"
          class="two-col-input"
          bind:value={selectedModelKey}
          options={availableCheckpoints.map((cp) => ({ value: cp, label: cp }))}
          onchange={(value) => ensureModelEntry(value)}
        />

        {#if localSettings.perModel[selectedModelKey]}
          <PerModelSettings
            bind:this={perModelSettingsRef}
            bind:modelSettings={localSettings.perModel[selectedModelKey]}
            {availableVaes}
            {availableWorkflows}
            loraPresets={localSettings.loraPresets || []}
            onLoraPresetsChange={(presets) => (localSettings.loraPresets = presets)}
          />

          <UpscaleSettings
            bind:upscaleSettings={localSettings.perModel[selectedModelKey].upscale}
            {availableCheckpoints}
            {availableVaes}
          />

          <FaceDetailerSettings
            bind:faceDetailerSettings={localSettings.perModel[selectedModelKey].faceDetailer}
            {availableCheckpoints}
            {availableVaes}
          />
        {/if}
      </div>

      <div class="dialog-footer">
        <button
          type="button"
          class={(hasUnsavedChanges || selectedModelDirty
            ? 'bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-500 '
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300 focus:ring-gray-500 disabled:cursor-default ') +
            'rounded-md px-4 py-2 transition-colors focus:ring-2 focus:outline-none'}
          onclick={handleSave}
          disabled={!(hasUnsavedChanges || selectedModelDirty)}
        >
          {m['settingsDialog.save']()}
        </button>
        <button
          type="button"
          class="rounded-md bg-gray-200 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-300 focus:ring-2 focus:ring-gray-500 focus:outline-none"
          onclick={onClose}
        >
          {m['settingsDialog.close']()}
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

  .dialog-body input {
    padding: 6px 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 13px;
    width: 100%;
  }

  .dialog-body input:focus {
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
</style>

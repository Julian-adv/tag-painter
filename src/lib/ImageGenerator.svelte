<!-- Main component for generating images from prompts -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import ImageViewer from './ImageViewer.svelte'
  import GenerationControls from './GenerationControls.svelte'
  import CompositionSelector from './CompositionSelector.svelte'
  import TagZones from './TagZones.svelte'
  import LoraSelector from './LoraSelector.svelte'
  import { dev } from '$app/environment'
  import { m } from '$lib/paraglide/messages'
  import NoCheckpointsDialog from './NoCheckpointsDialog.svelte'
  import type { Settings, ProgressData, PromptsData } from '$lib/types'
  import { loadSettings, saveSettings as saveSettingsToFile, saveMaskData } from './utils/fileIO'
  import { fetchCheckpoints } from './utils/comfyui'
  import { ArrowPath } from 'svelte-heros-v2'
  import { generateImage } from './utils/imageGeneration'
  import { DEFAULT_COMFY_URL, DEFAULT_OUTPUT_DIRECTORY } from '$lib/constants'
  import { baseLocale, setLocale, getLocale, isLocale } from '$lib/paraglide/runtime.js'
  import {
    promptsData,
    initializePromptsStore,
    savePromptsData,
    autoSaveCurrentValues,
    updateCheckpoint,
    updateUpscale,
    updateFaceDetailer,
    updateComposition,
    updateSelectedLoras
  } from './stores/promptsStore'

  // Component state
  let isLoading = $state(false)
  let imageUrl: string | null = $state(null)
  let currentImageFileName = $state('')
  let progressData: ProgressData = $state({
    value: 0,
    max: 100,
    currentNode: ''
  })
  let availableCheckpoints: string[] = $state([])
  let imageViewer:
    | {
        updateFileList: () => Promise<void>
        disableDrawingMode: () => void
        getMaskData: () => string | null
        hasMask: () => boolean
      }
    | undefined
  let compositionSelector = $state<{ selectTempMask: () => void } | undefined>(undefined)
  let loraSelectorRef = $state<{ refresh: () => void } | undefined>(undefined)
  let isGeneratingForever = $state(false)
  let shouldStopGeneration = $state(false)
  let lastSeed: number | null = $state(null)
  let showNoCheckpointsDialog = $state(false)
  let localeVersion = $state(0)
  let isQwenModel = $state(false)
  let currentRandomTagResolutions: {
    all: Record<string, string>
    zone1: Record<string, string>
    zone2: Record<string, string>
    negative: Record<string, string>
    inpainting: Record<string, string>
  } = $state({
    all: {},
    zone1: {},
    zone2: {},
    negative: {},
    inpainting: {}
  })

  // Show dialog when no checkpoints are found
  function openNoCheckpointsDialog() {
    showNoCheckpointsDialog = true
  }

  // Reload model/LoRA lists from ComfyUI and refresh UI options
  async function refreshModels(event: MouseEvent) {
    // Prevent click from bubbling and default focus/selection behaviors
    event.stopPropagation()
    event.preventDefault()
    try {
      // Re-fetch checkpoints (ComfyUI updates lists on demand)
      const checkpoints = await fetchCheckpoints(settings.comfyUrl)
      if (checkpoints && checkpoints.length > 0) {
        // Preserve selected checkpoint if still present; otherwise pick first
        let prevSelected: string | null = null
        promptsData.subscribe((d: PromptsData) => (prevSelected = d.selectedCheckpoint || null))()
        availableCheckpoints = checkpoints
        if (!prevSelected || !checkpoints.includes(prevSelected)) {
          promptsData.update((data: PromptsData) => ({ ...data, selectedCheckpoint: checkpoints[0] }))
        }
      } else {
        availableCheckpoints = []
        openNoCheckpointsDialog()
      }
    } catch (e) {
      console.error('Failed to reload checkpoint list', e)
    }

    // Refresh LoRA list in the selector
    try {
      loraSelectorRef?.refresh()
    } catch (e) {
      console.error('Failed to refresh LoRA list', e)
    }
  }

  // Settings state
  let settings: Settings = $state({
    imageWidth: 832,
    imageHeight: 1216,
    cfgScale: 5,
    steps: 28,
    seed: -1,
    sampler: 'euler_ancestral',
    comfyUrl: DEFAULT_COMFY_URL,
    outputDirectory: DEFAULT_OUTPUT_DIRECTORY,
    selectedVae: '__embedded__',
    clipSkip: 2,
    locale: baseLocale,
    perModel: {}
  })

  function validateSettings(input: Settings): Settings {
    const next: Settings = {
      ...input,
      comfyUrl: input.comfyUrl || DEFAULT_COMFY_URL,
      selectedVae: input.selectedVae || '__embedded__',
      perModel: input.perModel || {},
      locale: input.locale || baseLocale
    }

    for (const key of Object.keys(next.perModel)) {
      const entry = next.perModel[key]
      if (entry && !entry.modelType) {
        entry.modelType = 'sdxl'
      }
      if (entry?.modelType === 'qwen') {
        if (entry.steps == null) entry.steps = 8
        if (entry.cfgScale == null) entry.cfgScale = 1.5
        if (!entry.sampler) entry.sampler = 'euler'
        if (!entry.scheduler) entry.scheduler = 'simple'
      }
    }

    return next
  }

  function applyLocaleIfSupported(nextLocale: string) {
    const normalized = nextLocale?.toLowerCase()
    if (!normalized || !isLocale(normalized)) return
    if (getLocale() !== normalized) {
      setLocale(normalized, { reload: false })
    }
    localeVersion += 1
  }

  // Prompts state is now managed by the central store

  // Initialize component
  onMount(async () => {
    // Initialize prompts store
    await initializePromptsStore()

    // Load settings
    const savedSettings = await loadSettings()
    if (savedSettings) {
      settings = validateSettings({ ...settings, ...savedSettings })
    }

    applyLocaleIfSupported(settings.locale)

    // Load available checkpoints
    const checkpoints = await fetchCheckpoints(settings.comfyUrl)
    if (checkpoints && checkpoints.length > 0) {
      availableCheckpoints = checkpoints
      promptsData.update((data: PromptsData) => {
        if (!data.selectedCheckpoint && checkpoints.length > 0) {
          return { ...data, selectedCheckpoint: checkpoints[0] }
        }
        return data
      })
    } else {
      // Show dialog when no checkpoints are found
      openNoCheckpointsDialog()
    }
  })

  let wasQwenModel = false

  $effect(() => {
    const perModel = settings.perModel || {}
    const selectedKey = $promptsData.selectedCheckpoint || 'Default'
    const modelEntry = perModel[selectedKey] || perModel['Default']
    const qwenSelected = modelEntry?.modelType === 'qwen'
    isQwenModel = qwenSelected

    if (qwenSelected) {
      if (!wasQwenModel) {
        wasQwenModel = true
        if ($promptsData.selectedComposition !== 'all') {
          updateComposition('all')
        }
        if ($promptsData.useFaceDetailer) {
          updateFaceDetailer(false)
        }
      }
    } else if (wasQwenModel) {
      wasQwenModel = false
    }
  })

  // Event handlers
  let generationControlsRef =
    $state<
      | { openSettingsDialogExternal: (focusField: 'quality' | 'negative' | null) => void }
      | undefined
    >(undefined)
  function openSettingsFromTagZones(focusField: 'quality' | 'negative') {
    generationControlsRef?.openSettingsDialogExternal(focusField)
  }

  async function handleGenerate(seedToUse: number | null = null) {
    // Check if checkpoints are available before generating
    if (!availableCheckpoints || availableCheckpoints.length === 0) {
      openNoCheckpointsDialog()
      return
    }

    // Add current values to options if they're not already there
    autoSaveCurrentValues()

    // Save prompts before generating
    await savePromptsData()

    const isRegeneration = seedToUse !== null

    let currentPromptsData: PromptsData
    promptsData.subscribe((data: PromptsData) => (currentPromptsData = data))()

    // Get mask data from ImageViewer if available and save it
    let maskFilePath: string | null = null
    if (imageViewer) {
      if (imageViewer.hasMask()) {
        const maskData = imageViewer.getMaskData()
        if (maskData) {
          maskFilePath = await saveMaskData(maskData)
        }

        // Disable drawing mode when generation starts
        imageViewer.disableDrawingMode()
      }
    }

    const result = await generateImage({
      promptsData: currentPromptsData!,
      settings,
      seed: seedToUse,
      maskFilePath,
      currentImagePath: currentImageFileName,
      isInpainting: false,
      previousRandomTagResolutions: isRegeneration ? currentRandomTagResolutions : undefined,
      onLoadingChange: (loading) => {
        isLoading = loading
      },
      onProgressUpdate: (progress) => {
        progressData = progress
      },
      onImageReceived: async (imageBlob, filePath) => {
        // Create blob URL for immediate display
        if (imageUrl && imageUrl.startsWith('blob:')) {
          URL.revokeObjectURL(imageUrl)
        }
        imageUrl = URL.createObjectURL(imageBlob)

        // Set the current image file name
        currentImageFileName = filePath

        // Update file list after new image is generated
        if (imageViewer?.updateFileList) {
          await imageViewer.updateFileList()
        }
      },
      onError: (error) => {
        console.error('Generation error:', error)
        isLoading = false
      }
    })

    // Store the results
    lastSeed = result.seed
    currentRandomTagResolutions = result.randomTagResolutions
  }

  async function handleInpaint(denoiseStrength: number) {
    if (isQwenModel) {
      return
    }
    // Check if inpainting tags exist
    let currentPromptsData: PromptsData
    promptsData.subscribe((data: PromptsData) => (currentPromptsData = data))()

    if (!currentPromptsData!.tags.inpainting || currentPromptsData!.tags.inpainting.length === 0) {
      alert(m['imageGenerator.missingInpaintingAlert']())
      return
    }

    await handleInpaintGeneration(denoiseStrength)
  }

  async function handleInpaintGeneration(denoiseStrength: number) {
    // Add current values to options if they're not already there
    autoSaveCurrentValues()

    // Save prompts before generating
    await savePromptsData()

    let currentPromptsData: PromptsData
    promptsData.subscribe((data: PromptsData) => (currentPromptsData = data))()

    // Get mask data from ImageViewer if available and save it
    let maskFilePath: string | null = null
    if (imageViewer) {
      if (imageViewer.hasMask()) {
        const maskData = imageViewer.getMaskData()
        if (maskData) {
          maskFilePath = await saveMaskData(maskData)

          // Auto-select temp-mask composition after mask is saved
          if (compositionSelector?.selectTempMask) {
            setTimeout(() => {
              compositionSelector?.selectTempMask()
            }, 100)
          }
        }

        // Disable drawing mode when generation starts
        imageViewer.disableDrawingMode()
      }
    }

    // If no custom mask but inpainting is requested, use composition mask
    if (!maskFilePath) {
      const maskResponse = await fetch(
        `/api/mask-path?composition=${encodeURIComponent(currentPromptsData!.selectedComposition)}`
      )
      if (maskResponse.ok) {
        const { maskImagePath } = await maskResponse.json()
        maskFilePath = maskImagePath
        console.log('Using composition mask path:', maskImagePath)
      }
    }

    const result = await generateImage({
      promptsData: currentPromptsData!,
      settings,
      seed: null,
      maskFilePath,
      currentImagePath: currentImageFileName,
      isInpainting: true,
      inpaintDenoiseStrength: denoiseStrength,
      previousRandomTagResolutions: undefined,
      onLoadingChange: (loading) => {
        isLoading = loading
      },
      onProgressUpdate: (progress) => {
        progressData = progress
      },
      onImageReceived: async (imageBlob, filePath) => {
        // Create blob URL for immediate display
        if (imageUrl && imageUrl.startsWith('blob:')) {
          URL.revokeObjectURL(imageUrl)
        }
        imageUrl = URL.createObjectURL(imageBlob)

        // Set the current image file name
        currentImageFileName = filePath

        // Update file list after new image is generated
        if (imageViewer?.updateFileList) {
          await imageViewer.updateFileList()
        }
      },
      onError: (error) => {
        console.error('Generation error:', error)
        isLoading = false
      }
    })

    // Store the results
    lastSeed = result.seed
    currentRandomTagResolutions = result.randomTagResolutions
  }

  async function handleGenerateForever() {
    isGeneratingForever = true
    shouldStopGeneration = false

    while (isGeneratingForever && !shouldStopGeneration) {
      try {
        await handleGenerate(null)

        // Wait for current generation to complete
        while (isLoading && !shouldStopGeneration) {
          await new Promise((resolve) => setTimeout(resolve, 100))
        }

        // If user pressed stop during generation, break
        if (shouldStopGeneration) {
          break
        }

        // Small delay between generations
        await new Promise((resolve) => setTimeout(resolve, 500))
      } catch (error) {
        console.error('Forever generation error:', error)
        break
      }
    }

    isGeneratingForever = false
    shouldStopGeneration = false
  }

  function handleStopGeneration() {
    shouldStopGeneration = true
    isGeneratingForever = false
  }

  function handleImageChange(filePath: string) {
    if (imageUrl && imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imageUrl)
    }
    imageUrl = `/api/image?path=${encodeURIComponent(filePath)}`
    currentImageFileName = filePath
  }

  async function handleSettingsChange(newSettings: Settings) {
    settings = { ...newSettings }
    if (!settings.locale) settings.locale = baseLocale
    applyLocaleIfSupported(settings.locale)

    // Save settings to file
    const success = await saveSettingsToFile(settings)
    if (success) {
      console.log('Settings saved to file successfully')
    } else {
      console.error('Failed to save settings to file')
    }
  }

  // PromptForm functions
  function handleLoraChange(loras: { name: string; weight: number }[]) {
    updateSelectedLoras(loras)
  }

  // Cleanup
  onDestroy(() => {
    if (imageUrl && imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imageUrl)
    }
  })
</script>

<main
  class="m-0 box-border flex h-screen w-screen flex-col bg-gradient-to-br from-gray-100 to-gray-200 p-4"
>
  <div class="grid h-full w-full grid-cols-[1fr_minmax(0,832px)] gap-4 max-lg:grid-cols-1">
    {#key localeVersion}
      <section class="flex h-full min-w-0 flex-col gap-2 overflow-auto">
        <CompositionSelector bind:this={compositionSelector} />

        <div class="flex min-h-0 flex-1 flex-shrink-1">
          <TagZones
            {currentRandomTagResolutions}
            {settings}
            onOpenSettings={openSettingsFromTagZones}
          />
        </div>

        <div class="flex flex-shrink-0 flex-col gap-1">
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2">
              <label for="checkpoint" class="text-left text-sm font-bold text-black">
                {m['imageGenerator.checkpointLabel']()}
              </label>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-1 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
                title={m['imageGenerator.reloadCheckpoints']()}
                onclick={refreshModels}
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

          <!-- LoRA Selector -->
          <div class="flex flex-col gap-2">
            <LoraSelector
              bind:this={loraSelectorRef}
              selectedLoras={$promptsData.selectedLoras}
              onLoraChange={handleLoraChange}
            />
          </div>

          <div class="flex flex-col gap-2">
            <label class="flex cursor-pointer flex-row items-center gap-2 text-xs font-normal">
              <input
                type="checkbox"
                checked={$promptsData.useUpscale}
                onchange={(e) => updateUpscale((e.target as HTMLInputElement).checked)}
                class="m-0 cursor-pointer"
              />
              {m['imageGenerator.useUpscale']()}
            </label>
          </div>

          <div class="flex flex-col gap-2">
            <label class="flex cursor-pointer flex-row items-center gap-2 text-xs font-normal">
              <input
                type="checkbox"
                class="m-0 cursor-pointer accent-sky-600"
                checked={$promptsData.useFaceDetailer}
                onchange={(e) => updateFaceDetailer((e.target as HTMLInputElement).checked)}
                disabled={isQwenModel}
              />
              {m['imageGenerator.useFaceDetailer']()}
            </label>
          </div>
        </div>

        <GenerationControls
          bind:this={generationControlsRef}
          {isLoading}
          {progressData}
          {settings}
          {isGeneratingForever}
          {lastSeed}
          onGenerate={() => handleGenerate(null)}
          onInpaint={handleInpaint}
          onRegenerate={() => handleGenerate(lastSeed)}
          onGenerateForever={handleGenerateForever}
          onStopGeneration={handleStopGeneration}
          onSettingsChange={handleSettingsChange}
          disableInpaint={isQwenModel}
        />

        {#if dev}
          <button
            type="button"
            class="self-start flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-xs font-bold text-gray-500 shadow-sm transition hover:border-gray-400 hover:text-gray-700"
            onclick={openNoCheckpointsDialog}
            aria-label={m['imageGenerator.devShowDialog']()}
            title={m['imageGenerator.devShowDialog']()}
          >
            !
          </button>
        {/if}
      </section>
    {/key}

    <section class="min-w-0">
      <ImageViewer
        bind:this={imageViewer}
        {imageUrl}
          {currentImageFileName}
          outputDirectory={settings.outputDirectory}
          onImageChange={handleImageChange}
        />
      </section>
  </div>
</main>

<!-- No Checkpoints Dialog -->
<NoCheckpointsDialog bind:isOpen={showNoCheckpointsDialog} />

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    width: 100%;
    overflow-x: hidden;
  }
</style>

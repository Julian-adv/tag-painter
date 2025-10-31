<!-- Main component for generating images from prompts -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { get } from 'svelte/store'
  import ImageViewer from './ImageViewer.svelte'
  import GenerationControls from './GenerationControls.svelte'
  import CompositionSelector from './CompositionSelector.svelte'
  import TagZones from './TagZones.svelte'
  import TabNavigation from './TabNavigation.svelte'
  import ChatInterface from './Chat/ChatInterface.svelte'
  import ModelControls from './ModelControls.svelte'
  import { dev } from '$app/environment'
  import { m } from '$lib/paraglide/messages'
  import NoCheckpointsDialog from './NoCheckpointsDialog.svelte'
  import type { Settings, ProgressData, PromptsData } from '$lib/types'
  import {
    loadSettings,
    saveSettings as saveSettingsToFile,
    saveMaskData,
    saveImage
  } from './utils/fileIO'
  import { fetchCheckpoints, connectWebSocket, normalizeBaseUrl } from './generation/comfyui'
  import { generateImage } from './generation/imageGeneration'
  import { DEFAULT_COMFY_URL, DEFAULT_OUTPUT_DIRECTORY, DEFAULT_SETTINGS } from '$lib/constants'
  import { submitWorkflowForPrompts } from './generation/workflowBuilder'
  import { FINAL_SAVE_NODE_ID } from './generation/workflow'
  import Toasts from './Toasts.svelte'
  import { baseLocale, setLocale, getLocale, isLocale } from '$lib/paraglide/runtime.js'
  import {
    promptsData,
    initializePromptsStore,
    savePromptsData,
    autoSaveCurrentValues,
    updateComposition
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
  let disabledZones = $state<Set<string>>(new Set())
  type TagZonesHandle = {
    saveTags: () => Promise<void>
    refreshSelectedTags: () => Promise<void>
  }
  let tagZonesRef: TagZonesHandle | undefined = $state()

  // Toasts component ref for showing messages
  let toastsRef = $state<any>()

  // Tab state for left section
  let activeTabId = $state('generator')

  // Show dialog when no checkpoints are found
  function openNoCheckpointsDialog() {
    showNoCheckpointsDialog = true
  }

  // Reload model list from ComfyUI and refresh UI options
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
          promptsData.update((data: PromptsData) => ({
            ...data,
            selectedCheckpoint: checkpoints[0]
          }))
        }
      } else {
        availableCheckpoints = []
        openNoCheckpointsDialog()
      }
    } catch (e) {
      console.error('Failed to reload checkpoint list', e)
    }
  }

  // Settings state
  let settings: Settings = $state({
    imageWidth: DEFAULT_SETTINGS.imageWidth,
    imageHeight: DEFAULT_SETTINGS.imageHeight,
    cfgScale: DEFAULT_SETTINGS.cfgScale,
    steps: DEFAULT_SETTINGS.steps,
    seed: DEFAULT_SETTINGS.seed,
    sampler: DEFAULT_SETTINGS.sampler,
    scheduler: DEFAULT_SETTINGS.scheduler,
    comfyUrl: DEFAULT_COMFY_URL,
    outputDirectory: DEFAULT_OUTPUT_DIRECTORY,
    geminiApiKey: DEFAULT_SETTINGS.geminiApiKey,
    selectedVae: '__embedded__',
    clipSkip: DEFAULT_SETTINGS.clipSkip,
    locale: baseLocale,
    perModel: {}
  })

  function validateSettings(input: Settings): Settings {
    const next: Settings = {
      ...input,
      comfyUrl: input.comfyUrl || DEFAULT_COMFY_URL,
      geminiApiKey: input.geminiApiKey || '',
      selectedVae: input.selectedVae || '__embedded__',
      scheduler: input.scheduler || DEFAULT_SETTINGS.scheduler,
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
        if (!entry.scheduler) entry.scheduler = DEFAULT_SETTINGS.scheduler
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
      }
    } else if (wasQwenModel) {
      wasQwenModel = false
    }
  })

  // Event handlers
  let generationControlsRef = $state<
    { openSettingsDialogExternal: (focusField: 'quality' | 'negative' | null) => void } | undefined
  >(undefined)
  function openSettingsFromTagZones(focusField: 'quality' | 'negative') {
    generationControlsRef?.openSettingsDialogExternal(focusField)
  }

  async function handleGenerate(seedToUse: number | null = null) {
    toastsRef?.clear()

    // Check if checkpoints are available before generating
    if (!availableCheckpoints || availableCheckpoints.length === 0) {
      openNoCheckpointsDialog()
      return
    }

    // Add current values to options if they're not already there
    autoSaveCurrentValues()

    // Save tag zones immediately before generating
    if (tagZonesRef) {
      await tagZonesRef.saveTags()
    }

    // Save prompts before generating
    await savePromptsData()

    const isRegeneration = seedToUse !== null

    const currentPromptsData = get(promptsData)

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
      promptsData: currentPromptsData,
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
      }
    })

    // Store the results
    if (result.error) {
      toastsRef?.error(result.error)
      isLoading = false
    } else {
      lastSeed = result.seed!
      currentRandomTagResolutions = result.randomTagResolutions!
      disabledZones = result.disabledZones!
      if (tagZonesRef) {
        await tagZonesRef.refreshSelectedTags()
      }
    }
  }

  async function handleInpaint(denoiseStrength: number) {
    if (isQwenModel) {
      return
    }
    // Check if inpainting tags exist
    const currentPromptsData = get(promptsData)

    if (!currentPromptsData.tags.inpainting || currentPromptsData.tags.inpainting.length === 0) {
      alert(m['imageGenerator.missingInpaintingAlert']())
      return
    }

    await handleInpaintGeneration(denoiseStrength)
  }

  async function handleInpaintGeneration(denoiseStrength: number) {
    toastsRef?.clear()

    // Add current values to options if they're not already there
    autoSaveCurrentValues()

    // Save tag zones immediately before generating
    if (tagZonesRef) {
      await tagZonesRef.saveTags()
    }

    // Save prompts before generating
    await savePromptsData()

    const currentPromptsData = get(promptsData)

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
        `/api/mask-path?composition=${encodeURIComponent(currentPromptsData.selectedComposition)}`
      )
      if (maskResponse.ok) {
        const { maskImagePath } = await maskResponse.json()
        maskFilePath = maskImagePath
        console.log('Using composition mask path:', maskImagePath)
      }
    }

    const result = await generateImage({
      promptsData: currentPromptsData,
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
      }
    })

    // Store the results
    if (result.error) {
      toastsRef?.error(result.error)
      isLoading = false
    } else {
      lastSeed = result.seed!
      currentRandomTagResolutions = result.randomTagResolutions!
      disabledZones = result.disabledZones!
      if (tagZonesRef) {
        await tagZonesRef.refreshSelectedTags()
      }
    }
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

  async function handleChatGeneratePrompt(promptText: string) {
    const text = promptText.trim()
    if (!text) {
      return
    }
    const currentPromptsData = get(promptsData)
    const negativePrompt = (currentPromptsData.tags?.negative || []).join(', ')
    const checkpointKey = currentPromptsData.selectedCheckpoint || ''
    const useUpscaleFlag = currentPromptsData.useUpscale ?? false
    const useFaceDetailerFlag = currentPromptsData.useFaceDetailer ?? false
    const promptsForSaving = {
      all: text,
      zone1: '',
      zone2: '',
      negative: negativePrompt
    }
    try {
      isLoading = true
      progressData = { value: 0, max: 100, currentNode: '' }
      const submission = await submitWorkflowForPrompts(
        text,
        negativePrompt,
        settings,
        checkpointKey,
        useUpscaleFlag,
        useFaceDetailerFlag
      )
      const comfyBase = normalizeBaseUrl(settings.comfyUrl)
      connectWebSocket(
        submission.promptId,
        submission.clientId,
        FINAL_SAVE_NODE_ID,
        submission.workflow,
        {
          onLoadingChange: (loading) => {
            isLoading = loading
          },
          onProgressUpdate: (progress) => {
            progressData = progress
          },
          onImageReceived: async (imageBlob: Blob) => {
            const filePath =
              (await saveImage(
                imageBlob,
                promptsForSaving,
                settings.outputDirectory,
                submission.workflow,
                settings.seed ?? 0
              )) || `chat_${Date.now()}.png`
            if (imageUrl && imageUrl.startsWith('blob:')) {
              URL.revokeObjectURL(imageUrl)
            }
            imageUrl = URL.createObjectURL(imageBlob)
            currentImageFileName = filePath
            if (imageViewer?.updateFileList) {
              await imageViewer.updateFileList()
            }
          }
        },
        comfyBase
      )
    } catch (error) {
      console.error('Failed to generate image from chat prompt', error)
      toastsRef?.error('Failed to generate image from chat prompt.')
      isLoading = false
    }
  }

  async function handleSettingsChange(newSettings: Settings) {
    settings = validateSettings({ ...settings, ...newSettings })
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
      <section class="flex h-full min-w-0 flex-col overflow-hidden">
        <TabNavigation
          tabs={[
            { id: 'generator', label: m['tabs.wildcards']() },
            { id: 'chat', label: m['tabs.chat']() }
          ]}
          bind:activeTabId
        />

        <div class="flex flex-1 flex-col gap-2 overflow-auto">
          {#if activeTabId === 'generator'}
            <div class="flex h-full flex-col gap-2 p-2">
              <CompositionSelector bind:this={compositionSelector} />

              <div class="flex min-h-0 flex-1 flex-shrink-1">
                <TagZones
                  bind:this={tagZonesRef}
                  {currentRandomTagResolutions}
                  {disabledZones}
                  {settings}
                  onOpenSettings={openSettingsFromTagZones}
                />
              </div>

              <ModelControls {availableCheckpoints} onRefreshModels={refreshModels} />

              <GenerationControls
                bind:this={generationControlsRef}
                {isLoading}
                {progressData}
                {settings}
                {isGeneratingForever}
                {lastSeed}
                {toastsRef}
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
                  class="flex h-6 w-6 items-center justify-center self-start rounded-full border border-gray-300 bg-white text-xs font-bold text-gray-500 shadow-sm transition hover:border-gray-400 hover:text-gray-700"
                  onclick={openNoCheckpointsDialog}
                  aria-label={m['imageGenerator.devShowDialog']()}
                  title={m['imageGenerator.devShowDialog']()}
                >
                  !
                </button>
              {/if}
            </div>
          {:else if activeTabId === 'chat'}
            <div class="h-full">
              <ChatInterface
                apiKey={settings.geminiApiKey}
                onGeneratePrompt={handleChatGeneratePrompt}
              />
            </div>
          {/if}
        </div>
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

<Toasts bind:this={toastsRef} />

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

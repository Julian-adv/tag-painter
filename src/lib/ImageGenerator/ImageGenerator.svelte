<!-- Main component for generating images from prompts -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { get } from 'svelte/store'
  import ImageViewer from '$lib/ImageViewer.svelte'
  import GenerationControls from '$lib/GenerationControls.svelte'
  import CompositionSelector from './CompositionSelector.svelte'
  import TagZones from './TagZones.svelte'
  import TabNavigation from './TabNavigation.svelte'
  import PromptAnalyzer from '$lib/Chat/PromptAnalyzer.svelte'
  import PngInfoPanel from '$lib/PngInfo/PngInfoPanel.svelte'
  import ModelControls from './ModelControls.svelte'
  import PostProcessingControls from './PostProcessingControls.svelte'
  import { m } from '$lib/paraglide/messages'
  import type { Settings, ProgressData, PromptsData, ZoneTagResolutions } from '$lib/types'
  import { RefineMode, FaceDetailerMode } from '$lib/types'
  import {
    loadSettings,
    saveSettings as saveSettingsToFile,
    saveMaskData,
    saveImage,
    getImageMetadata
  } from '$lib/utils/fileIO'
  import { fetchCheckpoints, connectWebSocket, normalizeBaseUrl } from '$lib/generation/comfyui'
  import { generateImage } from '$lib/generation/imageGeneration'
  import { getEffectiveModelSettings } from '$lib/generation/generationCommon'
  import { DEFAULT_COMFY_URL, DEFAULT_OUTPUT_DIRECTORY, DEFAULT_SETTINGS } from '$lib/constants'
  import { submitWorkflowForPrompts } from '$lib/generation/workflowBuilder'
  import { FINAL_SAVE_NODE_ID } from '$lib/generation/workflow'
  import Toasts from '$lib/Toasts.svelte'
  import { baseLocale, setLocale, getLocale, isLocale } from '$lib/paraglide/runtime.js'
  import {
    promptsData,
    initializePromptsStore,
    savePromptsData,
    updateComposition,
    updateUseFilmGrain,
    updateEnableRefine,
    updateEnableFaceDetailer
  } from '$lib/stores/promptsStore'
  import { detectPlatform } from '$lib/utils/loraPath'
  import { ArrowPath } from 'svelte-heros-v2'

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
  let localeVersion = $state(0)
  let isQwenModel = $state(false)
  let currentRandomTagResolutions: ZoneTagResolutions = $state({
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
  let metadata: Record<string, unknown> | null = $state(null)
  let selectedRefineMode = $state(RefineMode.none)
  let selectedFaceDetailerMode = $state(FaceDetailerMode.none)
  let useFilmGrain = $state(false)
  let enableRefine = $state(false)
  let enableFaceDetailer = $state(false)
  let refineCheckpoint = $state('')
  let faceDetailerCheckpoint = $state('')
  let generationStartTime = $state<number | null>(null)
  let lastGenerationTime = $state<number | null>(null)

  // Toasts component ref for showing messages
  type ToastType = 'success' | 'error' | 'info'
  let toastsRef = $state<any>()
  let pendingToasts: { type: ToastType; message: string }[] = $state([])
  let restartingComfyUI = $state(false)

  function showToast(type: ToastType, message: string) {
    if (toastsRef) {
      toastsRef[type](message)
    } else {
      pendingToasts = [...pendingToasts, { type, message }]
    }
  }

  $effect(() => {
    if (!toastsRef || pendingToasts.length === 0) {
      return
    }
    for (const toast of pendingToasts) {
      toastsRef[toast.type](toast.message)
    }
    pendingToasts = []
  })

  // Tab state for left section
  let activeTabId = $state('generator')

  async function startComfyUI(forceRestart = false) {
    try {
      if (forceRestart) {
        if (restartingComfyUI) {
          return
        }
        restartingComfyUI = true
      }
      if (!forceRestart) {
        const statusRes = await fetch('/api/comfy/status')
        const statusData = statusRes.ok ? await statusRes.json() : null
        if (statusData?.running) {
          console.log('ComfyUI already running; skipping auto-start.')
          return
        }
      }

      const res = await fetch('/api/comfy/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restart: forceRestart })
      })
      const data = await res.json()
      if (data?.success) {
        console.log('ComfyUI started successfully')
        if (forceRestart) {
          showToast('success', m['imageGenerator.comfyRestarted']())
        }
      } else {
        console.error('Failed to start ComfyUI:', data?.error || 'Unknown error')
        if (forceRestart) {
          showToast('error', data?.error || 'Failed to restart ComfyUI.')
        }
      }
    } catch (err) {
      console.error('Failed to start ComfyUI:', err)
      if (forceRestart) {
        showToast('error', err instanceof Error ? err.message : 'Failed to restart ComfyUI.')
      }
    } finally {
      if (forceRestart) {
        restartingComfyUI = false
      }
    }
  }

  // Reload model list from ComfyUI and refresh UI options
  async function refreshModels(event: MouseEvent) {
    event.stopPropagation()
    event.preventDefault()
    await reloadCheckpoints()
  }

  async function reloadCheckpoints() {
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
    openRouterApiKey: DEFAULT_SETTINGS.openRouterApiKey,
    promptAnalyzerApiProvider: DEFAULT_SETTINGS.promptAnalyzerApiProvider,
    chatPromptLanguage: DEFAULT_SETTINGS.chatPromptLanguage,
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
      openRouterApiKey: input.openRouterApiKey || '',
      promptAnalyzerApiProvider: input.promptAnalyzerApiProvider || 'gemini',
      chatPromptLanguage:
        input.chatPromptLanguage === 'chinese' ? 'chinese' : DEFAULT_SETTINGS.chatPromptLanguage,
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
    // Detect platform for LoRA path normalization
    await detectPlatform()

    // Initialize prompts store
    await initializePromptsStore()

    // Load post-processing settings from store
    const currentPromptsData = get(promptsData)
    useFilmGrain = currentPromptsData.useFilmGrain
    enableRefine = currentPromptsData.enableRefine
    enableFaceDetailer = currentPromptsData.enableFaceDetailer

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
    }

    // Start ComfyUI if not already running
    await startComfyUI()
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

  // Determine refine mode based on checkbox state and checkpoint comparison
  $effect(() => {
    if (!enableRefine) {
      selectedRefineMode = RefineMode.none
    } else {
      const modelSettings = getEffectiveModelSettings(settings, $promptsData.selectedCheckpoint)
      const currentCheckpoint = $promptsData.selectedCheckpoint
      const upscaleCheckpoint = modelSettings?.upscale?.checkpoint
      const modelType = modelSettings?.upscale.modelType

      if (modelType === 'sdxl') {
        selectedRefineMode = RefineMode.refine_sdxl
      } else {
        selectedRefineMode = RefineMode.refine
      }
    }
  })

  // Determine face detailer mode based on checkbox state
  $effect(() => {
    if (!enableFaceDetailer) {
      selectedFaceDetailerMode = FaceDetailerMode.none
    } else {
      const modelSettings = getEffectiveModelSettings(settings, $promptsData.selectedCheckpoint)
      const faceDetailerModelType = modelSettings?.faceDetailer?.modelType

      if (faceDetailerModelType === 'sdxl') {
        selectedFaceDetailerMode = FaceDetailerMode.face_detail_sdxl
      } else {
        selectedFaceDetailerMode = FaceDetailerMode.face_detail
      }
    }
  })

  // Update checkpoint names for display
  $effect(() => {
    const modelSettings = getEffectiveModelSettings(settings, $promptsData.selectedCheckpoint)
    refineCheckpoint = modelSettings?.upscale?.checkpoint || ''
    faceDetailerCheckpoint = modelSettings?.faceDetailer?.checkpoint || ''
  })

  // Sync post-processing settings to store when they change
  $effect(() => {
    updateUseFilmGrain(useFilmGrain)
  })

  $effect(() => {
    updateEnableRefine(enableRefine)
  })

  $effect(() => {
    updateEnableFaceDetailer(enableFaceDetailer)
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
      showToast('error', 'No checkpoints available. Please run bootstrap script to install models.')
      return
    }

    // Record generation start time
    generationStartTime = Date.now()

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

    const modelSettings = getEffectiveModelSettings(settings, currentPromptsData.selectedCheckpoint)
    const result = await generateImage(
      {
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
          // Calculate generation time
          if (generationStartTime) {
            lastGenerationTime = Date.now() - generationStartTime
          }

          // Create blob URL for immediate display
          if (imageUrl && imageUrl.startsWith('blob:')) {
            URL.revokeObjectURL(imageUrl)
          }
          imageUrl = URL.createObjectURL(imageBlob)

          // Set the current image file name
          // For intermediate images (filePath is empty), use a temporary identifier
          currentImageFileName = filePath || `intermediate_${Date.now()}`

          // Update file list after new image is generated (only if file was saved)
          if (filePath && imageViewer?.updateFileList) {
            await imageViewer.updateFileList()
          }
        }
      },
      modelSettings,
      selectedRefineMode,
      selectedFaceDetailerMode,
      useFilmGrain
    )

    // Store the results
    if (result.error) {
      showToast('error', result.error)
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

    // Record generation start time
    generationStartTime = Date.now()

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

    const modelSettings = getEffectiveModelSettings(settings, currentPromptsData.selectedCheckpoint)
    const result = await generateImage(
      {
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
          // Calculate generation time
          if (generationStartTime) {
            lastGenerationTime = Date.now() - generationStartTime
          }

          // Create blob URL for immediate display
          if (imageUrl && imageUrl.startsWith('blob:')) {
            URL.revokeObjectURL(imageUrl)
          }
          imageUrl = URL.createObjectURL(imageBlob)

          // Set the current image file name
          // For intermediate images (filePath is empty), use a temporary identifier
          currentImageFileName = filePath || `intermediate_${Date.now()}`

          // Update file list after new image is generated (only if file was saved)
          if (filePath && imageViewer?.updateFileList) {
            await imageViewer.updateFileList()
          }
        }
      },
      modelSettings,
      selectedRefineMode,
      selectedFaceDetailerMode,
      useFilmGrain
    )

    // Store the results
    if (result.error) {
      showToast('error', result.error)
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

  async function handleImageChange(filePath: string) {
    if (imageUrl && imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imageUrl)
    }

    // Only load metadata if filePath is not empty
    if (filePath) {
      imageUrl = `/api/image?path=${encodeURIComponent(filePath)}`
      currentImageFileName = filePath

      // Load metadata for PNG Info tab
      try {
        const result = await getImageMetadata(filePath)
        metadata = result as Record<string, unknown> | null
      } catch (error) {
        console.error('Failed to load image metadata:', error)
        metadata = null
      }
    } else {
      // Empty path means showing dropped image, don't change metadata
      imageUrl = null
      currentImageFileName = ''
    }
  }

  function handleDroppedImageMetadata(metadataText: string | null) {
    // Update metadata for PNG Info tab
    if (metadataText) {
      metadata = { parameters: metadataText }
      // Switch to PNG Info tab automatically
      activeTabId = 'pnginfo'
    } else {
      metadata = null
    }
  }

  async function handleChatGeneratePrompt(promptText: string, options?: { isRedraw?: boolean }) {
    const text = promptText.trim()
    if (!text) {
      return
    }
    let promptForSubmission = text

    if (options?.isRedraw) {
      if (text.endsWith('.')) {
        promptForSubmission = text.replace(/\.+$/, '').trimEnd()
      } else {
        promptForSubmission = `${text}.`
      }
    }

    const currentPromptsData = get(promptsData)
    const negativePrompt = (currentPromptsData.tags?.negative || []).join(', ')
    const checkpointKey = currentPromptsData.selectedCheckpoint || ''
    const promptsForSaving = {
      all: promptForSubmission,
      zone1: '',
      zone2: '',
      negative: negativePrompt
    }
    try {
      // Record generation start time
      generationStartTime = Date.now()
      isLoading = true
      progressData = { value: 0, max: 100, currentNode: '' }
      const submission = await submitWorkflowForPrompts(
        promptForSubmission,
        negativePrompt,
        settings,
        checkpointKey,
        selectedRefineMode,
        selectedFaceDetailerMode,
        useFilmGrain
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
            // Calculate generation time
            if (generationStartTime) {
              lastGenerationTime = Date.now() - generationStartTime
            }

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
      showToast('error', 'Failed to generate image from chat prompt.')
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
            { id: 'chat', label: 'Analyze' },
            { id: 'pnginfo', label: 'PNG Info' }
          ]}
          bind:activeTabId
        />

        <div class="flex flex-1 flex-col gap-2 overflow-auto">
          <div class="flex h-full flex-col gap-2 p-2" class:hidden={activeTabId !== 'generator'}>
            <CompositionSelector bind:this={compositionSelector} />

            <div class="flex min-h-0 flex-1 flex-shrink-1">
              <TagZones
                bind:this={tagZonesRef}
                {currentRandomTagResolutions}
                {disabledZones}
                {settings}
                onOpenSettings={openSettingsFromTagZones}
                onWildcardsError={(message) => showToast('error', message)}
              />
            </div>
          </div>
          <div class="flex h-full flex-col gap-2 p-0" class:hidden={activeTabId !== 'chat'}>
            <div class="flex-1 overflow-auto">
              <PromptAnalyzer
                apiKey={settings.geminiApiKey}
                openRouterApiKey={settings.openRouterApiKey}
                apiProvider={settings.promptAnalyzerApiProvider}
                wildcardsFile={getEffectiveModelSettings(settings, $promptsData.selectedCheckpoint)?.wildcardsFile}
                onShowToast={(message, type) => {
                  if (type === 'success') {
                    showToast('success', message)
                  } else if (type === 'error') {
                    showToast('error', message)
                  } else {
                    showToast('info', message)
                  }
                }}
              />
            </div>
          </div>
          <div class="flex h-full flex-col gap-2 p-0" class:hidden={activeTabId !== 'pnginfo'}>
            <PngInfoPanel {metadata} />
          </div>
        </div>

        {#if activeTabId !== 'pnginfo'}
          <div class="flex flex-shrink-0 flex-col gap-2 p-2 pt-0">
            <ModelControls {availableCheckpoints} onRefreshModels={refreshModels} {showToast} />

            <PostProcessingControls
              bind:enableRefine
              bind:enableFaceDetailer
              bind:useFilmGrain
              {refineCheckpoint}
              {faceDetailerCheckpoint}
            />

            <GenerationControls
              bind:this={generationControlsRef}
              {isLoading}
              {progressData}
              {settings}
              {isGeneratingForever}
              {lastSeed}
              {lastGenerationTime}
              {toastsRef}
              onGenerate={() => handleGenerate(null)}
              onInpaint={handleInpaint}
              onRegenerate={() => handleGenerate(lastSeed)}
              onGenerateForever={handleGenerateForever}
              onStopGeneration={handleStopGeneration}
              onSettingsChange={handleSettingsChange}
              disableInpaint={isQwenModel}
              showOnlyProgress={activeTabId === 'chat'}
            />

            <div class="flex gap-2 self-start">
              <button
                type="button"
                class={`flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 shadow-sm transition ${restartingComfyUI ? 'cursor-wait opacity-70' : 'hover:border-gray-400 hover:text-gray-700'}`}
                onclick={() => startComfyUI(true)}
                aria-label={m['imageGenerator.restartComfy']()}
                title={m['imageGenerator.restartComfy']()}
                disabled={restartingComfyUI}
              >
                {#if restartingComfyUI}
                  <ArrowPath class="h-4 w-4 animate-spin" aria-hidden="true" />
                {:else}
                  <ArrowPath class="h-4 w-4" aria-hidden="true" />
                {/if}
              </button>
            </div>
          </div>
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
        onDroppedImageMetadata={handleDroppedImageMetadata}
      />
    </section>
  </div>
</main>

<Toasts bind:this={toastsRef} />

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    width: 100%;
    overflow-x: hidden;
  }
</style>

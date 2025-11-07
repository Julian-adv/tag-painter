<!-- Main component for generating images from prompts -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { get } from 'svelte/store'
  import ImageViewer from '$lib/ImageViewer.svelte'
  import GenerationControls from '$lib/GenerationControls.svelte'
  import CompositionSelector from './CompositionSelector.svelte'
  import TagZones from './TagZones.svelte'
  import TabNavigation from './TabNavigation.svelte'
  import ChatInterface from '$lib/Chat/ChatInterface.svelte'
  import ModelControls from './ModelControls.svelte'
  import { dev } from '$app/environment'
  import { m } from '$lib/paraglide/messages'
  import DownloadsDialog from '$lib/downloads/DownloadsDialog.svelte'
  import type { Settings, ProgressData, PromptsData } from '$lib/types'
  import {
    loadSettings,
    saveSettings as saveSettingsToFile,
    saveMaskData,
    saveImage
  } from '$lib/utils/fileIO'
  import { fetchCheckpoints, connectWebSocket, normalizeBaseUrl } from '$lib/generation/comfyui'
  import { generateImage } from '$lib/generation/imageGeneration'
  import { DEFAULT_COMFY_URL, DEFAULT_OUTPUT_DIRECTORY, DEFAULT_SETTINGS } from '$lib/constants'
  import { submitWorkflowForPrompts } from '$lib/generation/workflowBuilder'
  import { FINAL_SAVE_NODE_ID } from '$lib/generation/workflow'
  import Toasts from '$lib/Toasts.svelte'
  import { baseLocale, setLocale, getLocale, isLocale } from '$lib/paraglide/runtime.js'
  import {
    promptsData,
    initializePromptsStore,
    savePromptsData,
    autoSaveCurrentValues,
    updateComposition
  } from '$lib/stores/promptsStore'
  import { detectPlatform } from '$lib/utils/loraPath'

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
  let showDownloadsDialog = $state(false)
  let missingStep1Filenames = $state<string[]>([])
  let customNodePromptChecked = $state(false)
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
  async function openDownloadsDialog(forceOpen = false) {
    // Check which Step 1 files are missing
    try {
      const res = await fetch('/api/downloads-check')
      const data = await res.json()
      if (data.allExist && !forceOpen) {
        // All Step 1 files exist, no need to show dialog
        return
      }
      // Store missing filenames to filter downloads dialog
      missingStep1Filenames = data.missingFilenames || []
    } catch (err) {
      console.error('Failed to check Step 1 files:', err)
      // On error, show dialog with all files
      missingStep1Filenames = []
    }

    showDownloadsDialog = true
  }

  async function startComfyUI() {
    try {
      const res = await fetch('/api/comfy/start', { method: 'POST' })
      const data = await res.json()
      if (data?.success) {
        console.log('ComfyUI started successfully')
      } else if (data?.alreadyRunning) {
        console.log('ComfyUI is already running')
      } else {
        console.error('Failed to start ComfyUI:', data?.error || 'Unknown error')
      }
    } catch (err) {
      console.error('Failed to start ComfyUI:', err)
    }
  }

  async function checkMissingCustomNodes() {
    if (customNodePromptChecked) return
    customNodePromptChecked = true
    try {
      const res = await fetch('/api/downloads?category=custom-node&onlyMissing=1')
      const data = await res.json()
      if (Array.isArray(data?.items) && data.items.length > 0) {
        await openDownloadsDialog(true)
      } else {
        // All custom nodes are installed, start ComfyUI
        await startComfyUI()
      }
    } catch (err) {
      console.debug('Failed to check custom nodes', err)
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
        openDownloadsDialog()
      }
    } catch (e) {
      console.error('Failed to reload checkpoint list', e)
    }
  }

  function handleDownloadsDialogClosed(result: { success: boolean }) {
    if (result?.success) {
      void reloadCheckpoints()
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
      openDownloadsDialog()
    }

    await checkMissingCustomNodes()
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
      openDownloadsDialog()
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
    const useUpscaleFlag = currentPromptsData.useUpscale ?? false
    const useFaceDetailerFlag = currentPromptsData.useFaceDetailer ?? false
    const promptsForSaving = {
      all: promptForSubmission,
      zone1: '',
      zone2: '',
      negative: negativePrompt
    }
    try {
      isLoading = true
      progressData = { value: 0, max: 100, currentNode: '' }
      const submission = await submitWorkflowForPrompts(
        promptForSubmission,
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
            </div>
          {:else if activeTabId === 'chat'}
            <div class="flex h-full flex-col gap-2 p-0">
              <div class="flex-1 overflow-auto">
                <ChatInterface
                  apiKey={settings.geminiApiKey}
                  promptLanguage={settings.chatPromptLanguage}
                  onGeneratePrompt={handleChatGeneratePrompt}
                  {settings}
                  onSettingsChange={handleSettingsChange}
                  currentImagePath={currentImageFileName}
                  onShowToast={(message, type) => {
                    if (type === 'success') {
                      toastsRef?.success(message)
                    } else if (type === 'error') {
                      toastsRef?.error(message)
                    } else {
                      toastsRef?.info(message)
                    }
                  }}
                />
              </div>
            </div>
          {/if}
        </div>

        <div class="flex flex-shrink-0 flex-col gap-2 p-2 pt-0">
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
            showOnlyProgress={activeTabId === 'chat'}
          />

          <div class="flex gap-1 self-start">
            <button
              type="button"
              class="flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-xs font-bold text-gray-500 shadow-sm transition hover:border-gray-400 hover:text-gray-700"
              onclick={() => openDownloadsDialog(true)}
              aria-label={m['imageGenerator.showSetupDialog']()}
              title={m['imageGenerator.showSetupDialog']()}
            >
              !
            </button>
          </div>
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
<DownloadsDialog bind:isOpen={showDownloadsDialog} onClose={handleDownloadsDialogClosed} missingStep1Filenames={missingStep1Filenames} />

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    width: 100%;
    overflow-x: hidden;
  }
</style>

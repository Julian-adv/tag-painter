<!-- Main component for generating images from prompts -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import ImageViewer from './ImageViewer.svelte'
  import GenerationControls from './GenerationControls.svelte'
  import CompositionSelector from './CompositionSelector.svelte'
  import TagZones from './TagZones.svelte'
  import LoraSelector from './LoraSelector.svelte'
  import type { Settings, ProgressData, PromptsData } from '$lib/types'
  import { loadSettings, saveSettings as saveSettingsToFile, saveMaskData } from './utils/fileIO'
  import { fetchCheckpoints } from './utils/comfyui'
  import { ArrowPath } from 'svelte-heros-v2'
  import { generateImage } from './utils/imageGeneration'
  import { DEFAULT_OUTPUT_DIRECTORY } from '$lib/constants'
  import {
    promptsData,
    initializePromptsStore,
    savePromptsData,
    autoSaveCurrentValues,
    updateCheckpoint,
    updateUpscale,
    updateFaceDetailer,
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
  let compositionSelector: { selectTempMask: () => void } | undefined
  let loraSelectorRef: { refresh: () => void } | undefined
  let isGeneratingForever = $state(false)
  let shouldStopGeneration = $state(false)
  let lastSeed: number | null = $state(null)
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

  // Reload model/LoRA lists from ComfyUI and refresh UI options
  async function refreshModels(event: MouseEvent) {
    // Prevent click from bubbling and default focus/selection behaviors
    event.stopPropagation()
    event.preventDefault()
    try {
      // Re-fetch checkpoints (ComfyUI updates lists on demand)
      const checkpoints = await fetchCheckpoints()
      if (checkpoints && checkpoints.length > 0) {
        // Preserve selected checkpoint if still present; otherwise pick first
        let prevSelected: string | null = null
        promptsData.subscribe((d) => (prevSelected = d.selectedCheckpoint || null))()
        availableCheckpoints = checkpoints
        if (!prevSelected || !checkpoints.includes(prevSelected)) {
          promptsData.update((data) => ({ ...data, selectedCheckpoint: checkpoints[0] }))
        }
      } else {
        availableCheckpoints = []
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
    outputDirectory: DEFAULT_OUTPUT_DIRECTORY
  })

  // Prompts state is now managed by the central store

  // Initialize component
  onMount(async () => {
    // Initialize prompts store
    await initializePromptsStore()

    // Load settings
    const savedSettings = await loadSettings()
    if (savedSettings) {
      settings = savedSettings
    }

    // Load available checkpoints
    const checkpoints = await fetchCheckpoints()
    if (checkpoints && checkpoints.length > 0) {
      availableCheckpoints = checkpoints
      promptsData.update((data) => {
        if (!data.selectedCheckpoint && checkpoints.length > 0) {
          return { ...data, selectedCheckpoint: checkpoints[0] }
        }
        return data
      })
    }
  })

  // Event handlers
  async function handleGenerate(seedToUse: number | null = null) {
    // Add current values to options if they're not already there
    autoSaveCurrentValues()

    // Save prompts before generating
    await savePromptsData()

    const isRegeneration = seedToUse !== null

    let currentPromptsData: PromptsData
    promptsData.subscribe((data) => (currentPromptsData = data))()

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
    // Check if inpainting tags exist
    let currentPromptsData: PromptsData
    promptsData.subscribe((data) => (currentPromptsData = data))()

    if (!currentPromptsData!.tags.inpainting || currentPromptsData!.tags.inpainting.length === 0) {
      alert('Please add inpainting prompts before using inpainting.')
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
    promptsData.subscribe((data) => (currentPromptsData = data))()

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
    <section class="flex h-full min-w-0 flex-col gap-2 overflow-auto">
      <CompositionSelector bind:this={compositionSelector} />

      <div class="flex min-h-0 flex-1 flex-shrink-1">
        <TagZones {currentRandomTagResolutions} />
      </div>

      <div class="flex flex-shrink-0 flex-col gap-1">
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <label for="checkpoint" class="text-left text-sm font-bold text-black">Checkpoint</label
            >
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-1 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
              title="Reload lists from ComfyUI"
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
            <option value="">Select checkpoint...</option>
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
            Use Upscale
          </label>
        </div>

        <div class="flex flex-col gap-2">
          <label class="flex cursor-pointer flex-row items-center gap-2 text-xs font-normal">
            <input
              type="checkbox"
              class="m-0 cursor-pointer accent-sky-600"
              checked={$promptsData.useFaceDetailer}
              onchange={(e) => updateFaceDetailer((e.target as HTMLInputElement).checked)}
            />
            Use Face Detailer
          </label>
        </div>
      </div>

      <GenerationControls
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
      />
    </section>

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

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    width: 100%;
    overflow-x: hidden;
  }
</style>

<!-- Main component for generating images from prompts -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import ImageViewer from './ImageViewer.svelte'
  import GenerationControls from './GenerationControls.svelte'
  import CompositionSelector from './CompositionSelector.svelte'
  import TagZones from './TagZones.svelte'
  import LoraSelector from './LoraSelector.svelte'
  import type { Settings, ProgressData, PromptsData } from '$lib/types'
  import { loadSettings, saveSettings as saveSettingsToFile } from './utils/fileIO'
  import { fetchCheckpoints } from './utils/comfyui'
  import { generateImage } from './utils/imageGeneration'
  import { DEFAULT_OUTPUT_DIRECTORY } from '$lib/constants'
  import {
    promptsData,
    initializePromptsStore,
    savePromptsData,
    autoSaveCurrentValues,
    resolveRandomValues,
    updateCheckpoint,
    updateUpscale,
    updateFaceDetailer,
    updateSelectedLoras,
    updateLoraWeight
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
  let imageViewer: { updateFileList: () => Promise<void> } | undefined
  let isGeneratingForever = $state(false)
  let shouldStopGeneration = $state(false)
  let lastSeed: number | null = $state(null)

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

    // Resolve random values for display and pass to generateImage
    const resolvedValues = resolveRandomValues()

    // Save prompts before generating
    await savePromptsData()

    let currentPromptsData: PromptsData
    promptsData.subscribe((data) => (currentPromptsData = data))()

    lastSeed = await generateImage({
      promptsData: currentPromptsData!,
      settings,
      resolvedRandomValues: resolvedValues,
      selectedLoras: currentPromptsData!.selectedLoras,
      seed: seedToUse,
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
  function handleLoraChange(loras: string[]) {
    updateSelectedLoras(loras)
  }

  function handleLoraWeightChange(weight: number) {
    updateLoraWeight(weight)
  }

  // Cleanup
  onDestroy(() => {
    if (imageUrl && imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imageUrl)
    }
  })
</script>

<main
  class="h-screen w-screen m-0 p-4 bg-gradient-to-br from-gray-100 to-gray-200 box-border flex flex-col"
>
  <div class="grid grid-cols-[1fr_minmax(0,832px)] gap-4 w-full h-full max-lg:grid-cols-1">
    <section class="min-w-0 h-full overflow-auto flex flex-col gap-2">
      <CompositionSelector />

      <div class="flex flex-1 min-h-0 flex-shrink-1">
        <TagZones />
      </div>

      <div class="flex flex-col gap-1 flex-shrink-0">
        <div class="flex flex-col gap-2">
          <label for="checkpoint" class="font-bold text-sm text-black text-left">Checkpoint</label>
          <select
            id="checkpoint"
            value={$promptsData.selectedCheckpoint || ''}
            onchange={(e) => updateCheckpoint((e.target as HTMLSelectElement).value)}
            class="w-full p-1 rounded border border-gray-300 text-xs bg-white box-border transition-colors duration-200 focus:outline-none focus:border-green-500 focus:shadow-[0_0_0_2px_rgba(76,175,80,0.2)]"
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
            selectedLoras={$promptsData.selectedLoras}
            onLoraChange={handleLoraChange}
            loraWeight={$promptsData.loraWeight}
            onWeightChange={handleLoraWeightChange}
          />
        </div>

        <div class="flex flex-col gap-2">
          <label class="flex flex-row items-center gap-2 cursor-pointer font-normal text-xs">
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
          <label class="flex flex-row items-center gap-2 cursor-pointer font-normal text-xs">
            <input
              type="checkbox"
              class="accent-sky-600 m-0 cursor-pointer"
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

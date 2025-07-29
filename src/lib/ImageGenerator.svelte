<!-- Main component for generating images from prompts -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import ImageViewer from './ImageViewer.svelte'
  import PromptForm from './PromptForm.svelte'
  import GenerationControls from './GenerationControls.svelte'
  import type { Settings, ProgressData, PromptsData } from '$lib/types'
  import {
    loadSettings,
    saveSettings as saveSettingsToFile
  } from './utils/fileIO'
  import { fetchCheckpoints } from './utils/comfyui'
  import { generateImage } from './utils/imageGeneration'
  import { DEFAULT_OUTPUT_DIRECTORY } from '$lib/constants'
  import { 
    promptsData, 
    initializePromptsStore, 
    savePromptsData, 
    autoSaveCurrentValues,
    resolveRandomValues
  } from './stores/promptsStore'

  // Component state
  let isLoading = $state(false)
  let imageUrl: string | null = $state(null)
  let currentImageFileName = $state('')
  let progressData: ProgressData = $state({ value: 0, max: 100, currentNode: '' })
  let availableCheckpoints: string[] = $state([])
  let imageViewer: { updateFileList: () => Promise<void> } | undefined
  let isGeneratingForever = $state(false)
  let shouldStopGeneration = $state(false)
  let disabledCategoryIds = $state<Set<string>>(new Set())

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
      promptsData.update(data => {
        if (!data.selectedCheckpoint && checkpoints.length > 0) {
          return { ...data, selectedCheckpoint: checkpoints[0] }
        }
        return data
      })
    }
  })

  // Event handlers
  async function handleGenerate() {
    // Clear previous disabled categories before new generation
    disabledCategoryIds = new Set()

    // Add current values to options if they're not already there
    autoSaveCurrentValues()

    // Resolve random values for display and pass to generateImage
    const resolvedValues = resolveRandomValues()

    // Save prompts before generating
    await savePromptsData()

    let currentPromptsData: PromptsData
    promptsData.subscribe(data => currentPromptsData = data)()
    
    await generateImage({
      promptsData: currentPromptsData!,
      settings,
      resolvedRandomValues: resolvedValues,
      selectedLoras: currentPromptsData!.selectedLoras,
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
      },
      onCategoriesDisabled: (excludedCategories) => {
        // Update disabled categories set for visual feedback
        disabledCategoryIds = new Set(excludedCategories.map(cat => cat.id))
      }
    })
  }

  async function handleGenerateForever() {
    isGeneratingForever = true
    shouldStopGeneration = false

    while (isGeneratingForever && !shouldStopGeneration) {
      try {
        await handleGenerate()
        
        // Wait for current generation to complete
        while (isLoading && !shouldStopGeneration) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        
        // If user pressed stop during generation, break
        if (shouldStopGeneration) {
          break
        }
        
        // Small delay between generations
        await new Promise(resolve => setTimeout(resolve, 500))
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

  // Cleanup
  onDestroy(() => {
    if (imageUrl && imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imageUrl)
    }
  })
</script>

<main class="prompt-input">
  <div class="content-grid">
    <section class="form-section">
      <PromptForm {availableCheckpoints} />

      <GenerationControls
        {isLoading}
        {progressData}
        {settings}
        {isGeneratingForever}
        onGenerate={handleGenerate}
        onGenerateForever={handleGenerateForever}
        onStopGeneration={handleStopGeneration}
        onSettingsChange={handleSettingsChange}
      />
    </section>

    <section class="image-section">
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

  .prompt-input {
    min-height: 100vh;
    width: 100vw;
    margin: 0;
    padding: 1rem;
    background: linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%);
    box-sizing: border-box;
  }

  .content-grid {
    display: grid;
    grid-template-columns: 1fr minmax(0, 832px);
    gap: 1rem;
    width: 100%;
    height: calc(100vh - 2rem);
  }

  @media (max-width: 1024px) {
    .content-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
    }
  }

  .form-section {
    min-width: 0;
  }

  .image-section {
    min-width: 0;
  }

  @media (max-width: 768px) {
    .prompt-input {
      padding: 1rem;
    }
  }
</style>

<!-- Component for displaying images with navigation and metadata loading -->
<script lang="ts">
  import { getImageList, getImageMetadata } from './utils/fileIO'
  import type { OptionItem } from '$lib/types'
  import { promptsData } from './stores/promptsStore'
  import { maskOverlay } from './stores/maskOverlayStore'
  import DrawingControls from './DrawingControls.svelte'
  import DrawingCanvas from './DrawingCanvas.svelte'

  interface Props {
    imageUrl: string | null
    currentImageFileName: string
    outputDirectory: string
    onImageChange: (filePath: string) => void
  }

  let { imageUrl, currentImageFileName, outputDirectory, onImageChange }: Props = $props()

  let allFiles: string[] = $state([])
  let currentIndex = $state(-1)
  let isDrawingMode = $state(false)
  let imageElement: HTMLImageElement | undefined = $state()
  let drawingTool = $state<'brush' | 'fill'>('brush')
  let drawingCanvas:
    | { clearMask: () => void; getMaskData: () => string | null; hasMask: () => boolean }
    | undefined = $state()

  // Watch for outputDirectory changes and update file list
  $effect(() => {
    if (outputDirectory) {
      updateFileList()
    }
  })

  // Update file list and current index
  export async function updateFileList() {
    allFiles = await getImageList(outputDirectory)
    if (currentImageFileName) {
      currentIndex = allFiles.indexOf(currentImageFileName)
    } else {
      // If no current image but files exist, load the latest one
      if (allFiles.length > 0 && !currentImageFileName) {
        const latestFile = allFiles[allFiles.length - 1]
        await updateImage(latestFile)
        return
      }
      currentIndex = -1
    }
  }

  // Navigation functions
  async function goToPreviousImage() {
    await updateFileList()
    if (allFiles.length === 0) return

    if (!currentImageFileName) {
      // If no current image, show the latest file
      const latestFile = allFiles[allFiles.length - 1]
      await updateImage(latestFile)
      return
    }

    const currentIndex = allFiles.indexOf(currentImageFileName)
    if (currentIndex > 0) {
      const previousFile = allFiles[currentIndex - 1]
      await updateImage(previousFile)
    }
  }

  async function goToNextImage() {
    await updateFileList()
    if (allFiles.length === 0) return

    if (!currentImageFileName) {
      // If no current image, show the first file
      const firstFile = allFiles[0]
      await updateImage(firstFile)
      return
    }

    const currentIndex = allFiles.indexOf(currentImageFileName)
    if (currentIndex !== -1 && currentIndex < allFiles.length - 1) {
      const nextFile = allFiles[currentIndex + 1]
      await updateImage(nextFile)
    }
  }

  async function updateImage(filePath: string) {
    onImageChange(filePath)
    // TODO: Temporarily disabled metadata loading
    // await loadImageMetadata(filePath)
    await updateFileList()
  }

  function clearMask() {
    drawingCanvas?.clearMask()
  }

  export function getMaskData(): string | null {
    return drawingCanvas?.getMaskData() || null
  }

  export function hasMask(): boolean {
    return drawingCanvas?.hasMask() || false
  }

  export function disableDrawingMode() {
    isDrawingMode = false
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function loadImageMetadata(filePath: string) {
    try {
      const metadata = (await getImageMetadata(filePath)) as { parameters?: string }

      if (metadata && metadata.parameters) {
        // Parse metadata to extract categorized prompts
        const params = metadata.parameters as string

        // Helper function to extract category value from metadata
        function extractCategoryValue(params: string, categoryName: string): string | undefined {
          const pattern = new RegExp(`${categoryName}: ([^\n]*)`, 'i')
          return params.match(pattern)?.[1]?.trim()
        }

        // Helper function to find matching option and create proper OptionItem
        function findOrCreateOption(matchedValue: string, optionsArray: OptionItem[]): OptionItem {
          const existingOption = optionsArray.find((item) => item.value === matchedValue)
          if (existingOption) {
            return { title: existingOption.title, value: existingOption.value }
          }
          // If not found, create with value as title
          return { title: matchedValue, value: matchedValue }
        }

        // Update prompts data based on image metadata
        promptsData.update((data) => {
          const updatedCategories = data.categories.map((category) => {
            // Use category name (capitalized) to extract value from metadata
            const categoryName = category.name.charAt(0).toUpperCase() + category.name.slice(1)
            const matchedValue = extractCategoryValue(params, categoryName)

            if (matchedValue) {
              return {
                ...category,
                currentValue: findOrCreateOption(matchedValue, category.values)
              }
            }
            return category
          })

          return { ...data, categories: updatedCategories }
        })
      }
    } catch (error) {
      console.error('Failed to load image metadata:', error)
    }
  }
</script>

<div class="mx-auto flex w-full flex-col items-center gap-4">
  {#if imageUrl}
    <div class="relative inline-block">
      <img
        bind:this={imageElement}
        src={imageUrl}
        alt=""
        class="block max-h-[calc(100vh-2rem)] max-w-full rounded-lg object-contain shadow-md"
        onload={() => {}}
      />
      {#if $maskOverlay.isVisible && $maskOverlay.maskSrc}
        <img
          src={$maskOverlay.maskSrc}
          alt="Mask overlay"
          class="pointer-events-none absolute top-0 left-0 h-full w-full rounded-lg object-contain opacity-40 mix-blend-multiply"
        />
      {/if}
      <DrawingCanvas bind:this={drawingCanvas} {isDrawingMode} {drawingTool} {imageElement} />
    </div>
  {:else}
    <div
      class="flex h-[1216px] w-[832px] items-center justify-center rounded-lg bg-gray-100 text-lg text-gray-500"
    >
      <p>No image to display</p>
    </div>
  {/if}

  <div class="flex w-full items-center justify-between">
    <div class="flex items-center gap-2">
      {#if imageUrl}
        <DrawingControls bind:isDrawingMode bind:drawingTool onClearMask={clearMask} />
      {/if}
    </div>

    <div class="flex items-center justify-center gap-4">
      <button
        class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-gray-300 bg-gray-100 text-gray-600 transition-all duration-200 hover:scale-105 hover:border-gray-400 hover:bg-gray-200 active:scale-95"
        onclick={goToPreviousImage}
        aria-label="Previous image"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            d="M15 18l-6-6 6-6"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>

      <span class="min-w-[60px] text-center text-sm font-medium text-gray-600">
        {currentIndex >= 0 ? currentIndex + 1 : 0} / {allFiles.length}
      </span>

      <button
        class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-gray-300 bg-gray-100 text-gray-600 transition-all duration-200 hover:scale-105 hover:border-gray-400 hover:bg-gray-200 active:scale-95"
        onclick={goToNextImage}
        aria-label="Next image"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M9 18l6-6-6-6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>

    <div class="w-9"></div>
  </div>
</div>

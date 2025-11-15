<!-- Component for displaying images with navigation and metadata loading -->
<script lang="ts">
  import { getImageList, getImageMetadata } from './utils/fileIO'
  import type { OptionItem } from '$lib/types'
  import { promptsData } from './stores/promptsStore'
  import { maskOverlay } from './stores/maskOverlayStore'
  import DrawingControls from './DrawingControls.svelte'
  import DrawingCanvas from './DrawingCanvas.svelte'
  import { m } from '$lib/paraglide/messages'
  import {
    extractPngParameters,
    createImageObjectUrl,
    revokeImageObjectUrl
  } from './utils/pngMetadata'

  interface Props {
    imageUrl: string | null
    currentImageFileName: string
    outputDirectory: string
    onImageChange: (filePath: string) => void
    onDroppedImageMetadata?: (metadata: string | null) => void
  }

  let {
    imageUrl,
    currentImageFileName,
    outputDirectory,
    onImageChange,
    onDroppedImageMetadata
  }: Props = $props()

  let allFiles: string[] = $state([])
  let currentIndex = $state(-1)
  let isDrawingMode = $state(false)
  let imageElement: HTMLImageElement | undefined = $state()
  let drawingTool = $state<'brush' | 'fill'>('brush')
  let drawingCanvas:
    | { clearMask: () => void; getMaskData: () => string | null; hasMask: () => boolean }
    | undefined = $state()
  let isDragging = $state(false)
  let droppedImageUrl: string | null = $state(null)
  let droppedImageMetadata: string | null = $state(null)

  // Watch for outputDirectory changes and update file list
  $effect(() => {
    if (outputDirectory) {
      updateFileList()
    }
  })

  // Clear dropped image when a new generated image is set
  $effect(() => {
    if (currentImageFileName && droppedImageUrl) {
      // Revoke the dropped image URL
      revokeImageObjectUrl(droppedImageUrl)
      droppedImageUrl = null
      droppedImageMetadata = null
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

  // Drag and drop handlers
  function handleDragEnter(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    isDragging = true
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    // Only set isDragging to false if leaving the drop zone entirely
    if (e.currentTarget === e.target) {
      isDragging = false
    }
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    isDragging = false

    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return

    const file = files[0]
    // Check if it's an image file
    if (!file.type.startsWith('image/')) {
      console.warn('Dropped file is not an image')
      return
    }

    // Revoke previous dropped image URL if exists
    if (droppedImageUrl) {
      revokeImageObjectUrl(droppedImageUrl)
    }

    // Create object URL for display
    droppedImageUrl = createImageObjectUrl(file)

    // Extract PNG metadata if it's a PNG file
    if (file.type === 'image/png') {
      droppedImageMetadata = await extractPngParameters(file)
      // Notify parent component about the metadata
      if (onDroppedImageMetadata) {
        onDroppedImageMetadata(droppedImageMetadata)
      }
    } else {
      droppedImageMetadata = null
      if (onDroppedImageMetadata) {
        onDroppedImageMetadata(null)
      }
    }

    // Clear current image to show dropped image
    onImageChange('')
  }

  // Clean up object URLs when component is destroyed
  $effect(() => {
    return () => {
      if (droppedImageUrl) {
        revokeImageObjectUrl(droppedImageUrl)
      }
    }
  })
</script>

<div class="mx-auto flex w-full flex-col items-center gap-4">
  <div
    class="relative w-full"
    role="region"
    aria-label="Image drop zone"
    ondragenter={handleDragEnter}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
  >
    {#if isDragging}
      <div
        class="bg-opacity-90 pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-lg border-4 border-dashed border-blue-500 bg-blue-50"
      >
        <p class="text-2xl font-semibold text-blue-600">Drop image here</p>
      </div>
    {/if}

    {#if droppedImageUrl}
      <div class="relative inline-block">
        <img
          src={droppedImageUrl}
          alt=""
          class="block max-h-[calc(100vh-2rem)] max-w-full rounded-lg object-contain shadow-md"
        />
      </div>
    {:else if imageUrl}
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
            alt={m['imageViewer.maskOverlay']()}
            class="pointer-events-none absolute top-0 left-0 h-full w-full rounded-lg object-contain opacity-40 mix-blend-multiply"
          />
        {/if}
        <DrawingCanvas bind:this={drawingCanvas} {isDrawingMode} {drawingTool} {imageElement} />
      </div>
    {:else}
      <div
        class="flex h-[1216px] w-[832px] items-center justify-center rounded-lg bg-gray-100 text-lg text-gray-500"
      >
        <p>{m['imageViewer.noImage']()}</p>
      </div>
    {/if}
  </div>

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
        aria-label={m['imageViewer.previous']()}
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
        aria-label={m['imageViewer.next']()}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M9 18l6-6-6-6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>

    <div class="w-9"></div>
  </div>
</div>

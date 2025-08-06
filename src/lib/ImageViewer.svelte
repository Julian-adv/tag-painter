<!-- Component for displaying images with navigation and metadata loading -->
<script lang="ts">
  import { getImageList, getImageMetadata } from './utils/fileIO'
  import type { OptionItem } from '$lib/types'
  import { promptsData } from './stores/promptsStore'
  import { maskOverlay } from './stores/maskOverlayStore'

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
  let canvasElement: HTMLCanvasElement | undefined = $state()
  let imageElement: HTMLImageElement | undefined = $state()
  let isDrawing = $state(false)
  let drawingTool = $state<'brush' | 'fill'>('brush')
  let brushSize = $state(20)
  let customCursorStyle = $state('')
  let fillCursorStyle = $state('')

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

  function toggleDrawingMode() {
    isDrawingMode = !isDrawingMode
    if (isDrawingMode) {
      // Use setTimeout to ensure canvas is rendered before setup
      setTimeout(() => {
        if (canvasElement && imageElement) {
          setupCanvas()
        }
      }, 0)
    } else {
      customCursorStyle = ''
      fillCursorStyle = ''
    }
  }

  function setupCanvas() {
    if (!canvasElement || !imageElement) return

    // Wait for image to be fully loaded and get correct dimensions
    requestAnimationFrame(() => {
      if (!canvasElement || !imageElement) return

      const rect = imageElement.getBoundingClientRect()
      const naturalWidth = imageElement.naturalWidth
      const naturalHeight = imageElement.naturalHeight

      // Set canvas internal dimensions to match natural image size
      canvasElement.width = naturalWidth
      canvasElement.height = naturalHeight

      // Set canvas display size to match rendered image size
      canvasElement.style.width = `${rect.width}px`
      canvasElement.style.height = `${rect.height}px`

      const ctx = canvasElement.getContext('2d')
      if (ctx) {
        // Fill canvas with black background initially
        ctx.fillStyle = 'black'
        ctx.fillRect(0, 0, canvasElement.width, canvasElement.height)

        // Calculate brush size and update cursor
        brushSize = Math.max(30, naturalWidth / 30) // Scale brush size with image
        updateCustomCursor()
        updateFillCursor()

        // Set drawing properties to white for mask areas
        ctx.fillStyle = 'white'
        ctx.strokeStyle = 'white'
        ctx.lineWidth = brushSize
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
      }
    })
  }

  function startDrawing(event: MouseEvent) {
    if (!isDrawingMode || !canvasElement || !imageElement) return

    const rect = canvasElement.getBoundingClientRect()
    const scaleX = canvasElement.width / rect.width
    const scaleY = canvasElement.height / rect.height

    const x = Math.floor((event.clientX - rect.left) * scaleX)
    const y = Math.floor((event.clientY - rect.top) * scaleY)

    if (drawingTool === 'fill') {
      // Fill mode: flood fill at click position
      floodFill(x, y)
    } else {
      // Brush mode: start drawing line
      isDrawing = true
      const ctx = canvasElement.getContext('2d')
      if (ctx) {
        ctx.beginPath()
        ctx.moveTo(x, y)
      }
    }
  }

  function draw(event: MouseEvent) {
    if (!isDrawing || !isDrawingMode || !canvasElement || !imageElement) return

    const rect = canvasElement.getBoundingClientRect()
    const scaleX = canvasElement.width / rect.width
    const scaleY = canvasElement.height / rect.height

    const x = (event.clientX - rect.left) * scaleX
    const y = (event.clientY - rect.top) * scaleY

    const ctx = canvasElement.getContext('2d')
    if (ctx) {
      ctx.lineTo(x, y)
      ctx.stroke()
    }
  }

  function stopDrawing() {
    isDrawing = false
  }

  function clearMask() {
    if (!canvasElement) return
    const ctx = canvasElement.getContext('2d')
    if (ctx) {
      // Fill with black instead of clearing to transparent
      ctx.fillStyle = 'black'
      ctx.fillRect(0, 0, canvasElement.width, canvasElement.height)

      // Reset drawing properties
      ctx.fillStyle = 'white'
      ctx.strokeStyle = 'white'
    }
  }

  export function getMaskData(): string | null {
    if (!canvasElement || !isDrawingMode) return null

    // Convert canvas to base64 image data
    return canvasElement.toDataURL('image/png')
  }

  export function hasMask(): boolean {
    if (!canvasElement || !isDrawingMode) return false

    const ctx = canvasElement.getContext('2d')
    if (!ctx) return false

    // Check if canvas has any non-transparent pixels
    const imageData = ctx.getImageData(0, 0, canvasElement.width, canvasElement.height)
    const data = imageData.data

    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true // Found non-transparent pixel
    }

    return false
  }

  export function disableDrawingMode() {
    isDrawingMode = false
  }

  function updateCustomCursor() {
    if (!canvasElement || !imageElement) return

    // Calculate display size based on canvas display dimensions
    const rect = canvasElement.getBoundingClientRect()
    const scaleX = rect.width / canvasElement.width
    const displayBrushSize = Math.max(8, brushSize * scaleX) // Minimum 8px for visibility

    // Create SVG cursor
    const cursorSize = Math.min(displayBrushSize, 64) // Limit cursor size to 64px
    const svg = `
      <svg xmlns='http://www.w3.org/2000/svg' width='${cursorSize}' height='${cursorSize}' viewBox='0 0 ${cursorSize} ${cursorSize}'>
        <circle cx='${cursorSize / 2}' cy='${cursorSize / 2}' r='${cursorSize / 2 - 1}' fill='white' opacity='0.7'/>
        <circle cx='${cursorSize / 2}' cy='${cursorSize / 2}' r='${cursorSize / 2 - 1}' fill='none' stroke='black' stroke-width='1' opacity='0.6'/>
      </svg>
    `
    const encodedSvg = encodeURIComponent(svg)
    customCursorStyle = `url("data:image/svg+xml,${encodedSvg}") ${cursorSize / 2} ${cursorSize / 2}, crosshair`
  }

  function updateFillCursor() {
    // Create bucket fill cursor
    const cursorSize = 24
    const svg = `
      <svg xmlns='http://www.w3.org/2000/svg' width='${cursorSize}' height='${cursorSize}' viewBox='0 0 24 24'>
        <path fill='white' stroke='black' stroke-width='1' d='M20 14c-.092.064-2 2.083-2 3.5c0 1.494.949 2.448 2 2.5c.906.044 2-.891 2-2.5c0-1.5-1.908-3.436-2-3.5M9.586 20c.378.378.88.586 1.414.586s1.036-.208 1.414-.586l7-7l-.707-.707L11 4.586L8.707 2.293L7.293 3.707L9.586 6L4 11.586c-.378.378-.586.88-.586 1.414s.208 1.036.586 1.414zM11 7.414L16.586 13H5.414z'/>
      </svg>
    `
    const encodedSvg = encodeURIComponent(svg)
    fillCursorStyle = `url("data:image/svg+xml,${encodedSvg}") 12 20, pointer`
  }

  function floodFill(x: number, y: number) {
    if (!canvasElement) return

    const ctx = canvasElement.getContext('2d')
    if (!ctx) return

    const imageData = ctx.getImageData(0, 0, canvasElement.width, canvasElement.height)
    const data = imageData.data
    const width = canvasElement.width
    const height = canvasElement.height

    // Get target color at click position
    const targetIndex = (y * width + x) * 4
    const targetR = data[targetIndex]
    const targetG = data[targetIndex + 1]
    const targetB = data[targetIndex + 2]
    const targetA = data[targetIndex + 3]

    // Fill color (opaque white)
    const fillR = 255
    const fillG = 255
    const fillB = 255
    const fillA = 255 // Fully opaque

    // If target is already fill color, return
    if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) {
      return
    }

    const stack = [[x, y]]

    function matchesTarget(index: number): boolean {
      return (
        data[index] === targetR &&
        data[index + 1] === targetG &&
        data[index + 2] === targetB &&
        data[index + 3] === targetA
      )
    }

    function setPixel(index: number) {
      data[index] = fillR
      data[index + 1] = fillG
      data[index + 2] = fillB
      data[index + 3] = fillA
    }

    while (stack.length > 0) {
      const [currentX, currentY] = stack.pop()!

      if (currentX < 0 || currentX >= width || currentY < 0 || currentY >= height) {
        continue
      }

      const currentIndex = (currentY * width + currentX) * 4

      if (!matchesTarget(currentIndex)) {
        continue
      }

      setPixel(currentIndex)

      // Add neighboring pixels to stack
      stack.push([currentX + 1, currentY])
      stack.push([currentX - 1, currentY])
      stack.push([currentX, currentY + 1])
      stack.push([currentX, currentY - 1])
    }

    ctx.putImageData(imageData, 0, 0)
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

<div class="w-full mx-auto flex flex-col items-center gap-4">
  {#if imageUrl}
    <div class="relative inline-block">
      <img
        bind:this={imageElement}
        src={imageUrl}
        alt=""
        class="max-w-full max-h-[calc(100vh-2rem)] object-contain rounded-lg shadow-md block"
        onload={setupCanvas}
      />
      {#if $maskOverlay.isVisible && $maskOverlay.maskSrc}
        <img
          src={$maskOverlay.maskSrc}
          alt="Mask overlay"
          class="absolute top-0 left-0 w-full h-full object-contain opacity-40 pointer-events-none rounded-lg mix-blend-multiply"
        />
      {/if}
      {#if isDrawingMode}
        <canvas
          bind:this={canvasElement}
          class="absolute top-0 left-0 rounded-lg opacity-40"
          style="cursor: {drawingTool === 'fill'
            ? fillCursorStyle || 'pointer'
            : customCursorStyle || 'crosshair'}"
          onmousedown={startDrawing}
          onmousemove={draw}
          onmouseup={stopDrawing}
          onmouseleave={stopDrawing}
        ></canvas>
      {/if}
    </div>
  {:else}
    <div
      class="flex items-center justify-center w-[832px] h-[1216px] bg-gray-100 rounded-lg text-gray-500 text-lg"
    >
      <p>No image to display</p>
    </div>
  {/if}

  <div class="flex justify-between items-center w-full">
    <div class="flex items-center gap-2">
      {#if imageUrl}
        <button
          class="flex items-center justify-center w-9 h-9 border rounded-full cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 {isDrawingMode
            ? 'bg-sky-500 text-white border-blue-400 hover:bg-blue-600'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'}"
          onclick={toggleDrawingMode}
          aria-label="Draw mask"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M13.707 2.293a1 1 0 0 0-1.414 0l-5.84 5.84c-.015-.001-.029-.009-.044-.009a1 1 0 0 0-.707.293L4.288 9.831a3 3 0 0 0-.878 2.122c0 .802.313 1.556.879 2.121l.707.707l-2.122 2.122A2.92 2.92 0 0 0 2 19.012a2.97 2.97 0 0 0 1.063 2.308c.519.439 1.188.68 1.885.68c.834 0 1.654-.341 2.25-.937l2.04-2.039l.707.706c1.134 1.133 3.109 1.134 4.242.001l1.415-1.414a1 1 0 0 0 .293-.707c0-.026-.013-.05-.015-.076l5.827-5.827a1 1 0 0 0 0-1.414zm-.935 16.024a1.023 1.023 0 0 1-1.414-.001l-1.414-1.413a1 1 0 0 0-1.414 0l-2.746 2.745a1.2 1.2 0 0 1-.836.352a.9.9 0 0 1-.594-.208A.98.98 0 0 1 4 19.01a.96.96 0 0 1 .287-.692l2.829-2.829a1 1 0 0 0 0-1.414L5.701 12.66a1 1 0 0 1-.292-.706c0-.268.104-.519.293-.708l.707-.707l7.071 7.072zm1.889-2.392L8.075 9.339L13 4.414L19.586 11z"
            />
          </svg>
        </button>
        {#if isDrawingMode}
          <div class="flex border border-gray-300 rounded-full bg-gray-50 overflow-hidden w-20">
            <button
              class="flex items-center justify-center flex-1 h-8 cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 {drawingTool ===
              'brush'
                ? 'bg-teal-500 text-white shadow-sm rounded-full'
                : 'text-gray-700 hover:bg-gray-200 rounded-full'}"
              onclick={() => (drawingTool = 'brush')}
              aria-label="Brush mode"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37l-1.34-1.34c-.39-.39-1.02-.39-1.41 0L9 12.25 11.75 15l8.96-8.96c.39-.39.39-1.02 0-1.41z"
                />
              </svg>
            </button>
            <button
              class="flex items-center justify-center flex-1 h-8 cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 {drawingTool ===
              'fill'
                ? 'bg-teal-500 text-white shadow-sm rounded-full'
                : 'text-gray-700 hover:bg-gray-200 rounded-full'}"
              onclick={() => (drawingTool = 'fill')}
              aria-label="Fill mode"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M20 14c-.092.064-2 2.083-2 3.5c0 1.494.949 2.448 2 2.5c.906.044 2-.891 2-2.5c0-1.5-1.908-3.436-2-3.5M9.586 20c.378.378.88.586 1.414.586s1.036-.208 1.414-.586l7-7l-.707-.707L11 4.586L8.707 2.293L7.293 3.707L9.586 6L4 11.586c-.378.378-.586.88-.586 1.414s.208 1.036.586 1.414zM11 7.414L16.586 13H5.414z"
                />
              </svg>
            </button>
          </div>
          <button
            class="flex items-center justify-center w-8 h-8 border border-red-300 rounded-full bg-red-50 text-red-600 cursor-pointer transition-all duration-200 hover:bg-red-100 hover:border-red-400 hover:scale-105 active:scale-95"
            onclick={clearMask}
            aria-label="Clear mask"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M3 6h18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path
                d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        {/if}
      {/if}
    </div>

    <div class="flex justify-center items-center gap-4">
      <button
        class="flex items-center justify-center w-9 h-9 border border-gray-300 rounded-full bg-gray-100 text-gray-600 cursor-pointer transition-all duration-200 hover:bg-gray-200 hover:border-gray-400 hover:scale-105 active:scale-95"
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

      <span class="text-sm text-gray-600 font-medium min-w-[60px] text-center">
        {currentIndex >= 0 ? currentIndex + 1 : 0} / {allFiles.length}
      </span>

      <button
        class="flex items-center justify-center w-9 h-9 border border-gray-300 rounded-full bg-gray-100 text-gray-600 cursor-pointer transition-all duration-200 hover:bg-gray-200 hover:border-gray-400 hover:scale-105 active:scale-95"
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

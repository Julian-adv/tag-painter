<!-- Canvas component for drawing masks -->
<script lang="ts">
  interface Props {
    isDrawingMode: boolean
    drawingTool: 'brush' | 'fill'
    imageElement: HTMLImageElement | undefined
  }

  let { isDrawingMode, drawingTool, imageElement }: Props = $props()

  let canvasElement: HTMLCanvasElement | undefined = $state()
  let isDrawing = $state(false)
  let brushSize = $state(20)
  let brushCursorStyle = $state('')
  let fillCursorStyle = $state('')

  // Setup canvas when drawing mode is enabled and image is loaded
  $effect(() => {
    if (isDrawingMode && imageElement && canvasElement) {
      setupCanvas()
    }
  })

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

      const ctx = canvasElement.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        // Fill canvas with black background initially
        ctx.fillStyle = 'black'
        ctx.fillRect(0, 0, canvasElement.width, canvasElement.height)

        // Calculate brush size and update cursor
        brushSize = Math.max(30, naturalWidth / 30) // Scale brush size with image
        updateBrushCursor()
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
      const ctx = canvasElement.getContext('2d', { willReadFrequently: true })
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

    const ctx = canvasElement.getContext('2d', { willReadFrequently: true })
    if (ctx) {
      ctx.lineTo(x, y)
      ctx.stroke()
    }
  }

  function stopDrawing() {
    isDrawing = false
  }

  export function clearMask() {
    if (!canvasElement) return
    const ctx = canvasElement.getContext('2d', { willReadFrequently: true })
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

    const ctx = canvasElement.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false

    // Check if canvas has any non-transparent pixels
    const imageData = ctx.getImageData(0, 0, canvasElement.width, canvasElement.height)
    const data = imageData.data

    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true // Found non-transparent pixel
    }

    return false
  }

  function updateBrushCursor() {
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
    brushCursorStyle = `url("data:image/svg+xml,${encodedSvg}") ${cursorSize / 2} ${cursorSize / 2}, crosshair`
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

    const ctx = canvasElement.getContext('2d', { willReadFrequently: true })
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
</script>

{#if isDrawingMode}
  <canvas
    bind:this={canvasElement}
    class="absolute top-0 left-0 rounded-lg opacity-40"
    style="cursor: {drawingTool === 'fill'
      ? fillCursorStyle || 'pointer'
      : brushCursorStyle || 'crosshair'}"
    onmousedown={startDrawing}
    onmousemove={draw}
    onmouseup={stopDrawing}
    onmouseleave={stopDrawing}
  ></canvas>
{/if}
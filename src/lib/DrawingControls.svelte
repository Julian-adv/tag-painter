<!-- Drawing controls for mask editing -->
<script lang="ts">
  interface Props {
    isDrawingMode: boolean
    drawingTool: 'brush' | 'fill'
    onClearMask: () => void
  }

  let { isDrawingMode = $bindable(), drawingTool = $bindable(), onClearMask }: Props = $props()
</script>

<div class="flex items-center gap-2">
  <button
    class="flex items-center justify-center w-9 h-9 border rounded-full cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 {isDrawingMode
      ? 'bg-sky-500 text-white border-blue-400 hover:bg-blue-600'
      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'}"
    onclick={() => (isDrawingMode = !isDrawingMode)}
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
      onclick={onClearMask}
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
</div>

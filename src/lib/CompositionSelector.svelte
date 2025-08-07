<!-- Component for selecting image composition layouts -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { promptsData, updateComposition } from './stores/promptsStore'
  import { maskOverlay } from './stores/maskOverlayStore'

  let tempMaskTimestamp = $state(0)

  const getCompositions = () => [
    { id: 'all', src: '/all-mask.png', alt: 'All' },
    { id: 'left-horizontal', src: '/left-horizontal-mask.png', alt: 'Left Horizontal' },
    { id: 'top-vertical', src: '/top-vertical-mask.png', alt: 'Top Vertical' },
    { id: 'temp-mask', src: `/temp_mask.png?t=${tempMaskTimestamp}`, alt: 'Custom Mask' }
  ]

  onMount(() => {
    tempMaskTimestamp = Date.now()
  })

  // Function to refresh temp mask when it's updated
  export function refreshTempMask() {
    tempMaskTimestamp = Date.now()
  }

  // Function to programmatically select composition
  export function selectTempMask() {
    refreshTempMask() // Refresh the mask image first
    updateComposition('temp-mask')
  }

  function selectComposition(compositionId: string) {
    updateComposition(compositionId)
  }

  function handleMouseEnter(maskSrc: string) {
    maskOverlay.showMask(maskSrc)
  }

  function handleMouseLeave() {
    maskOverlay.hideMask()
  }
</script>

<div class="border-gray-200">
  <h3 class="text-sm font-bold text-gray-800 text-left">Composition</h3>
  <div class="flex gap-1 flex-wrap bg-gray-200 p-1 m-2 rounded-lg">
    {#each getCompositions() as composition (composition.id)}
      <button
        type="button"
        class="border-2 border-transparent rounded-lg p-1 cursor-pointer transition-all duration-200 flex items-center justify-center hover:border-sky-300 hover:bg-sky-50 {$promptsData.selectedComposition ===
        composition.id
          ? 'border-sky-500 bg-sky-200'
          : ''}"
        onclick={() => selectComposition(composition.id)}
        onmouseenter={() => handleMouseEnter(composition.src)}
        onmouseleave={handleMouseLeave}
        title={composition.alt}
      >
        <img src={composition.src} alt={composition.alt} class="w-12 h-auto block" />
      </button>
    {/each}
  </div>
</div>

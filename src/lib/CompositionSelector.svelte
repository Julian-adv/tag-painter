<!-- Component for selecting image composition layouts -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { promptsData, updateComposition } from './stores/promptsStore'
  import { maskOverlay } from './stores/maskOverlayStore'
  import { m } from '$lib/paraglide/messages'

  let tempMaskTimestamp = $state(0)

  const getCompositions = () => [
    { id: 'all', src: '/all-mask.png', alt: m['compositionSelector.altAll']() },
    {
      id: 'left-horizontal',
      src: '/left-horizontal-mask.png',
      alt: m['compositionSelector.altLeftHorizontal']()
    },
    { id: 'top-vertical', src: '/top-vertical-mask.png', alt: m['compositionSelector.altTopVertical']() },
    {
      id: 'temp-mask',
      src: `/temp_mask.png?t=${tempMaskTimestamp}`,
      alt: m['compositionSelector.altCustom']()
    }
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
  <h3 class="text-left text-sm font-bold text-gray-800">{m['compositionSelector.title']()}</h3>
  <div class="m-2 flex flex-wrap gap-1 rounded-lg bg-gray-200 p-1">
    {#each getCompositions() as composition (composition.id)}
      <button
        type="button"
        class="flex cursor-pointer items-center justify-center rounded-lg border-2 border-transparent p-1 transition-all duration-200 hover:border-sky-300 hover:bg-sky-50 {$promptsData.selectedComposition ===
        composition.id
          ? 'border-sky-500 bg-sky-200'
          : ''}"
        onclick={() => selectComposition(composition.id)}
        onmouseenter={() => handleMouseEnter(composition.src)}
        onmouseleave={handleMouseLeave}
        title={composition.alt}
      >
        <img src={composition.src} alt={composition.alt} class="block h-auto w-12" />
      </button>
    {/each}
  </div>
</div>

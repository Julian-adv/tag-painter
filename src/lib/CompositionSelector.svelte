<!-- Component for selecting image composition layouts -->
<script lang="ts">
  import { promptsData, updateComposition } from './stores/promptsStore'

  const compositions = [
    { id: 'all', src: '/all-mask.png', alt: 'All' },
    { id: 'left-horizontal', src: '/left-horizontal-mask.png', alt: 'Left Horizontal' },
    { id: 'left-top', src: '/left-top-mask.png', alt: 'Left Top' },
    { id: 'top-right', src: '/top-right-mask.png', alt: 'Top Right' },
    { id: 'top-vertical', src: '/top-vertical-mask.png', alt: 'Top Vertical' }
  ]

  function selectComposition(compositionId: string) {
    updateComposition(compositionId)
  }
</script>

<div class="border-gray-200">
  <h3 class="text-sm font-bold text-gray-800 text-left">Composition</h3>
  <div class="flex gap-1 flex-wrap bg-gray-200 p-1 m-2 rounded-lg">
    {#each compositions as composition (composition.id)}
      <button
        type="button"
        class="border-2 border-transparent rounded-lg p-1 cursor-pointer transition-all duration-200 flex items-center justify-center hover:border-sky-300 hover:bg-sky-50 {$promptsData.selectedComposition ===
        composition.id
          ? 'border-sky-500 bg-sky-200'
          : ''}"
        onclick={() => selectComposition(composition.id)}
        title={composition.alt}
      >
        <img src={composition.src} alt={composition.alt} class="w-12 h-auto block" />
      </button>
    {/each}
  </div>
</div>

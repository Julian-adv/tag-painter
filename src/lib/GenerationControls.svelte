<!-- Component for generation controls, progress bar, and loading state -->
<script lang="ts">
  import SettingsDialog from './SettingsDialog.svelte'
  import { Cog8Tooth, Play, Stop, ArrowPath } from 'svelte-heros-v2'
  import type { Settings, ProgressData } from '$lib/types'

  interface Props {
    isLoading: boolean
    progressData: ProgressData
    settings: Settings
    onGenerate: () => void
    onRegenerate: () => void
    onGenerateForever: () => void
    onStopGeneration: () => void
    isGeneratingForever: boolean
    onSettingsChange: (settings: Settings) => void
    lastSeed: number | null
  }

  let {
    isLoading,
    progressData,
    settings,
    onGenerate,
    onRegenerate,
    onGenerateForever,
    onStopGeneration,
    isGeneratingForever,
    onSettingsChange,
    lastSeed
  }: Props = $props()

  let showSettingsDialog = $state(false)

  function openSettingsDialog() {
    showSettingsDialog = true
  }

  function closeSettingsDialog() {
    showSettingsDialog = false
  }

  function handleSettingsChange(newSettings: Settings) {
    onSettingsChange(newSettings)
    showSettingsDialog = false
  }
</script>

<div class="flex flex-col gap-0 w-full mt-2">
  <div class="flex gap-4 items-center justify-center">
    <button
      class="px-3 py-1.5 text-white border-none rounded-md text-sm font-semibold cursor-pointer transition-all duration-200 h-9 bg-sky-500 hover:enabled:bg-sky-500 hover:enabled:-translate-y-0.5 hover:enabled:shadow-lg active:enabled:translate-y-0 disabled:bg-gray-300 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
      onclick={onGenerate}
      disabled={isLoading || isGeneratingForever}
    >
      {isLoading ? 'Generating...' : 'Generate'}
    </button>

    <button
      class="flex items-center justify-center gap-1 px-2 py-1.5 text-white border-none rounded-md text-sm font-semibold cursor-pointer transition-all duration-200 h-9 bg-green-500 hover:enabled:bg-green-600 hover:enabled:-translate-y-0.5 hover:enabled:shadow-lg active:enabled:translate-y-0 disabled:bg-gray-300 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
      onclick={onRegenerate}
      disabled={isLoading || isGeneratingForever || lastSeed === null}
      title={lastSeed !== null ? `Regenerate with seed: ${lastSeed}` : 'No previous seed available'}
    >
      <ArrowPath class="w-4 h-4" />
      Regen
    </button>

    <button
      class="flex items-center justify-center w-9 h-9 border border-sky-200 bg-sky-50 text-sky-400 rounded-md cursor-pointer transition-all duration-200 hover:enabled:bg-sky-200 hover:enabled:-translate-y-0.5 hover:enabled:shadow-lg active:enabled:translate-y-0 disabled:text-sky-100 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
      onclick={isGeneratingForever ? onStopGeneration : onGenerateForever}
      disabled={isLoading && !isGeneratingForever}
    >
      {#if isGeneratingForever}
        <Stop />
      {:else}
        <Play />
      {/if}
    </button>

    <button
      class="flex items-center justify-center w-9 h-9 bg-gray-100 border border-gray-300 text-gray-600 rounded-md cursor-pointer transition-all duration-200 hover:enabled:bg-gray-200 hover:enabled:-translate-y-0.5 hover:enabled:shadow-lg active:enabled:translate-y-0 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
      onclick={openSettingsDialog}
      disabled={isLoading}
      aria-label="Settings"
      ><Cog8Tooth />
    </button>
  </div>

  <!-- Progress container - always present to maintain height -->
  <div class="flex items-center gap-4 mt-2 opacity-0" class:!opacity-100={isLoading}>
    <div class="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
      <div
        class="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-100 ease-out"
        style="width: {isLoading ? (progressData.value / progressData.max) * 100 : 0}%"
      ></div>
    </div>
    <span class="text-sm font-medium text-gray-600 min-w-[40px] text-right">
      {isLoading ? Math.round((progressData.value / progressData.max) * 100) : 0}%
    </span>
  </div>

  <!-- Current node container - always present to maintain height -->
  <div
    class="text-xs text-gray-500 text-left italic min-h-[1.2em] opacity-0"
    class:!opacity-100={isLoading && progressData.currentNode}
  >
    {progressData.currentNode || 'Ready'}
  </div>
</div>

<SettingsDialog
  show={showSettingsDialog}
  {settings}
  onClose={closeSettingsDialog}
  onSave={handleSettingsChange}
/>

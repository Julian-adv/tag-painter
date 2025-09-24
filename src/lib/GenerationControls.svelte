<!-- Component for generation controls, progress bar, and loading state -->
<script lang="ts">
  import SettingsDialog from './SettingsDialog.svelte'
  import { Cog8Tooth, Play, Stop, ArrowPath, PaintBrush } from 'svelte-heros-v2'
  import { m } from '$lib/paraglide/messages'
  import type { Settings, ProgressData } from '$lib/types'

  interface Props {
    isLoading: boolean
    progressData: ProgressData
    settings: Settings
    onGenerate: () => void
    onInpaint: (denoiseStrength: number) => void
    onRegenerate: () => void
    onGenerateForever: () => void
    onStopGeneration: () => void
    isGeneratingForever: boolean
    onSettingsChange: (settings: Settings) => void
    lastSeed: number | null
    disableInpaint?: boolean
  }

  let {
    isLoading,
    progressData,
    settings,
    onGenerate,
    onInpaint,
    onRegenerate,
    onGenerateForever,
    onStopGeneration,
    isGeneratingForever,
    onSettingsChange,
    lastSeed,
    disableInpaint = false
  }: Props = $props()

  let showSettingsDialog = $state(false)
  let initialSettingsFocus: 'quality' | 'negative' | null = $state(null)
  let inpaintDenoiseStrength = $state(0.55)

  // Public API for parent to open the dialog
  export function openSettingsDialogExternal(focusField: 'quality' | 'negative' | null) {
    initialSettingsFocus = focusField
    showSettingsDialog = true
  }

  function openSettingsDialog() {
    initialSettingsFocus = null
    showSettingsDialog = true
  }

  function closeSettingsDialog() {
    showSettingsDialog = false
    initialSettingsFocus = null
  }

  function handleSettingsChange(newSettings: Settings) {
    onSettingsChange(newSettings)
    showSettingsDialog = false
    initialSettingsFocus = null
  }
</script>

<div class="mt-2 flex w-full flex-col gap-2">
  <!-- First row: Generate, Regen, Forever, Settings -->
  <div class="flex items-center justify-center gap-4">
    <button
      class="h-9 cursor-pointer rounded-md border-none bg-sky-500 px-3 py-1.5 text-sm font-semibold text-white transition-all duration-200 hover:enabled:-translate-y-0.5 hover:enabled:bg-sky-500 hover:enabled:shadow-lg active:enabled:translate-y-0 disabled:transform-none disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
      onclick={onGenerate}
      disabled={isLoading || isGeneratingForever}
    >
      {isLoading ? m['generationControls.generating']() : m['generationControls.generate']()}
    </button>

    <button
      class="flex h-9 cursor-pointer items-center justify-center gap-1 rounded-md border-none bg-green-500 px-2 py-1.5 text-sm font-semibold text-white transition-all duration-200 hover:enabled:-translate-y-0.5 hover:enabled:bg-green-600 hover:enabled:shadow-lg active:enabled:translate-y-0 disabled:transform-none disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
      onclick={onRegenerate}
      disabled={isLoading || isGeneratingForever || lastSeed === null}
      title={lastSeed !== null
        ? m['generationControls.regenTooltip']({ seed: String(lastSeed) })
        : m['generationControls.regenTooltipMissing']()}
    >
      <ArrowPath class="h-4 w-4" />
      {m['generationControls.regen']()}
    </button>

    <button
      class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-sky-200 bg-sky-50 text-sky-400 transition-all duration-200 hover:enabled:-translate-y-0.5 hover:enabled:bg-sky-200 hover:enabled:shadow-lg active:enabled:translate-y-0 disabled:transform-none disabled:cursor-not-allowed disabled:text-sky-100 disabled:shadow-none"
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
      class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-gray-300 bg-gray-100 text-gray-600 transition-all duration-200 hover:enabled:-translate-y-0.5 hover:enabled:bg-gray-200 hover:enabled:shadow-lg active:enabled:translate-y-0 disabled:transform-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none"
      onclick={openSettingsDialog}
      disabled={isLoading}
      aria-label={m['generationControls.settings']()}
      ><Cog8Tooth />
    </button>
  </div>

  <!-- Second row: Inpaint -->
  <div class="flex items-center justify-center gap-4">
    <button
      class="flex h-9 cursor-pointer items-center justify-center gap-1 rounded-md border-none bg-purple-500 px-3 py-1.5 text-sm font-semibold text-white transition-all duration-200 hover:enabled:-translate-y-0.5 hover:enabled:bg-purple-600 hover:enabled:shadow-lg active:enabled:translate-y-0 disabled:transform-none disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
      onclick={() => onInpaint(inpaintDenoiseStrength)}
      disabled={disableInpaint || isLoading || isGeneratingForever}
    >
      <PaintBrush class="h-4 w-4" />
      {m['generationControls.inpaint']()}
    </button>

    <div class="flex items-center gap-2">
      <label for="denoise-strength" class="text-sm font-medium text-gray-600">
        {m['generationControls.denoise']()}
      </label>
      <input
        id="denoise-strength"
        type="number"
        min="0.1"
        max="1.0"
        step="0.05"
        bind:value={inpaintDenoiseStrength}
        class="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-none"
        disabled={isLoading || isGeneratingForever}
      />
    </div>
  </div>

  <!-- Progress container - always present to maintain height -->
  <div class="mt-2 flex items-center gap-4 opacity-0" class:!opacity-100={isLoading}>
    <div class="h-2 flex-1 overflow-hidden rounded bg-gray-100">
      <div
        class="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-100 ease-out"
        style="width: {isLoading ? (progressData.value / progressData.max) * 100 : 0}%"
      ></div>
    </div>
    <span class="min-w-[40px] text-right text-sm font-medium text-gray-600">
      {isLoading ? Math.round((progressData.value / progressData.max) * 100) : 0}%
    </span>
  </div>

  <!-- Current node container - always present to maintain height -->
  <div
    class="min-h-[1.2em] text-left text-xs text-gray-500 italic opacity-0"
    class:!opacity-100={isLoading && progressData.currentNode}
  >
    {progressData.currentNode || m['generationControls.ready']()}
  </div>
</div>

<SettingsDialog
  show={showSettingsDialog}
  {settings}
  initialFocus={initialSettingsFocus}
  onClose={closeSettingsDialog}
  onSave={handleSettingsChange}
/>

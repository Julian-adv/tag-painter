<!-- Component for generation controls, progress bar, and loading state -->
<script lang="ts">
  import SettingsDialog from './SettingsDialog.svelte'
  import { Cog8Tooth, Play, Stop } from 'svelte-heros-v2'
  import type { Settings, ProgressData } from '$lib/types'

  interface Props {
    isLoading: boolean
    progressData: ProgressData
    settings: Settings
    onGenerate: () => void
    onGenerateForever: () => void
    onStopGeneration: () => void
    isGeneratingForever: boolean
    onSettingsChange: (settings: Settings) => void
  }

  let {
    isLoading,
    progressData,
    settings,
    onGenerate,
    onGenerateForever,
    onStopGeneration,
    isGeneratingForever,
    onSettingsChange
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

<div class="generation-controls">
  <div class="controls-row">
    <button
      class="generate-btn bg-sky-500"
      onclick={onGenerate}
      disabled={isLoading || isGeneratingForever}
    >
      {isLoading ? 'Generating...' : 'Generate'}
    </button>

    <button
      class="generate-forever-btn border border-sky-200 bg-sky-50 text-sky-400 hover:not-disabled:bg-sky-200 disabled:text-sky-100"
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
      class="settings-btn"
      onclick={openSettingsDialog}
      disabled={isLoading}
      aria-label="Settings"
      ><Cog8Tooth />
    </button>
  </div>

  {#if isLoading}
    <div class="progress-container">
      <div class="progress-bar">
        <div
          class="progress-fill"
          style="width: {(progressData.value / progressData.max) * 100}%"
        ></div>
      </div>
      <span class="progress-text">
        {Math.round((progressData.value / progressData.max) * 100)}%
      </span>
    </div>
    {#if progressData.currentNode}
      <div class="current-node">
        {progressData.currentNode}
      </div>
    {/if}
  {/if}
</div>

<SettingsDialog
  show={showSettingsDialog}
  {settings}
  onClose={closeSettingsDialog}
  onSave={handleSettingsChange}
/>

<style>
  .generation-controls {
    display: flex;
    flex-direction: column;
    gap: 0rem;
    width: 100%;
    margin-top: 1rem;
  }

  .controls-row {
    display: flex;
    gap: 1rem;
    align-items: center;
    justify-content: center;
  }

  .generate-btn {
    padding: 0.375rem 0.75rem;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    height: 36px;
  }

  .generate-btn:hover:not(:disabled) {
    background: var(--color-sky-500);
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  }

  .generate-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .generate-btn:disabled {
    background: #cccccc;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .generate-forever-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.375rem;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    width: 36px;
    height: 36px;
  }

  .generate-forever-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  }

  .generate-forever-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .generate-forever-btn:disabled {
    background: #cccccc;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .settings-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.375rem;
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s ease;
    width: 36px;
    height: 36px;
  }

  .settings-btn:hover:not(:disabled) {
    background: #e9e9e9;
    border-color: #bbb;
  }

  .settings-btn:disabled {
    background: #f9f9f9;
    color: #999;
    cursor: not-allowed;
  }

  .progress-container {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: 0.5rem;
  }

  .progress-bar {
    flex: 1;
    height: 8px;
    background: #f0f0f0;
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #2196f3, #1976d2);
    transition: width 0.1s ease;
  }

  .progress-text {
    font-size: 0.875rem;
    font-weight: 500;
    color: #666;
    min-width: 40px;
    text-align: right;
  }

  .current-node {
    font-size: 0.75rem;
    color: #999;
    text-align: left;
    font-style: italic;
  }
</style>

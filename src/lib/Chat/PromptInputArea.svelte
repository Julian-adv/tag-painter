<script lang="ts">
  interface Props {
    inputPrompt: string
    isLoading: boolean
    isGeneralizing: boolean
    onAnalyze: () => void
    onGeneralize: () => void
    onClear: () => void
  }

  let {
    inputPrompt = $bindable(),
    isLoading,
    isGeneralizing,
    onAnalyze,
    onGeneralize,
    onClear
  }: Props = $props()

  function handleKeydown(event: KeyboardEvent) {
    if (event.isComposing) return
    if (isLoading) return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onAnalyze()
    }
  }
</script>

<div class="border-t border-gray-200 p-2">
  <div class="flex flex-col gap-1">
    <textarea
      bind:value={inputPrompt}
      onkeydown={handleKeydown}
      placeholder="Enter image prompt to analyze..."
      class="w-full resize-none rounded-lg border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
      rows="10"
      disabled={isLoading}
    ></textarea>
    <div class="flex gap-1">
      <button
        type="button"
        onclick={onClear}
        class="rounded-md border border-gray-300 bg-gray-100 px-4 py-1 text-sm font-medium text-gray-600 transition hover:bg-gray-200"
      >
        Clear
      </button>
      <button
        type="button"
        onclick={onAnalyze}
        disabled={!inputPrompt.trim() || isLoading || isGeneralizing}
        class="rounded-md border border-gray-300 bg-gray-100 px-4 py-1 text-sm font-medium text-gray-600 transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? 'Analyzing...' : 'Analyze'}
      </button>
      <button
        type="button"
        onclick={onGeneralize}
        disabled={!inputPrompt.trim() || isLoading || isGeneralizing}
        class="rounded-md border border-gray-300 bg-gray-100 px-4 py-1 text-sm font-medium text-gray-600 transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isGeneralizing ? 'Generalizing...' : 'Generalize'}
      </button>
    </div>
  </div>
</div>

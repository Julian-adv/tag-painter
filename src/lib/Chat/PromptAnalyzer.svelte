<script lang="ts">
  import type { PromptAnalysis } from '$lib/types'
  import { clearAllPins } from '$lib/stores/testModeStore.svelte'
  import { type SlotMapping } from './promptAnalyzerTypes'
  import {
    analyzeWithGemini,
    analyzeWithOpenRouter,
    analyzeWithOllama,
    generalizeWithGemini,
    generalizeWithOpenRouter,
    generalizeWithOllama
  } from './promptAnalyzerApi'
  import GeneralizedPromptDisplay from './GeneralizedPromptDisplay.svelte'
  import AnalysisResultDisplay from './AnalysisResultDisplay.svelte'
  import PromptInputArea from './PromptInputArea.svelte'

  interface Props {
    apiKey: string
    openRouterApiKey: string
    ollamaBaseUrl: string
    ollamaModel: string
    apiProvider: 'gemini' | 'openrouter' | 'ollama'
    wildcardsFile?: string
    onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void
  }

  let {
    apiKey = '',
    openRouterApiKey = '',
    ollamaBaseUrl = 'http://localhost:11434',
    ollamaModel = 'llama3.2',
    apiProvider = 'gemini',
    wildcardsFile,
    onShowToast
  }: Props = $props()

  let inputPrompt = $state('')
  let isLoading = $state(false)
  let isGeneralizing = $state(false)
  let analysis: PromptAnalysis | null = $state(null)
  let generalizedPrompt: string | null = $state(null)
  let slotMappings: SlotMapping[] = $state([])

  async function analyzePrompt() {
    const trimmed = inputPrompt.trim()
    if (!trimmed) return

    if (apiProvider !== 'ollama') {
      const isOpenRouter = apiProvider === 'openrouter'
      const activeKey = isOpenRouter ? openRouterApiKey.trim() : apiKey.trim()

      if (!activeKey) {
        const providerName = isOpenRouter ? 'OpenRouter' : 'Gemini'
        onShowToast(`Add your ${providerName} API key in Settings to enable analysis.`, 'error')
        return
      }
    }

    isLoading = true
    analysis = null

    try {
      if (apiProvider === 'ollama') {
        analysis = await analyzeWithOllama(trimmed, ollamaBaseUrl, ollamaModel)
      } else if (apiProvider === 'openrouter') {
        analysis = await analyzeWithOpenRouter(trimmed, openRouterApiKey.trim())
      } else {
        analysis = await analyzeWithGemini(trimmed, apiKey.trim())
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analysis failed.'
      onShowToast(message, 'error')
    } finally {
      isLoading = false
    }
  }

  async function generalizePrompt() {
    const trimmed = inputPrompt.trim()
    if (!trimmed) return

    if (apiProvider !== 'ollama') {
      const isOpenRouter = apiProvider === 'openrouter'
      const activeKey = isOpenRouter ? openRouterApiKey.trim() : apiKey.trim()

      if (!activeKey) {
        const providerName = isOpenRouter ? 'OpenRouter' : 'Gemini'
        onShowToast(`Add your ${providerName} API key in Settings to enable generalization.`, 'error')
        return
      }
    }

    isGeneralizing = true
    generalizedPrompt = null
    slotMappings = []

    try {
      let result
      if (apiProvider === 'ollama') {
        result = await generalizeWithOllama(trimmed, ollamaBaseUrl, ollamaModel)
      } else if (apiProvider === 'openrouter') {
        result = await generalizeWithOpenRouter(trimmed, openRouterApiKey.trim())
      } else {
        result = await generalizeWithGemini(trimmed, apiKey.trim())
      }
      generalizedPrompt = result.prompt
      slotMappings = result.mappings
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Generalization failed.'
      onShowToast(message, 'error')
    } finally {
      isGeneralizing = false
    }
  }

  function clearAnalysis() {
    analysis = null
    generalizedPrompt = null
    slotMappings = []
    inputPrompt = ''
    clearAllPins()
  }
</script>

<div class="flex h-full flex-col bg-white">
  <div class="flex-1 overflow-y-auto p-2">
    {#if generalizedPrompt}
      <GeneralizedPromptDisplay
        {generalizedPrompt}
        {slotMappings}
        {wildcardsFile}
        {onShowToast}
      />
    {:else if analysis}
      <AnalysisResultDisplay {analysis} {wildcardsFile} {onShowToast} />
    {:else if isLoading}
      <div class="flex h-full items-center justify-center text-gray-400">
        <p>Analyzing prompt...</p>
      </div>
    {:else if isGeneralizing}
      <div class="flex h-full items-center justify-center text-gray-400">
        <p>Generalizing prompt...</p>
      </div>
    {:else}
      <div class="flex h-full items-center justify-center text-gray-400">
        <p>Enter a prompt to analyze or generalize...</p>
      </div>
    {/if}
  </div>

  <PromptInputArea
    bind:inputPrompt
    {isLoading}
    {isGeneralizing}
    onAnalyze={analyzePrompt}
    onGeneralize={generalizePrompt}
    onClear={clearAnalysis}
  />
</div>

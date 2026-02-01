<script lang="ts">
  import { Plus } from 'svelte-heros-v2'
  import type { PromptAnalysis } from '$lib/types'
  import type { TreeModel } from '$lib/TreeEdit/model'
  import {
    FIELD_LABELS,
    FIELD_TO_YAML_NODE,
    FIELD_ORDER,
    type SubNodeOption
  } from './promptAnalyzerTypes'
  import {
    isValidValue,
    addAnalysisFieldToYaml,
    handleSubNodeSelectAction
  } from './promptAnalyzerYaml'

  interface Props {
    analysis: PromptAnalysis
    wildcardsFile: string | undefined
    onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void
  }

  let { analysis, wildcardsFile, onShowToast }: Props = $props()

  let pendingAdd: {
    field: keyof PromptAnalysis
    value: string
    model: TreeModel
    options: SubNodeOption[]
  } | null = $state(null)

  async function handleAddToYaml(field: keyof PromptAnalysis) {
    const result = await addAnalysisFieldToYaml(field, analysis, wildcardsFile, onShowToast)
    if (result.needsSubNodeSelect && result.options && result.model) {
      pendingAdd = {
        field,
        value: analysis[field] || '',
        model: result.model,
        options: result.options
      }
    }
  }

  async function handleSubNodeSelect(option: SubNodeOption) {
    if (!pendingAdd) return

    await handleSubNodeSelectAction(
      option,
      pendingAdd.model,
      pendingAdd.value,
      wildcardsFile,
      onShowToast
    )
    pendingAdd = null
  }

  function cancelSubNodeSelect() {
    pendingAdd = null
  }
</script>

<svelte:document onclick={cancelSubNodeSelect} />

<div class="flex flex-col gap-2">
  {#each FIELD_ORDER as field}
    <div class="rounded-lg border border-gray-200 bg-gray-50 p-2">
      <div class="mb-1 flex items-center justify-between">
        <span class="text-xs font-semibold text-gray-500">{FIELD_LABELS[field]}</span>
        {#if isValidValue(analysis[field])}
          <div class="relative">
            <button
              type="button"
              onclick={(e) => {
                e.stopPropagation()
                handleAddToYaml(field)
              }}
              class="flex h-5 w-5 items-center justify-center rounded border border-gray-300 bg-white text-gray-500 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600"
              title="Add to {Array.isArray(FIELD_TO_YAML_NODE[field]) ? FIELD_TO_YAML_NODE[field].join('/') : FIELD_TO_YAML_NODE[field]}"
            >
              <Plus size="14" />
            </button>
            {#if pendingAdd && pendingAdd.field === field}
              <div
                class="absolute right-0 top-full z-50 mt-1 min-w-32 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                onclick={(e) => e.stopPropagation()}
                onkeydown={(e) => e.key === 'Escape' && cancelSubNodeSelect()}
                role="menu"
                tabindex="-1"
              >
                {#each pendingAdd.options as option}
                  <button
                    type="button"
                    class="w-full px-3 py-1.5 text-left text-sm text-gray-700 transition hover:bg-blue-50 hover:text-blue-700"
                    onclick={() => handleSubNodeSelect(option)}
                  >
                    {option.path}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
      <div class="text-sm text-gray-800">{analysis[field] || 'N/A'}</div>
    </div>
  {/each}
</div>

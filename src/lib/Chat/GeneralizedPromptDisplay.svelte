<script lang="ts">
  import { Plus } from 'svelte-heros-v2'
  import type { TreeModel } from '$lib/TreeEdit/model'
  import {
    SLOT_TO_YAML_NODE,
    type SlotMapping,
    type SubNodeOption
  } from './promptAnalyzerTypes'
  import {
    getSlotNodeName,
    addGeneralizedPromptToYaml,
    addSlotMappingToYaml,
    handleSubNodeSelectAction
  } from './promptAnalyzerYaml'

  interface Props {
    generalizedPrompt: string
    slotMappings: SlotMapping[]
    wildcardsFile: string | undefined
    onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void
  }

  let { generalizedPrompt, slotMappings, wildcardsFile, onShowToast }: Props = $props()

  let pendingSlotAdd: {
    mapping: SlotMapping
    model: TreeModel
    options: SubNodeOption[]
  } | null = $state(null)

  async function handleAddGeneralized() {
    await addGeneralizedPromptToYaml(generalizedPrompt, wildcardsFile, onShowToast)
  }

  async function handleAddSlotMapping(mapping: SlotMapping) {
    const result = await addSlotMappingToYaml(mapping, wildcardsFile, onShowToast)
    if (result.needsSubNodeSelect && result.options && result.model) {
      pendingSlotAdd = {
        mapping,
        model: result.model,
        options: result.options
      }
    }
  }

  async function handleSlotSubNodeSelect(option: SubNodeOption) {
    if (!pendingSlotAdd) return

    await handleSubNodeSelectAction(
      option,
      pendingSlotAdd.model,
      pendingSlotAdd.mapping.original,
      wildcardsFile,
      onShowToast
    )
    pendingSlotAdd = null
  }

  function cancelSlotSubNodeSelect() {
    pendingSlotAdd = null
  }
</script>

<svelte:document onclick={cancelSlotSubNodeSelect} />

<div class="flex flex-col gap-2">
  <div class="rounded-lg border border-blue-200 bg-blue-50 p-3">
    <div class="mb-2 flex items-center justify-between">
      <span class="text-xs font-semibold text-blue-600">Generalized Prompt</span>
      <button
        type="button"
        onclick={handleAddGeneralized}
        class="flex h-5 w-5 items-center justify-center rounded border border-blue-300 bg-white text-blue-500 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600"
        title="Add to 'all' node"
      >
        <Plus size="14" />
      </button>
    </div>
    <div class="whitespace-pre-wrap text-sm text-gray-800">{generalizedPrompt}</div>
  </div>

  {#if slotMappings.length > 0}
    <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div class="mb-2 text-xs font-semibold text-gray-500">Slot Mappings</div>
      <div class="flex flex-col gap-1.5">
        {#each slotMappings as mapping}
          <div class="flex items-start gap-2 text-sm">
            <span class="shrink-0 rounded bg-purple-100 px-1.5 py-0.5 font-mono text-xs text-purple-700"
              >{mapping.slot}</span
            >
            <span class="text-gray-400">←</span>
            <span class="flex-1 text-gray-700">{mapping.original}</span>
            {#if SLOT_TO_YAML_NODE[mapping.slot]}
              <div class="relative shrink-0">
                <button
                  type="button"
                  onclick={(e) => {
                    e.stopPropagation()
                    handleAddSlotMapping(mapping)
                  }}
                  class="flex h-5 w-5 items-center justify-center rounded border border-gray-300 bg-white text-gray-500 transition hover:border-purple-400 hover:bg-purple-50 hover:text-purple-600"
                  title="Add to {getSlotNodeName(mapping.slot)}"
                >
                  <Plus size="14" />
                </button>
                {#if pendingSlotAdd && pendingSlotAdd.mapping.slot === mapping.slot}
                  <div
                    class="absolute right-0 top-full z-50 mt-1 min-w-32 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                    onclick={(e) => e.stopPropagation()}
                    onkeydown={(e) => e.key === 'Escape' && cancelSlotSubNodeSelect()}
                    role="menu"
                    tabindex="-1"
                  >
                    {#each pendingSlotAdd.options as option}
                      <button
                        type="button"
                        class="w-full px-3 py-1.5 text-left text-sm text-gray-700 transition hover:bg-purple-50 hover:text-purple-700"
                        onclick={() => handleSlotSubNodeSelect(option)}
                      >
                        {option.path}
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<script lang="ts">
  import { Plus } from 'svelte-heros-v2'
  import type { PromptAnalysis } from '$lib/types'
  import { fetchWildcardsText, saveWildcardsText } from '$lib/api/wildcards'
  import { fromYAML, toYAML } from '$lib/TreeEdit/yaml-io'
  import {
    uid,
    addChild,
    type LeafNode,
    type ArrayNode,
    type ObjectNode,
    type TreeModel
  } from '$lib/TreeEdit/model'
  import { refreshWildcardsFromServer } from '$lib/stores/tagsStore'

  interface Props {
    apiKey: string
    wildcardsFile?: string
    onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void
  }

  interface SubNodeOption {
    id: string
    name: string
    path: string
  }

  interface PendingAdd {
    field: keyof PromptAnalysis
    value: string
    nodeName: string
    model: TreeModel
    options: SubNodeOption[]
  }

  let { apiKey = '', wildcardsFile, onShowToast }: Props = $props()

  let inputPrompt = $state('')
  let isLoading = $state(false)
  let analysis: PromptAnalysis | null = $state(null)
  let pendingAdd: PendingAdd | null = $state(null)

  const GEMINI_MODEL_ID = 'gemini-2.5-flash'

  const ANALYSIS_SCHEMA = {
    type: 'OBJECT',
    properties: {
      pose: {
        type: 'STRING',
        description: 'The specific physical pose or action of the subject (excluding facial expression).'
      },
      expression: {
        type: 'STRING',
        description: 'The facial expression, mood, or emotional state of the subject.'
      },
      composition: {
        type: 'STRING',
        description: 'The camera angle, shot type (e.g., close up, wide), and framing.'
      },
      background: {
        type: 'STRING',
        description: 'The environment, setting, and background details.'
      },
      lighting: {
        type: 'STRING',
        description: 'The lighting conditions, color of light, and shadows.'
      },
      hairStyle: {
        type: 'STRING',
        description: 'The shape, length, and texture of the hair (e.g., long wavy, short bob).'
      },
      hairColor: {
        type: 'STRING',
        description: 'The specific color of the hair (e.g., neon pink, platinum blonde).'
      },
      eyes: {
        type: 'STRING',
        description: 'Eye color and specific eye features or gaze.'
      },
      outfit: {
        type: 'STRING',
        description: 'Description of the main outfit (combining top and bottom, or dress/jumpsuit).'
      },
      legwear: {
        type: 'STRING',
        description: 'Description of legwear or stockings.'
      },
      footwear: {
        type: 'STRING',
        description: 'Description of the footwear.'
      },
      accessories: {
        type: 'STRING',
        description: 'Jewelry, hats, glasses, or other portable items.'
      }
    },
    required: [
      'pose',
      'expression',
      'composition',
      'background',
      'lighting',
      'hairStyle',
      'hairColor',
      'eyes',
      'outfit',
      'legwear',
      'footwear',
      'accessories'
    ]
  }

  const FIELD_LABELS: Record<keyof PromptAnalysis, string> = {
    pose: 'Pose',
    expression: 'Expression',
    composition: 'Composition',
    background: 'Background',
    lighting: 'Lighting',
    hairStyle: 'Hair Style',
    hairColor: 'Hair Color',
    eyes: 'Eyes',
    outfit: 'Outfit',
    legwear: 'Legwear',
    footwear: 'Footwear',
    accessories: 'Accessories'
  }

  // Mapping from analysis fields to YAML node names (can be single name or array of names)
  const FIELD_TO_YAML_NODE: Record<keyof PromptAnalysis, string | string[]> = {
    pose: ['pose', 'pose2'],
    expression: 'expression',
    composition: 'composition',
    background: 'background',
    lighting: 'lighting',
    hairStyle: 'hair_style',
    hairColor: 'hair_color',
    eyes: 'eyes',
    outfit: ['clothing_style_with_stockings', 'clothing_style_without_stockings'],
    legwear: 'leg_wear',
    footwear: 'shoes',
    accessories: 'accessories'
  }

  const FIELD_ORDER: (keyof PromptAnalysis)[] = [
    'pose',
    'expression',
    'composition',
    'background',
    'lighting',
    'hairStyle',
    'hairColor',
    'eyes',
    'outfit',
    'legwear',
    'footwear',
    'accessories'
  ]

  // Find a node by name in the tree model (searches symbols first, then by name)
  function findNodeByName(model: TreeModel, name: string): string | null {
    // Try symbols first
    if (model.symbols[name]) {
      return model.symbols[name]
    }
    // Try pathSymbols
    if (model.pathSymbols[name]) {
      return model.pathSymbols[name]
    }
    // Search all nodes by name
    for (const node of Object.values(model.nodes)) {
      if (node.name === name) {
        return node.id
      }
    }
    return null
  }

  // Check if a value already exists in an array node
  function valueExistsInArray(model: TreeModel, arrayNodeId: string, value: string): boolean {
    const node = model.nodes[arrayNodeId]
    if (!node || node.kind !== 'array') return false

    const normalizedValue = value.toLowerCase().trim()
    for (const childId of (node as ArrayNode).children) {
      const child = model.nodes[childId]
      if (child && child.kind === 'leaf') {
        const leafValue = String((child as LeafNode).value || '').toLowerCase().trim()
        if (leafValue === normalizedValue) {
          return true
        }
      }
    }
    return false
  }

  // Add a leaf value to an array node
  function addLeafToArray(model: TreeModel, arrayNodeId: string, value: string): void {
    const arrayNode = model.nodes[arrayNodeId] as ArrayNode
    if (!arrayNode || arrayNode.kind !== 'array') return

    const newLeaf: LeafNode = {
      id: uid(),
      name: String(arrayNode.children.length),
      kind: 'leaf',
      parentId: arrayNodeId,
      value: value
    }
    addChild(model, arrayNodeId, newLeaf)
  }

  // Get container children (arrays or objects) of an object node
  function getContainerChildren(model: TreeModel, nodeId: string): SubNodeOption[] {
    const node = model.nodes[nodeId]
    if (!node || node.kind !== 'object') return []

    const options: SubNodeOption[] = []
    const objNode = node as ObjectNode
    for (const childId of objNode.children) {
      const child = model.nodes[childId]
      if (child && (child.kind === 'array' || child.kind === 'object')) {
        options.push({
          id: childId,
          name: child.name,
          path: `${node.name}/${child.name}`
        })
      }
    }
    return options
  }

  // Find the target array node for adding (handles nested objects)
  function findTargetArrayNode(model: TreeModel, nodeId: string): string | null {
    const node = model.nodes[nodeId]
    if (!node) return null

    if (node.kind === 'array') {
      return nodeId
    }

    if (node.kind === 'object') {
      const objNode = node as ObjectNode
      for (const childId of objNode.children) {
        const child = model.nodes[childId]
        if (child && child.kind === 'array') {
          return childId
        }
      }
    }

    return null
  }

  async function addToYaml(field: keyof PromptAnalysis) {
    if (!analysis) return

    const value = analysis[field]
    if (!value || value === 'N/A' || value === 'Not specified') {
      onShowToast('No valid value to add.', 'info')
      return
    }

    const nodeNameConfig = FIELD_TO_YAML_NODE[field]
    const nodeNames = Array.isArray(nodeNameConfig) ? nodeNameConfig : [nodeNameConfig]
    const filename = wildcardsFile

    try {
      // Load current YAML
      const yamlText = await fetchWildcardsText(filename)
      const model = fromYAML(yamlText)

      // Collect all container children from all specified nodes
      const allContainerChildren: SubNodeOption[] = []

      for (const nodeName of nodeNames) {
        const nodeId = findNodeByName(model, nodeName)
        if (!nodeId) continue

        const node = model.nodes[nodeId]
        if (!node) continue

        // If it's an array and single node, add directly
        if (node.kind === 'array' && nodeNames.length === 1) {
          await addValueToArrayNode(model, nodeId, value, nodeName)
          return
        }

        // If it's an array and multiple nodes, add it as an option
        if (node.kind === 'array' && nodeNames.length > 1) {
          allContainerChildren.push({
            id: nodeId,
            name: nodeName,
            path: nodeName
          })
        }

        if (node.kind === 'object') {
          const containerChildren = getContainerChildren(model, nodeId)
          allContainerChildren.push(...containerChildren)
        }
      }


      // If we have multiple container children, show submenu
      if (allContainerChildren.length > 1) {
        pendingAdd = {
          field,
          value,
          nodeName: nodeNames.join(', '),
          model,
          options: allContainerChildren
        }
        return
      }

      // Single container child - add directly
      if (allContainerChildren.length === 1) {
        const option = allContainerChildren[0]
        const targetArrayId = findTargetArrayNode(model, option.id)
        if (targetArrayId) {
          await addValueToArrayNode(model, targetArrayId, value, option.path)
          return
        }
      }

      // No container children found - try to find or create in first node
      const firstNodeName = nodeNames[0]
      const firstNodeId = findNodeByName(model, firstNodeName)
      if (!firstNodeId) {
        onShowToast(`Node "${firstNodeName}" not found in wildcards.`, 'error')
        return
      }

      let targetArrayId = findTargetArrayNode(model, firstNodeId)
      if (!targetArrayId) {
        // Create a new array child called "other"
        const newArrayId = uid()
        const newArray: ArrayNode = {
          id: newArrayId,
          name: 'other',
          kind: 'array',
          parentId: firstNodeId,
          children: [],
          collapsed: false
        }
        addChild(model, firstNodeId, newArray)
        targetArrayId = newArrayId
      }

      await addValueToArrayNode(model, targetArrayId, value, firstNodeName)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add to YAML.'
      onShowToast(message, 'error')
    }
  }

  async function addValueToArrayNode(
    model: TreeModel,
    arrayNodeId: string,
    value: string,
    displayName: string
  ) {
    if (valueExistsInArray(model, arrayNodeId, value)) {
      onShowToast(`"${value}" already exists in ${displayName}.`, 'info')
      return
    }

    addLeafToArray(model, arrayNodeId, value)

    // Save updated YAML
    const newYamlText = toYAML(model)
    await saveWildcardsText(newYamlText, wildcardsFile)

    // Refresh the wildcards in the store
    await refreshWildcardsFromServer(wildcardsFile)

    onShowToast(`Added to ${displayName}.`, 'success')
  }

  async function handleSubNodeSelect(option: SubNodeOption) {
    if (!pendingAdd) return

    const { model, value } = pendingAdd

    try {
      // Find the target array within the selected sub-node
      let targetArrayId = findTargetArrayNode(model, option.id)

      if (!targetArrayId) {
        // If the selected node is an object without array children, create one
        const newArrayId = uid()
        const newArray: ArrayNode = {
          id: newArrayId,
          name: 'other',
          kind: 'array',
          parentId: option.id,
          children: [],
          collapsed: false
        }
        addChild(model, option.id, newArray)
        targetArrayId = newArrayId
      }

      await addValueToArrayNode(model, targetArrayId, value, option.path)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add to YAML.'
      onShowToast(message, 'error')
    } finally {
      pendingAdd = null
    }
  }

  function cancelSubNodeSelect() {
    pendingAdd = null
  }

  async function analyzePrompt() {
    const trimmed = inputPrompt.trim()
    if (!trimmed) return

    const trimmedKey = apiKey.trim()
    if (!trimmedKey) {
      onShowToast('Add your Gemini API key in Settings to enable analysis.', 'error')
      return
    }

    isLoading = true
    analysis = null

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_ID}:generateContent?key=${encodeURIComponent(trimmedKey)}`

      const body = {
        contents: [
          {
            parts: [
              {
                text: `Analyze the following image generation prompt and extract the visual elements.
Separate 'hairStyle' (length/texture) and 'hairColor'.
Separate physical 'pose' from 'expression'.
If an element is not mentioned, provide "N/A" or "Not specified".

Prompt: "${trimmed}"`
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: ANALYSIS_SCHEMA
        },
        systemInstruction: {
          parts: [
            {
              text: 'You are a professional prompt engineer. Deconstruct complex prompts into core visual components. Always split hair into separate style and color fields.'
            }
          ]
        }
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        throw new Error('Failed to parse Gemini response.')
      }

      const data = payload as Record<string, unknown>

      if (!response.ok) {
        const errorData = data?.error as Record<string, unknown> | undefined
        const message =
          errorData && typeof errorData.message === 'string'
            ? errorData.message
            : 'Gemini request failed.'
        throw new Error(message)
      }

      const candidates = Array.isArray(data?.candidates) ? data.candidates : []
      const firstCandidate = candidates.length > 0 ? (candidates[0] as Record<string, unknown>) : undefined
      const content = firstCandidate?.content as Record<string, unknown> | undefined
      const parts = Array.isArray(content?.parts) ? content.parts : []

      if (parts.length > 0) {
        const part = parts[0] as Record<string, unknown>
        const text = typeof part?.text === 'string' ? part.text.trim() : ''
        if (text) {
          analysis = JSON.parse(text) as PromptAnalysis
        }
      }

      if (!analysis) {
        throw new Error('Failed to get analysis from Gemini.')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analysis failed.'
      onShowToast(message, 'error')
    } finally {
      isLoading = false
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.isComposing) return
    if (isLoading) return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void analyzePrompt()
    }
  }

  function clearAnalysis() {
    analysis = null
    inputPrompt = ''
  }

  function isValidValue(value: string | undefined): boolean {
    if (!value) return false
    const lower = value.toLowerCase().trim()
    return lower !== 'n/a' && lower !== 'not specified' && lower !== ''
  }
</script>

<svelte:document onclick={cancelSubNodeSelect} />

<div class="flex h-full flex-col bg-white">
  <!-- Analysis result area -->
  <div class="flex-1 overflow-y-auto p-2">
    {#if analysis}
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
                      addToYaml(field)
                    }}
                    class="flex h-5 w-5 items-center justify-center rounded border border-gray-300 bg-white text-gray-500 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600"
                    title="Add to {Array.isArray(FIELD_TO_YAML_NODE[field]) ? FIELD_TO_YAML_NODE[field].join('/') : FIELD_TO_YAML_NODE[field]}"
                  >
                    <Plus size="14" />
                  </button>
                  {#if pendingAdd && pendingAdd.field === field}
                    <div
                      class="absolute right-0 top-full z-50 mt-1 max-h-48 min-w-32 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
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
    {:else if isLoading}
      <div class="flex h-full items-center justify-center text-gray-400">
        <p>Analyzing prompt...</p>
      </div>
    {:else}
      <div class="flex h-full items-center justify-center text-gray-400">
        <p>Enter a prompt to analyze...</p>
      </div>
    {/if}
  </div>

  <!-- Input area -->
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
          onclick={clearAnalysis}
          class="rounded-md border border-gray-300 bg-gray-100 px-4 py-1 text-sm font-medium text-gray-600 transition hover:bg-gray-200"
        >
          Clear
        </button>
        <button
          type="button"
          onclick={analyzePrompt}
          disabled={!inputPrompt.trim() || isLoading}
          class="rounded-md border border-gray-300 bg-gray-100 px-4 py-1 text-sm font-medium text-gray-600 transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>
    </div>
  </div>
</div>

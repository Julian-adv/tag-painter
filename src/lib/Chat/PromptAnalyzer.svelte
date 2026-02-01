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
  import { togglePinForLeaf } from '$lib/TreeEdit/operations'
  import { refreshWildcardsFromServer } from '$lib/stores/tagsStore'

  interface Props {
    apiKey: string
    openRouterApiKey: string
    ollamaBaseUrl: string
    ollamaModel: string
    apiProvider: 'gemini' | 'openrouter' | 'ollama'
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

  interface SlotMapping {
    slot: string
    original: string
  }

  interface PendingSlotAdd {
    mapping: SlotMapping
    model: TreeModel
    options: SubNodeOption[]
  }

  let { apiKey = '', openRouterApiKey = '', ollamaBaseUrl = 'http://localhost:11434', ollamaModel = 'llama3.2', apiProvider = 'gemini', wildcardsFile, onShowToast }: Props = $props()

  let inputPrompt = $state('')
  let isLoading = $state(false)
  let isGeneralizing = $state(false)
  let analysis: PromptAnalysis | null = $state(null)
  let generalizedPrompt: string | null = $state(null)
  let slotMappings: SlotMapping[] = $state([])
  let pendingAdd: PendingAdd | null = $state(null)
  let pendingSlotAdd: PendingSlotAdd | null = $state(null)

  const GEMINI_MODEL_ID = 'gemini-2.5-flash'
  const OPENROUTER_MODEL_ID = 'tngtech/deepseek-r1t2-chimera:free'

  const ANALYSIS_SCHEMA = {
    type: 'OBJECT',
    properties: {
      subject: {
        type: 'STRING',
        description: 'The main subject or character (e.g., 1girl, 2girls, 1boy, couple).'
      },
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
      hair: {
        type: 'STRING',
        description: 'Hair style (shape, length, texture) and color combined (e.g., long wavy blonde hair, short pink bob).'
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
      'subject',
      'pose',
      'expression',
      'composition',
      'background',
      'lighting',
      'hair',
      'eyes',
      'outfit',
      'legwear',
      'footwear',
      'accessories'
    ]
  }

  const FIELD_LABELS: Record<keyof PromptAnalysis, string> = {
    subject: 'Subject',
    pose: 'Pose',
    expression: 'Expression',
    composition: 'Composition',
    background: 'Background',
    lighting: 'Lighting',
    hair: 'Hair',
    eyes: 'Eyes',
    outfit: 'Outfit',
    legwear: 'Legwear',
    footwear: 'Footwear',
    accessories: 'Accessories'
  }

  // Mapping from analysis fields to YAML node names (can be single name or array of names)
  const FIELD_TO_YAML_NODE: Record<keyof PromptAnalysis, string | string[]> = {
    subject: 'subject',
    pose: ['pose', 'pose2', 'pose3', 'pose4', 'pose5'],
    expression: 'expression',
    composition: 'composition',
    background: 'background',
    lighting: 'lighting',
    hair: ['hair_style', 'hair_color', 'hair'],
    eyes: 'eyes',
    outfit: ['clothing_style_with_stockings', 'clothing_style_without_stockings', 'clothing'],
    legwear: 'leg_wear',
    footwear: 'shoes',
    accessories: 'accessories'
  }

  // Mapping from slot names to YAML node names
  const SLOT_TO_YAML_NODE: Record<string, string | string[]> = {
    __subject__: 'subject',
    __eyes__: 'eyes',
    __hair__: ['hair_style', 'hair_color', 'hair'],
    __clothing__: ['clothing_style_with_stockings', 'clothing_style_without_stockings', 'clothing'],
    __skin__: 'skin'
  }

  const FIELD_ORDER: (keyof PromptAnalysis)[] = [
    'subject',
    'pose',
    'expression',
    'composition',
    'background',
    'lighting',
    'hair',
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

  // Add a leaf value to an array node and pin it for next generation
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

    // Pin the newly added leaf so it will be selected in the next generation
    togglePinForLeaf(model, newLeaf.id)
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

  const ANALYSIS_PROMPT = `Analyze the following image generation prompt and extract the visual elements.
If the prompt is in Chinese, translate it to English first before extracting.
Separate physical 'pose' from 'expression'.
If an element is not mentioned, provide "N/A" or "Not specified".`

  const SYSTEM_PROMPT = 'You are a professional prompt engineer. Deconstruct complex prompts into core visual components.'

  const GENERALIZE_PROMPT = `Given an image generation prompt, replace specific descriptive elements with placeholder slots and report what was replaced.

Replace the following elements with their corresponding placeholders:
1. Eye descriptions (color, shape, gaze) → __eyes__
2. Hair descriptions (style, color, length, texture) → __hair__
3. Subject/person descriptions (age, gender, ethnicity, beauty descriptors) → __subject__
4. Clothing/outfit descriptions (all clothing items, accessories worn on body) → __clothing__
   Keep the word "wearing" before __clothing__ if present.
5. Skin descriptions (texture, tone, condition) → __skin__
   Example: "clear smooth skin" → "__skin__"

Important rules:
- Only replace elements that are clearly present in the prompt
- Keep all other descriptive elements (pose, background, lighting, composition, etc.) unchanged
- Maintain the original sentence structure and flow as much as possible
- If the prompt is in Chinese, first translate it to English, then apply the replacements

Prompt to generalize:`

  const GENERALIZE_SYSTEM_PROMPT = 'You are a prompt template generator. Your task is to replace specific visual elements with placeholder slots while preserving the overall structure of the prompt.'

  const GENERALIZE_SCHEMA = {
    type: 'OBJECT',
    properties: {
      prompt: {
        type: 'STRING',
        description: 'The generalized prompt with placeholders (__subject__, __eyes__, __hair__, __clothing__, __skin__) replacing the original descriptions.'
      },
      mappings: {
        type: 'ARRAY',
        description: 'List of replacements made. Only include slots that were actually used.',
        items: {
          type: 'OBJECT',
          properties: {
            slot: {
              type: 'STRING',
              description: 'The placeholder slot name (e.g., __subject__, __eyes__, __hair__, __clothing__, __skin__)'
            },
            original: {
              type: 'STRING',
              description: 'The original text that was replaced by this slot'
            }
          },
          required: ['slot', 'original']
        }
      }
    },
    required: ['prompt', 'mappings']
  }

  interface GeneralizeResult {
    prompt: string
    mappings: SlotMapping[]
  }

  async function analyzeWithGemini(prompt: string, key: string): Promise<PromptAnalysis> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_ID}:generateContent?key=${encodeURIComponent(key)}`

    const body = {
      contents: [
        {
          parts: [
            {
              text: `${ANALYSIS_PROMPT}

Prompt: "${prompt}"`
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: ANALYSIS_SCHEMA
      },
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }]
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
        return JSON.parse(text) as PromptAnalysis
      }
    }

    throw new Error('Failed to get analysis from Gemini.')
  }

  async function analyzeWithOpenRouter(prompt: string, key: string): Promise<PromptAnalysis> {
    const schemaFields = Object.entries(ANALYSIS_SCHEMA.properties)
      .map(([name, prop]) => `- ${name}: ${(prop as { description: string }).description}`)
      .join('\n')

    const systemPromptWithSchema = `${SYSTEM_PROMPT}

You must respond with a valid JSON object containing these fields:
${schemaFields}

Respond ONLY with the JSON object, no other text.`

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL_ID,
        messages: [
          { role: 'system', content: systemPromptWithSchema },
          { role: 'user', content: `${ANALYSIS_PROMPT}\n\nPrompt: "${prompt}"` }
        ],
        response_format: { type: 'json_object' }
      })
    })

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new Error('Failed to parse OpenRouter response.')
    }

    const data = payload as Record<string, unknown>

    if (!response.ok) {
      const errorData = data?.error as Record<string, unknown> | undefined
      const message =
        errorData && typeof errorData.message === 'string'
          ? errorData.message
          : 'OpenRouter request failed.'
      throw new Error(message)
    }

    const choices = Array.isArray(data?.choices) ? data.choices : []
    const firstChoice = choices.length > 0 ? (choices[0] as Record<string, unknown>) : undefined
    const message = firstChoice?.message as Record<string, unknown> | undefined
    const content = typeof message?.content === 'string' ? message.content.trim() : ''

    if (content) {
      return JSON.parse(content) as PromptAnalysis
    }

    throw new Error('Failed to get analysis from OpenRouter.')
  }

  async function analyzeWithOllama(prompt: string, baseUrl: string, model: string): Promise<PromptAnalysis> {
    const schemaFields = Object.entries(ANALYSIS_SCHEMA.properties)
      .map(([name, prop]) => `- ${name}: ${(prop as { description: string }).description}`)
      .join('\n')

    const systemPromptWithSchema = `${SYSTEM_PROMPT}

You must respond with a valid JSON object containing these fields:
${schemaFields}

Respond ONLY with the JSON object, no other text.`

    const endpoint = `${baseUrl.replace(/\/$/, '')}/api/chat`

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPromptWithSchema },
          { role: 'user', content: `${ANALYSIS_PROMPT}\n\nPrompt: "${prompt}"` }
        ],
        format: 'json',
        stream: false
      })
    })

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new Error('Failed to parse Ollama response.')
    }

    const data = payload as Record<string, unknown>

    if (!response.ok) {
      const errorMsg = typeof data?.error === 'string' ? data.error : 'Ollama request failed.'
      throw new Error(errorMsg)
    }

    const message = data?.message as Record<string, unknown> | undefined
    const content = typeof message?.content === 'string' ? message.content.trim() : ''

    if (content) {
      return JSON.parse(content) as PromptAnalysis
    }

    throw new Error('Failed to get analysis from Ollama.')
  }

  async function analyzePrompt() {
    const trimmed = inputPrompt.trim()
    if (!trimmed) return

    // Ollama doesn't require an API key
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

  async function generalizeWithGemini(prompt: string, key: string): Promise<GeneralizeResult> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_ID}:generateContent?key=${encodeURIComponent(key)}`

    const body = {
      contents: [
        {
          parts: [
            {
              text: `${GENERALIZE_PROMPT}

"${prompt}"`
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: GENERALIZE_SCHEMA
      },
      systemInstruction: {
        parts: [{ text: GENERALIZE_SYSTEM_PROMPT }]
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
        return JSON.parse(text) as GeneralizeResult
      }
    }

    throw new Error('Failed to get generalized prompt from Gemini.')
  }

  const GENERALIZE_JSON_INSTRUCTION = `
Respond with a JSON object containing:
- "prompt": The generalized prompt with placeholders
- "mappings": Array of {"slot": "__xxx__", "original": "replaced text"} for each replacement made

Example response:
{"prompt": "A photo of __subject__ with __hair__ and __skin__", "mappings": [{"slot": "__subject__", "original": "a young woman"}, {"slot": "__hair__", "original": "long black hair"}, {"slot": "__skin__", "original": "clear smooth skin"}]}`

  async function generalizeWithOpenRouter(prompt: string, key: string): Promise<GeneralizeResult> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL_ID,
        messages: [
          { role: 'system', content: GENERALIZE_SYSTEM_PROMPT + GENERALIZE_JSON_INSTRUCTION },
          { role: 'user', content: `${GENERALIZE_PROMPT}\n\n"${prompt}"` }
        ],
        response_format: { type: 'json_object' }
      })
    })

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new Error('Failed to parse OpenRouter response.')
    }

    const data = payload as Record<string, unknown>

    if (!response.ok) {
      const errorData = data?.error as Record<string, unknown> | undefined
      const message =
        errorData && typeof errorData.message === 'string'
          ? errorData.message
          : 'OpenRouter request failed.'
      throw new Error(message)
    }

    const choices = Array.isArray(data?.choices) ? data.choices : []
    const firstChoice = choices.length > 0 ? (choices[0] as Record<string, unknown>) : undefined
    const message = firstChoice?.message as Record<string, unknown> | undefined
    const content = typeof message?.content === 'string' ? message.content.trim() : ''

    if (content) {
      return JSON.parse(content) as GeneralizeResult
    }

    throw new Error('Failed to get generalized prompt from OpenRouter.')
  }

  async function generalizeWithOllama(prompt: string, baseUrl: string, model: string): Promise<GeneralizeResult> {
    const endpoint = `${baseUrl.replace(/\/$/, '')}/api/chat`

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: GENERALIZE_SYSTEM_PROMPT + GENERALIZE_JSON_INSTRUCTION },
          { role: 'user', content: `${GENERALIZE_PROMPT}\n\n"${prompt}"` }
        ],
        format: 'json',
        stream: false
      })
    })

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new Error('Failed to parse Ollama response.')
    }

    const data = payload as Record<string, unknown>

    if (!response.ok) {
      const errorMsg = typeof data?.error === 'string' ? data.error : 'Ollama request failed.'
      throw new Error(errorMsg)
    }

    const message = data?.message as Record<string, unknown> | undefined
    const content = typeof message?.content === 'string' ? message.content.trim() : ''

    if (content) {
      return JSON.parse(content) as GeneralizeResult
    }

    throw new Error('Failed to get generalized prompt from Ollama.')
  }

  async function generalizePrompt() {
    const trimmed = inputPrompt.trim()
    if (!trimmed) return

    // Ollama doesn't require an API key
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
      let result: GeneralizeResult
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
    generalizedPrompt = null
    slotMappings = []
    inputPrompt = ''
  }

  function isValidValue(value: string | undefined): boolean {
    if (!value) return false
    const lower = value.toLowerCase().trim()
    return lower !== 'n/a' && lower !== 'not specified' && lower !== ''
  }

  function getSlotNodeName(slot: string): string {
    const node = SLOT_TO_YAML_NODE[slot]
    if (!node) return slot
    return Array.isArray(node) ? node.join('/') : node
  }

  async function addGeneralizedToYaml() {
    if (!generalizedPrompt) return

    const filename = wildcardsFile

    try {
      const yamlText = await fetchWildcardsText(filename)
      const model = fromYAML(yamlText)

      // Find the "all" node
      const allNodeId = findNodeByName(model, 'all')
      if (!allNodeId) {
        onShowToast('Node "all" not found in wildcards.', 'error')
        return
      }

      const allNode = model.nodes[allNodeId]
      if (!allNode) {
        onShowToast('Node "all" not found in wildcards.', 'error')
        return
      }

      if (allNode.kind !== 'array') {
        onShowToast('"all" node must be an array.', 'error')
        return
      }

      const targetArrayId = allNodeId

      // Check if value already exists
      if (valueExistsInArray(model, targetArrayId, generalizedPrompt)) {
        onShowToast('This prompt already exists in "all".', 'info')
        return
      }

      // Add the generalized prompt
      addLeafToArray(model, targetArrayId, generalizedPrompt)

      // Save updated YAML
      const newYamlText = toYAML(model)
      await saveWildcardsText(newYamlText, filename)

      // Refresh the wildcards in the store
      await refreshWildcardsFromServer(filename)

      onShowToast('Added to "all" node.', 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add to YAML.'
      onShowToast(message, 'error')
    }
  }

  async function addSlotMappingToYaml(mapping: SlotMapping) {
    const nodeNameConfig = SLOT_TO_YAML_NODE[mapping.slot]
    if (!nodeNameConfig) {
      onShowToast(`No YAML node configured for ${mapping.slot}.`, 'error')
      return
    }

    const nodeNames = Array.isArray(nodeNameConfig) ? nodeNameConfig : [nodeNameConfig]
    const filename = wildcardsFile

    try {
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
          await addValueToArrayNode(model, nodeId, mapping.original, nodeName)
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
        pendingSlotAdd = {
          mapping,
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
          await addValueToArrayNode(model, targetArrayId, mapping.original, option.path)
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

      await addValueToArrayNode(model, targetArrayId, mapping.original, firstNodeName)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add to YAML.'
      onShowToast(message, 'error')
    }
  }

  async function handleSlotSubNodeSelect(option: SubNodeOption) {
    if (!pendingSlotAdd) return

    const { model, mapping } = pendingSlotAdd

    try {
      let targetArrayId = findTargetArrayNode(model, option.id)

      if (!targetArrayId) {
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

      await addValueToArrayNode(model, targetArrayId, mapping.original, option.path)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add to YAML.'
      onShowToast(message, 'error')
    } finally {
      pendingSlotAdd = null
    }
  }

  function cancelSlotSubNodeSelect() {
    pendingSlotAdd = null
  }
</script>

<svelte:document onclick={() => { cancelSubNodeSelect(); cancelSlotSubNodeSelect(); }} />

<div class="flex h-full flex-col bg-white">
  <!-- Analysis result area -->
  <div class="flex-1 overflow-y-auto p-2">
    {#if generalizedPrompt}
      <div class="flex flex-col gap-2">
        <div class="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-xs font-semibold text-blue-600">Generalized Prompt</span>
            <button
              type="button"
              onclick={addGeneralizedToYaml}
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
                  <span class="shrink-0 rounded bg-purple-100 px-1.5 py-0.5 font-mono text-xs text-purple-700">{mapping.slot}</span>
                  <span class="text-gray-400">←</span>
                  <span class="flex-1 text-gray-700">{mapping.original}</span>
                  {#if SLOT_TO_YAML_NODE[mapping.slot]}
                    <div class="relative shrink-0">
                      <button
                        type="button"
                        onclick={(e) => {
                          e.stopPropagation()
                          addSlotMappingToYaml(mapping)
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
    {:else if analysis}
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
          disabled={!inputPrompt.trim() || isLoading || isGeneralizing}
          class="rounded-md border border-gray-300 bg-gray-100 px-4 py-1 text-sm font-medium text-gray-600 transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? 'Analyzing...' : 'Analyze'}
        </button>
        <button
          type="button"
          onclick={generalizePrompt}
          disabled={!inputPrompt.trim() || isLoading || isGeneralizing}
          class="rounded-md border border-gray-300 bg-gray-100 px-4 py-1 text-sm font-medium text-gray-600 transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGeneralizing ? 'Generalizing...' : 'Generalize'}
        </button>
      </div>
    </div>
  </div>
</div>

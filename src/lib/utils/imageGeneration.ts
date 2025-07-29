// Image generation utility functions
//
// This module orchestrates the complete image generation workflow with ComfyUI

import { saveImage } from './fileIO'
import { connectWebSocket, type WebSocketCallbacks } from './comfyui'
import { defaultWorkflowPrompt, FINAL_SAVE_NODE_ID, generateLoraChain } from './workflow'
import { processPrompts } from './promptProcessing'
import { getEffectiveCategoryValueFromResolved } from '../stores/promptsStore'
import type { PromptsData, Settings, ProgressData, OptionItem, PromptCategory, ComfyUIWorkflow } from '$lib/types'

export interface GenerationOptions {
  promptsData: PromptsData
  settings: Settings
  resolvedRandomValues: Record<string, OptionItem>
  selectedLoras: string[]
  onLoadingChange: (loading: boolean) => void
  onProgressUpdate: (progress: ProgressData) => void
  onImageReceived: (imageBlob: Blob, filePath: string) => void
  onError: (error: string) => void
  onCategoriesDisabled?: (excludedCategories: PromptCategory[]) => void
}

export async function generateImage(options: GenerationOptions): Promise<void> {
  const {
    promptsData,
    settings,
    resolvedRandomValues,
    selectedLoras,
    onLoadingChange,
    onProgressUpdate,
    onImageReceived,
    onError,
    onCategoriesDisabled
  } = options

  // Clone the default workflow
  const workflow = JSON.parse(JSON.stringify(defaultWorkflowPrompt))

  try {
    // Separate negative category from positive categories
    const negativeCategory = promptsData.categories.find((cat) => cat.id === 'negative')
    const positiveCategories = promptsData.categories.filter((cat) => cat.id !== 'negative')

    // Process prompts through multiple passes
    const { promptValue, excludedCategories, faceDetailerWildcard } = processPrompts(
      positiveCategories,
      resolvedRandomValues
    )

    // Notify about excluded categories for UI feedback
    if (excludedCategories.length > 0 && onCategoriesDisabled) {
      onCategoriesDisabled(excludedCategories)
    }

    // Set face detailer wildcard
    workflow['56'].inputs.wildcard = faceDetailerWildcard
    console.log(`face detailer wildcard: ${faceDetailerWildcard}`)

    // Build the negative prompt
    const negativePrompt = negativeCategory
      ? getEffectiveCategoryValueFromResolved(negativeCategory, resolvedRandomValues)
      : ''

    if (!promptValue.trim()) {
      onError('Prompt is empty')
      return
    }

    onLoadingChange(true)
    onProgressUpdate({ value: 0, max: 100, currentNode: '' })

    // Generate unique client ID
    const clientId = crypto.randomUUID()

    // Split promptValue by [SEP] for regional prompting
    const promptParts = promptValue
      .split('[SEP]')
      .map((part) => part.trim())
      .filter(Boolean)

    // Assign prompts to different nodes based on number of parts
    if (promptParts.length === 1) {
      // Single prompt mode: disable regional separation
      workflow['12'].inputs.text = promptParts[0] // Overall base prompt
      workflow['13'].inputs.text = '' // Left side prompt (empty)
      workflow['51'].inputs.text = '' // Right side prompt (empty)
      // Connect both masks to the empty mask to not apply prompt
      workflow['10'].inputs.mask_1 = ['2', 0]
      workflow['10'].inputs.mask_2 = ['2', 0]
    } else if (promptParts.length === 2) {
      // Two prompt mode: left region and base
      workflow['12'].inputs.text = promptParts[0] // Overall base prompt
      workflow['13'].inputs.text = promptParts[1] // Left side prompt
      workflow['51'].inputs.text = '' // Right side prompt (empty)
      // mask_1 uses base mask(whole), mask_2 uses empty mask
      workflow['10'].inputs.mask_1 = ['3', 0]
      workflow['10'].inputs.mask_2 = ['2', 0]
    } else {
      // Three+ prompt mode: use full regional separation
      workflow['12'].inputs.text = promptParts[0] // Overall base prompt
      workflow['13'].inputs.text = promptParts[1] // Left side prompt
      workflow['51'].inputs.text = promptParts[2] || '' // Right side prompt
      // Use left and inverted masks for regional prompting
      workflow['10'].inputs.mask_1 = ['87', 0]
      workflow['10'].inputs.mask_2 = ['88', 0]
    }

    // Set negative prompt
    workflow['18'].inputs.text = negativePrompt

    // Get mask image path from server-side API
    const maskResponse = await fetch('/api/mask-path')
    const { maskImagePath } = await maskResponse.json()
    workflow['86'].inputs.image = maskImagePath

    // Configure LoRA chain
    generateLoraChain(selectedLoras, workflow, promptsData.loraWeight)

    // Configure workflow based on settings
    configureWorkflow(workflow, promptsData, settings)

    // Apply random seeds
    applySeedsToWorkflow(workflow)

    // Add SaveImageWebsocket node for output
    addSaveImageWebsocketNode(workflow, promptsData)

    // Submit to ComfyUI
    await submitToComfyUI(workflow, clientId, promptsData, settings, resolvedRandomValues, {
      onLoadingChange,
      onProgressUpdate,
      onImageReceived,
      onError
    })
  } catch (error) {
    console.error('Failed to generate image:', error)
    onError(error instanceof Error ? error.message : 'Failed to generate image')
    onLoadingChange(false)
  }
}

function configureWorkflow(
  workflow: ComfyUIWorkflow,
  promptsData: PromptsData,
  settings: Settings
) {
  // Set checkpoint
  if (promptsData.selectedCheckpoint) {
    workflow['11'].inputs.ckpt_name = promptsData.selectedCheckpoint
  }

  // Apply settings values to workflow
  workflow['45'].inputs.steps = settings.steps
  workflow['14'].inputs.cfg = settings.cfgScale
  workflow['15'].inputs.sampler_name = settings.sampler
  workflow['16'].inputs.width = settings.imageWidth
  workflow['16'].inputs.height = settings.imageHeight

  // Configure optional features
  if (promptsData.useUpscale) {
    // Enable upscale nodes if they exist
    if (workflow['64']) {
      // Upscale is handled by ImageUpscaleWithModel node
    }
  }

  if (promptsData.useFaceDetailer) {
    // Face detailer nodes are already in the workflow (56, 69)
    // They are enabled by default in this workflow
  }
}

function applySeedsToWorkflow(workflow: ComfyUIWorkflow) {
  // Apply random seed to relevant nodes
  const seed = Math.floor(Math.random() * 10000000000000000)

  // Set seed for SamplerCustom node
  workflow['14'].inputs.noise_seed = seed

  // Set seed for BasicScheduler
  if (workflow['45']) {
    // BasicScheduler doesn't have a seed input, it's controlled by SamplerCustom
  }

  // Set seed for FaceDetailer nodes
  if (workflow['56']) {
    workflow['56'].inputs.seed = seed + 1
  }

  if (workflow['69']) {
    workflow['69'].inputs.seed = seed + 2
  }
}

function addSaveImageWebsocketNode(workflow: ComfyUIWorkflow, promptsData: PromptsData) {
  // Determine which node to use as image source based on upscale and face detailer settings
  let imageSourceNodeId: string

  if (promptsData.useUpscale) {
    if (promptsData.useFaceDetailer) {
      // Upscale=true, FaceDetailer=true
      imageSourceNodeId = '69' // Output of second FaceDetailer after upscale
    } else {
      // Upscale=true, FaceDetailer=false
      imageSourceNodeId = '64' // Output of ImageUpscaleWithModel
    }
  } else {
    // Upscale=false
    if (promptsData.useFaceDetailer) {
      // Upscale=false, FaceDetailer=true
      imageSourceNodeId = '56' // Output of first FaceDetailer
    } else {
      // Upscale=false, FaceDetailer=false
      imageSourceNodeId = '19' // Output of VAE Decode
    }
  }

  // Add the single, dynamically configured SaveImageWebsocket node
  workflow[FINAL_SAVE_NODE_ID] = {
    inputs: { images: [imageSourceNodeId, 0] }, // Assuming output index 0
    class_type: 'SaveImageWebsocket',
    _meta: { title: 'Final Save Image Websocket' }
  }
}

async function submitToComfyUI(
  workflow: ComfyUIWorkflow,
  clientId: string,
  promptsData: PromptsData,
  settings: Settings,
  resolvedRandomValues: Record<string, OptionItem>,
  callbacks: {
    onLoadingChange: (loading: boolean) => void
    onProgressUpdate: (progress: ProgressData) => void
    onImageReceived: (imageBlob: Blob, filePath: string) => void
    onError: (error: string) => void
  }
) {
  const payload = {
    prompt: workflow,
    client_id: clientId
  }

  // Submit prompt to ComfyUI
  const response = await fetch('http://127.0.0.1:8188/prompt', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('ComfyUI API Error:', response.status, errorText)
    throw new Error(`HTTP error! status: ${response.status}, response: ${errorText}`)
  }

  const result = await response.json()

  // Connect to WebSocket for real-time updates
  const wsCallbacks: WebSocketCallbacks = {
    onLoadingChange: callbacks.onLoadingChange,
    onProgressUpdate: callbacks.onProgressUpdate,
    onImageReceived: async (imageBlob: Blob) => {
      const filePath = await saveImage(
        imageBlob,
        promptsData,
        settings.outputDirectory,
        workflow,
        resolvedRandomValues
      )
      if (filePath) {
        callbacks.onImageReceived(imageBlob, filePath)
      } else {
        // If saving returns null, use fallback path
        const fallbackPath = `unsaved_${Date.now()}.png`
        callbacks.onImageReceived(imageBlob, fallbackPath)
      }
    },
    onError: callbacks.onError
  }

  await connectWebSocket(result.prompt_id, clientId, FINAL_SAVE_NODE_ID, workflow, wsCallbacks)
}

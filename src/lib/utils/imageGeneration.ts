// Image generation utility functions
//
// This module orchestrates the complete image generation workflow with ComfyUI

import { saveImage } from './fileIO'
import { connectWebSocket, type WebSocketCallbacks } from './comfyui'
import { defaultWorkflowPrompt, FINAL_SAVE_NODE_ID, generateLoraChain } from './workflow'
import type { PromptsData, Settings, ProgressData, OptionItem, ComfyUIWorkflow } from '$lib/types'

export interface GenerationOptions {
  promptsData: PromptsData
  settings: Settings
  resolvedRandomValues: Record<string, OptionItem>
  selectedLoras: string[]
  onLoadingChange: (loading: boolean) => void
  onProgressUpdate: (progress: ProgressData) => void
  onImageReceived: (imageBlob: Blob, filePath: string) => void
  onError: (error: string) => void
}

// Expand custom tags to their constituent tags
function expandCustomTags(tags: string[], customTags: Record<string, string[]>): string[] {
  const expandedTags: string[] = []

  for (const tag of tags) {
    if (tag in customTags) {
      // This is a custom tag, expand it to its constituent tags
      expandedTags.push(...customTags[tag])
    } else {
      // This is a regular tag, keep as is
      expandedTags.push(tag)
    }
  }

  return expandedTags
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
    onError
  } = options

  // Clone the default workflow
  const workflow = JSON.parse(JSON.stringify(defaultWorkflowPrompt))

  try {
    // Set face detailer wildcard to empty since categories are no longer used
    workflow['56'].inputs.wildcard = ''

    onLoadingChange(true)
    onProgressUpdate({ value: 0, max: 100, currentNode: '' })

    // Generate unique client ID
    const clientId = crypto.randomUUID()

    // Expand custom tags and create prompt parts
    const expandedAllTags = expandCustomTags(promptsData.tags.all, promptsData.customTags)
    const expandedZone1Tags = expandCustomTags(promptsData.tags.zone1, promptsData.customTags)
    const expandedZone2Tags = expandCustomTags(promptsData.tags.zone2, promptsData.customTags)
    const expandedNegativeTags = expandCustomTags(promptsData.tags.negative, promptsData.customTags)

    const allTagsText = expandedAllTags.join(', ')
    const zone1TagsText = expandedZone1Tags.join(', ')
    const zone2TagsText = expandedZone2Tags.join(', ')
    const negativeTagsText = expandedNegativeTags.join(', ')

    const promptParts = [allTagsText, zone1TagsText, zone2TagsText]

    // Assign prompts to different nodes based on number of parts
    if (promptParts.length === 1) {
      // Single prompt mode: disable regional separation
      workflow['12'].inputs.text = promptParts[0] // All tags
      workflow['13'].inputs.text = promptParts[1] // Zone1 tags
      workflow['51'].inputs.text = promptParts[2] // Zone2 tags
      // Connect both masks to the empty mask to not apply prompt
      workflow['10'].inputs.mask_1 = ['2', 0]
      workflow['10'].inputs.mask_2 = ['2', 0]
    } else if (promptParts.length === 2) {
      // Two prompt mode: left region and base
      workflow['12'].inputs.text = promptParts[0] // All tags
      workflow['13'].inputs.text = promptParts[1] // Zone1 tags
      workflow['51'].inputs.text = promptParts[2] // Zone2 tags
      // mask_1 uses base mask(whole), mask_2 uses empty mask
      workflow['10'].inputs.mask_1 = ['3', 0]
      workflow['10'].inputs.mask_2 = ['2', 0]
    } else {
      // Three+ prompt mode: use full regional separation
      workflow['12'].inputs.text = promptParts[0] // All tags
      workflow['13'].inputs.text = promptParts[1] // Zone1 tags
      workflow['51'].inputs.text = promptParts[2] // Zone2 tags
      // Use left and inverted masks for regional prompting
      workflow['10'].inputs.mask_1 = ['87', 0]
      workflow['10'].inputs.mask_2 = ['88', 0]
    }

    // Set negative prompt from negative tags
    workflow['18'].inputs.text = negativeTagsText

    // Get mask image path from server-side API with selected composition
    const maskResponse = await fetch(
      `/api/mask-path?composition=${encodeURIComponent(promptsData.selectedComposition)}`
    )
    if (!maskResponse.ok) {
      throw new Error(`Failed to get mask path: ${maskResponse.statusText}`)
    }
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

// Image generation utility functions
//
// This module orchestrates the complete image generation workflow with ComfyUI

import { saveImage } from './fileIO'
import { connectWebSocket, type WebSocketCallbacks } from './comfyui'
import {
  defaultWorkflowPrompt,
  inpaintingWorkflowPrompt,
  FINAL_SAVE_NODE_ID,
  generateLoraChain
} from './workflow'
import {
  expandCustomTags,
  detectCompositionFromTags,
  cleanDirectivesFromTags
} from './tagExpansion'
import { getWildcardModel } from '../stores/tagsStore'
import { updateComposition } from '../stores/promptsStore'
import type { PromptsData, Settings, ProgressData, ComfyUIWorkflow, ModelSettings } from '$lib/types'

export interface GenerationOptions {
  promptsData: PromptsData
  settings: Settings
  seed: number | null
  maskFilePath: string | null
  currentImagePath: string | null
  isInpainting: boolean
  inpaintDenoiseStrength?: number
  previousRandomTagResolutions?: {
    all: Record<string, string>
    zone1: Record<string, string>
    zone2: Record<string, string>
    negative: Record<string, string>
    inpainting: Record<string, string>
  }
  onLoadingChange: (loading: boolean) => void
  onProgressUpdate: (progress: ProgressData) => void
  onImageReceived: (imageBlob: Blob, filePath: string) => void
  onError: (error: string) => void
}

export async function generateImage(options: GenerationOptions): Promise<{
  seed: number
  randomTagResolutions: {
    all: Record<string, string>
    zone1: Record<string, string>
    zone2: Record<string, string>
    negative: Record<string, string>
    inpainting: Record<string, string>
  }
}> {
  const {
    promptsData,
    settings,
    seed,
    maskFilePath,
    currentImagePath,
    isInpainting,
    inpaintDenoiseStrength,
    previousRandomTagResolutions,
    onLoadingChange,
    onProgressUpdate,
    onImageReceived,
    onError
  } = options

  // Clone the appropriate workflow
  const workflow = JSON.parse(
    JSON.stringify(isInpainting ? inpaintingWorkflowPrompt : defaultWorkflowPrompt)
  )

  // Auto-select composition based on expanded All tags

  try {
    onLoadingChange(true)
    onProgressUpdate({ value: 0, max: 100, currentNode: '' })

    // Generate unique client ID
    const clientId = crypto.randomUUID()

    // Expand custom tags and create prompt parts, using previous resolutions if regenerating
    const previousAll = previousRandomTagResolutions?.all || {}
    const model = getWildcardModel()
    const allResult = expandCustomTags(promptsData.tags.all, model, new Set(), {}, previousAll)

    // Check for composition detection
    const detectedComposition = detectCompositionFromTags(allResult.expandedTags)
    if (detectedComposition) {
      console.log(`Auto-selecting composition: ${detectedComposition}`)
      updateComposition(detectedComposition)
      // Update promptsData with the new composition for this generation
      promptsData.selectedComposition = detectedComposition
    }

    const previousZone1 = previousRandomTagResolutions?.zone1 || {}
    const zone1Result = expandCustomTags(
      promptsData.tags.zone1,
      model,
      new Set(),
      { ...allResult.randomTagResolutions },
      previousZone1
    )

    const previousZone2 = previousRandomTagResolutions?.zone2 || {}
    const zone2Result = expandCustomTags(
      promptsData.tags.zone2,
      model,
      new Set(),
      { ...allResult.randomTagResolutions, ...zone1Result.randomTagResolutions },
      previousZone2
    )

    const previousNegative = previousRandomTagResolutions?.negative || {}
    const negativeResult = expandCustomTags(
      promptsData.tags.negative,
      model,
      new Set(),
      {
        ...allResult.randomTagResolutions,
        ...zone1Result.randomTagResolutions,
        ...zone2Result.randomTagResolutions
      },
      previousNegative
    )

    const previousInpainting = previousRandomTagResolutions?.inpainting || {}
    const inpaintingResult = expandCustomTags(
      promptsData.tags.inpainting,
      model,
      new Set(),
      {
        ...allResult.randomTagResolutions,
        ...zone1Result.randomTagResolutions,
        ...zone2Result.randomTagResolutions,
        ...negativeResult.randomTagResolutions
      },
      previousInpainting
    )

    // Organize random tag resolutions by zone
    const allRandomResolutions = {
      all: allResult.randomTagResolutions,
      zone1: zone1Result.randomTagResolutions,
      zone2: zone2Result.randomTagResolutions,
      negative: negativeResult.randomTagResolutions,
      inpainting: inpaintingResult.randomTagResolutions
    }

    // Clean directives before sending to ComfyUI
    let allTagsText = cleanDirectivesFromTags(allResult.expandedTags.join(', '))
    const zone1TagsText = cleanDirectivesFromTags(zone1Result.expandedTags.join(', '))
    let zone2TagsText = cleanDirectivesFromTags(zone2Result.expandedTags.join(', '))
    let negativeTagsText = cleanDirectivesFromTags(negativeResult.expandedTags.join(', '))
    const inpaintingTagsText = cleanDirectivesFromTags(inpaintingResult.expandedTags.join(', '))

    // Apply per-model quality/negative prefixes
    const effectiveModel = getEffectiveModelSettings(settings, promptsData.selectedCheckpoint)
    const qualityPrefix = effectiveModel ? effectiveModel.qualityPrefix : ''
    const negativePrefix = effectiveModel ? effectiveModel.negativePrefix : ''
    if (qualityPrefix && qualityPrefix.trim().length > 0) {
      allTagsText = [qualityPrefix.trim(), allTagsText].filter((p) => p && p.length > 0).join(', ')
    }
    if (negativePrefix && negativePrefix.trim().length > 0) {
      negativeTagsText = [negativePrefix.trim(), negativeTagsText]
        .filter((p) => p && p.length > 0)
        .join(', ')
    }

    if (isInpainting) {
      // Configure inpainting workflow
      workflow['12'].inputs.text = inpaintingTagsText // Inpainting prompt
      workflow['18'].inputs.text = negativeTagsText // Negative prompt

      // Set the current image as input
      if (currentImagePath) {
        workflow['89'].inputs.image = currentImagePath
        console.log('Using image path:', currentImagePath)
      }

      // Set the mask image (already has full path)
      if (maskFilePath) {
        workflow['90'].inputs.image = maskFilePath
        console.log('Using mask path:', maskFilePath)
      }
    } else {
      // Configure regular workflow
      // If composition is 'all', ignore zone2 so it doesn't affect generation
      const isAll = promptsData.selectedComposition === 'all'
      if (isAll) {
        zone2TagsText = ''
      }
      // Set face detailer wildcard with appropriate prompts
      const combinedZonePrompt = isAll
        ? zone1TagsText
        : zone1TagsText && zone2TagsText
          ? `[ASC] ${zone1TagsText} [SEP] ${zone2TagsText}`
          : zone1TagsText || zone2TagsText
      workflow['56'].inputs.wildcard = combinedZonePrompt

      // Assign prompts to different nodes
      workflow['12'].inputs.text = allTagsText // All tags
      workflow['13'].inputs.text = zone1TagsText // Zone1 tags
      workflow['51'].inputs.text = zone2TagsText // Zone2 tags

      // Set mask configuration for regional separation
      workflow['10'].inputs.mask_1 = ['87', 0] // Left mask
      workflow['10'].inputs.mask_2 = ['88', 0] // Inverted mask

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
    }

    // Configure LoRA chain with per-model overrides
    const effectiveLoras = getEffectiveLoras(settings, promptsData.selectedCheckpoint, promptsData.selectedLoras)
    generateLoraChain(effectiveLoras, workflow)

    // Configure workflow based on settings merged with per-model overrides
    const appliedSettings = applyPerModelOverrides(settings, promptsData.selectedCheckpoint)
    configureWorkflow(workflow, promptsData, appliedSettings, isInpainting, inpaintDenoiseStrength)

    // If a custom VAE is selected, inject VAELoader and rewire all VAE inputs
    if (appliedSettings.selectedVae && appliedSettings.selectedVae !== '__embedded__') {
      applyCustomVae(workflow, appliedSettings.selectedVae)
    }

    // Apply seeds (either use provided seed or generate new one)
    const appliedSeed = applySeedsToWorkflow(workflow, seed, isInpainting)

    // Add SaveImageWebsocket node for output
    addSaveImageWebsocketNode(workflow, promptsData, isInpainting)

    // Update mask file in workflow if provided
    if (maskFilePath) {
      console.log('Using mask file:', maskFilePath)
      // Update node 86 to use the generated mask
      if (workflow['86']) {
        workflow['86'].inputs.image = maskFilePath
      }
    }

    console.log('workflow', workflow)
    // Submit to ComfyUI
    await submitToComfyUI(
      workflow,
      clientId,
      {
        all: allTagsText,
        zone1: zone1TagsText,
        zone2: zone2TagsText,
        negative: negativeTagsText,
        inpainting: inpaintingTagsText
      },
      appliedSettings,
      appliedSeed,
      {
        onLoadingChange,
        onProgressUpdate,
        onImageReceived,
        onError
      }
    )

    return { seed: appliedSeed, randomTagResolutions: allRandomResolutions }
  } catch (error) {
    console.error('Failed to generate image:', error)

    onError(error instanceof Error ? error.message : 'Failed to generate image')
    onLoadingChange(false)
    throw error
  }
}

function configureWorkflow(
  workflow: ComfyUIWorkflow,
  promptsData: PromptsData,
  settings: Settings,
  isInpainting: boolean = false,
  inpaintDenoiseStrength?: number
) {
  // Set checkpoint
  if (promptsData.selectedCheckpoint) {
    workflow['11'].inputs.ckpt_name = promptsData.selectedCheckpoint
  }

  if (isInpainting) {
    // Inpainting workflow configuration
    workflow['10'].inputs.steps = settings.steps
    workflow['10'].inputs.cfg = settings.cfgScale
    workflow['10'].inputs.sampler_name = settings.sampler

    // Apply custom denoise strength if provided, otherwise use default
    if (inpaintDenoiseStrength !== undefined) {
      workflow['10'].inputs.denoise = inpaintDenoiseStrength
    }

    // For inpainting, image size is determined by input image, not by EmptyLatentImage
  } else {
    // Regular workflow configuration
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
}

function applyCustomVae(workflow: ComfyUIWorkflow, vaeName: string) {
  const vaeNodeId = '901'
  // Add VAELoader node
  workflow[vaeNodeId] = {
    inputs: {
      vae_name: vaeName
    },
    class_type: 'VAELoader',
    _meta: {
      title: 'Load VAE'
    }
  }

  // Rewire all inputs that reference a VAE to use the VAELoader output
  for (const node of Object.values(workflow)) {
    if (!node || !node.inputs) continue
    if (Object.prototype.hasOwnProperty.call(node.inputs, 'vae')) {
      node.inputs.vae = [vaeNodeId, 0]
    }
  }
}

function applySeedsToWorkflow(
  workflow: ComfyUIWorkflow,
  providedSeed?: number | null,
  isInpainting: boolean = false
): number {
  // Use provided seed or generate a new random seed
  const seed = providedSeed ?? Math.floor(Math.random() * 10000000000000000)

  if (isInpainting) {
    // Inpainting workflow - set seed for KSampler node
    workflow['10'].inputs.seed = seed

    // Set seed for FaceDetailer if it exists
    if (workflow['56']) {
      workflow['56'].inputs.seed = seed + 1
    }
  } else {
    // Regular workflow - set seed for SamplerCustom node
    if (workflow['14']) {
      workflow['14'].inputs.noise_seed = seed
    }

    // Set seed for FaceDetailer nodes
    if (workflow['56']) {
      workflow['56'].inputs.seed = seed + 1
    }

    if (workflow['69']) {
      workflow['69'].inputs.seed = seed + 2
    }
  }

  return seed
}

function addSaveImageWebsocketNode(
  workflow: ComfyUIWorkflow,
  promptsData: PromptsData,
  isInpainting: boolean = false
) {
  if (isInpainting) {
    // Inpainting workflow - check if FaceDetailer should be used
    let imageSourceNodeId: string
    if (promptsData.useFaceDetailer) {
      // Use ImageCompositeMasked output (FaceDetailer result composited with original)
      imageSourceNodeId = '106'
    } else {
      // Use VAE Decode output directly from LatentCompositeMasked
      imageSourceNodeId = '102'
    }

    workflow[FINAL_SAVE_NODE_ID] = {
      inputs: { images: [imageSourceNodeId, 0] },
      class_type: 'SaveImageWebsocket',
      _meta: { title: 'Final Save Image Websocket' }
    }
    return
  }

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
  prompts: {
    all: string
    zone1: string
    zone2: string
    negative: string
    inpainting: string
  },
  settings: Settings,
  seed: number,
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
      const filePath = await saveImage(imageBlob, prompts, settings.outputDirectory, workflow, seed)
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

function getEffectiveModelSettings(settings: Settings, modelName: string | null): ModelSettings | null {
  if (settings.perModel && modelName && settings.perModel[modelName]) {
    return settings.perModel[modelName]
  }
  if (settings.perModel && settings.perModel['Default']) {
    return settings.perModel['Default']
  }
  return null
}

function getEffectiveLoras(
  settings: Settings,
  modelName: string | null,
  fallback: { name: string; weight: number }[]
): { name: string; weight: number }[] {
  const ms = getEffectiveModelSettings(settings, modelName)
  if (ms && ms.loras && ms.loras.length > 0) {
    return ms.loras
  }
  return fallback
}

function applyPerModelOverrides(settings: Settings, modelName: string | null): Settings {
  const base: Settings = { ...settings, perModel: settings.perModel }
  const ms = getEffectiveModelSettings(settings, modelName)
  if (ms) {
    base.cfgScale = ms.cfgScale
    base.steps = ms.steps
    base.sampler = ms.sampler
    base.selectedVae = ms.selectedVae
  }
  return base
}

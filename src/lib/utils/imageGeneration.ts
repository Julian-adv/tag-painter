// Image generation utility functions
//
// This module orchestrates the complete image generation workflow with ComfyUI

import { saveImage } from './fileIO'
import {
  buildComfyHttpUrl,
  connectWebSocket,
  normalizeBaseUrl,
  type WebSocketCallbacks
} from './comfyui'
import {
  defaultWorkflowPrompt,
  inpaintingWorkflowPrompt,
  FINAL_SAVE_NODE_ID,
  generateLoraChain,
  configureClipSkip
} from './workflow'
import {
  expandCustomTags,
  detectCompositionFromTags,
  cleanDirectivesFromTags,
  prefetchWildcardFilesForTags,
  prefetchWildcardFilesFromTexts
} from './tagExpansion'
import { getWildcardModel } from '../stores/tagsStore'
import { updateComposition } from '../stores/promptsStore'
import type {
  PromptsData,
  Settings,
  ProgressData,
  ComfyUIWorkflow,
  ModelSettings
} from '$lib/types'

function generateClientId(): string {
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID()
  }
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = cryptoObj.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const segments = [
      bytes.subarray(0, 4),
      bytes.subarray(4, 6),
      bytes.subarray(6, 8),
      bytes.subarray(8, 10),
      bytes.subarray(10, 16)
    ].map((segment) =>
      Array.from(segment)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
    )
    return `${segments[0]}-${segments[1]}-${segments[2]}-${segments[3]}-${segments[4]}`
  }
  let value = ''
  for (let index = 0; index < 36; index += 1) {
    if (index === 8 || index === 13 || index === 18 || index === 23) {
      value += '-'
    } else if (index === 14) {
      value += '4'
    } else {
      const random = Math.floor(Math.random() * 16)
      const hex = index === 19 ? (random & 0x3) | 0x8 : random
      value += hex.toString(16)
    }
  }
  return value
}

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
    const clientId = generateClientId()

    // Expand custom tags and create prompt parts, using previous resolutions if regenerating
    const previousAll = previousRandomTagResolutions?.all || {}
    const model = getWildcardModel()
    // Prefetch wildcard files for all zones to allow synchronous replacement during expansion
    await prefetchWildcardFilesForTags(
      [
        ...promptsData.tags.all,
        ...promptsData.tags.zone1,
        ...promptsData.tags.zone2,
        ...promptsData.tags.negative,
        ...promptsData.tags.inpainting
      ],
      model
    )
    // Also prefetch from previous resolutions to support overrides that contain wildcards
    const prevTextsAll: string[] = Object.values(previousAll || {})
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
    const prevTextsZone1: string[] = Object.values(previousZone1 || {})
    const zone1Result = expandCustomTags(
      promptsData.tags.zone1,
      model,
      new Set(),
      { ...allResult.randomTagResolutions },
      previousZone1
    )

    const previousZone2 = previousRandomTagResolutions?.zone2 || {}
    const prevTextsZone2: string[] = Object.values(previousZone2 || {})
    const zone2Result = expandCustomTags(
      promptsData.tags.zone2,
      model,
      new Set(),
      { ...allResult.randomTagResolutions, ...zone1Result.randomTagResolutions },
      previousZone2
    )

    const previousNegative = previousRandomTagResolutions?.negative || {}
    const prevTextsNeg: string[] = Object.values(previousNegative || {})
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
    const prevTextsInpaint: string[] = Object.values(previousInpainting || {})
    const prevTexts: string[] = [
      ...prevTextsAll,
      ...prevTextsZone1,
      ...prevTextsZone2,
      ...prevTextsNeg,
      ...prevTextsInpaint
    ]
    await prefetchWildcardFilesFromTexts(prevTexts)
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

    // Resolve wildcard directives inside leaf expansion already; now just clean directives
    const allRaw = allResult.expandedTags.join(', ')
    let allTagsText = cleanDirectivesFromTags(allRaw)

    const zone1Raw = zone1Result.expandedTags.join(', ')
    const zone1TagsText = cleanDirectivesFromTags(zone1Raw)

    const zone2Raw = zone2Result.expandedTags.join(', ')
    let zone2TagsText = cleanDirectivesFromTags(zone2Raw)

    const negativeRaw = negativeResult.expandedTags.join(', ')
    let negativeTagsText = cleanDirectivesFromTags(negativeRaw)

    const inpaintingRaw = inpaintingResult.expandedTags.join(', ')
    const inpaintingTagsText = cleanDirectivesFromTags(inpaintingRaw)

    // Organize random tag resolutions by zone (already resolved, includes wildcard replacements)
    const allRandomResolutions = {
      all: { ...allResult.randomTagResolutions },
      zone1: { ...zone1Result.randomTagResolutions },
      zone2: { ...zone2Result.randomTagResolutions },
      negative: { ...negativeResult.randomTagResolutions },
      inpainting: { ...inpaintingResult.randomTagResolutions }
    }

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

    // Configure workflow based on settings merged with per-model overrides
    const appliedSettings = applyPerModelOverrides(settings, promptsData.selectedCheckpoint)

    // Configure LoRA chain with per-model overrides
    const effectiveLoras = getEffectiveLoras(
      settings,
      promptsData.selectedCheckpoint,
      promptsData.selectedLoras
    )
    generateLoraChain(effectiveLoras, workflow, appliedSettings.clipSkip)

    configureWorkflow(workflow, promptsData, appliedSettings, isInpainting, inpaintDenoiseStrength)

    // Configure CLIP skip
    configureClipSkip(workflow, appliedSettings.clipSkip)

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

  // Get effective model settings (includes scheduler)
  const effectiveModel = getEffectiveModelSettings(settings, promptsData.selectedCheckpoint)
  const scheduler = effectiveModel?.scheduler || 'simple'

  if (isInpainting) {
    // Inpainting workflow configuration
    workflow['10'].inputs.steps = settings.steps
    workflow['10'].inputs.cfg = settings.cfgScale
    workflow['10'].inputs.sampler_name = settings.sampler
    workflow['10'].inputs.scheduler = scheduler

    // Apply custom denoise strength if provided, otherwise use default
    if (inpaintDenoiseStrength !== undefined) {
      workflow['10'].inputs.denoise = inpaintDenoiseStrength
    }

    // Configure FaceDetailer scheduler for inpainting
    if (workflow['56']) {
      workflow['56'].inputs.scheduler = scheduler
    }

    // For inpainting, image size is determined by input image, not by EmptyLatentImage
  } else {
    // Regular workflow configuration
    // Apply settings values to workflow
    workflow['45'].inputs.steps = settings.steps
    workflow['45'].inputs.scheduler = scheduler
    workflow['14'].inputs.cfg = settings.cfgScale
    workflow['15'].inputs.sampler_name = settings.sampler
    workflow['16'].inputs.width = settings.imageWidth
    workflow['16'].inputs.height = settings.imageHeight

    // Configure FaceDetailer schedulers
    if (workflow['56']) {
      workflow['56'].inputs.scheduler = scheduler
    }
    if (workflow['69']) {
      workflow['69'].inputs.scheduler = scheduler
    }

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

  const comfyBase = normalizeBaseUrl(settings.comfyUrl)

  // Submit prompt to ComfyUI
  const response = await fetch(buildComfyHttpUrl(comfyBase, 'prompt'), {
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

  await connectWebSocket(
    result.prompt_id,
    clientId,
    FINAL_SAVE_NODE_ID,
    workflow,
    wsCallbacks,
    comfyBase
  )
}

function getEffectiveModelSettings(
  settings: Settings,
  modelName: string | null
): ModelSettings | null {
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
  const primary = ms && ms.loras ? ms.loras : []
  const secondary = Array.isArray(fallback) ? fallback : []
  // Merge while preserving order and avoiding duplicates by name.
  const seen = new Set<string>()
  const merged: { name: string; weight: number }[] = []
  for (const l of [...primary, ...secondary]) {
    if (!seen.has(l.name)) {
      seen.add(l.name)
      merged.push({ name: l.name, weight: l.weight })
    }
  }
  return merged
}

function applyPerModelOverrides(settings: Settings, modelName: string | null): Settings {
  const base: Settings = { ...settings, perModel: settings.perModel }
  const ms = getEffectiveModelSettings(settings, modelName)
  if (ms) {
    base.cfgScale = ms.cfgScale
    base.steps = ms.steps
    base.sampler = ms.sampler
    base.selectedVae = ms.selectedVae
    base.clipSkip = ms.clipSkip ?? base.clipSkip ?? 2
  }

  // Ensure clipSkip has a default value (use global setting as fallback, then default to 2)
  if (base.clipSkip == null) {
    base.clipSkip = 2
  }

  return base
}

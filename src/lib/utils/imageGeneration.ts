// Image generation utility functions
//
// This module orchestrates the complete image generation workflow with ComfyUI

import {
  defaultWorkflowPrompt,
  inpaintingWorkflowPrompt,
  FINAL_SAVE_NODE_ID,
  generateLoraChain,
  configureClipSkip
} from './workflow'
import { DEFAULT_FACE_DETAILER_SETTINGS, DEFAULT_UPSCALE_SETTINGS } from '$lib/constants'
import { generateQwenImage } from './qwenImageGeneration'
import {
  generateClientId,
  getEffectiveModelSettings,
  getEffectiveLoras,
  applyPerModelOverrides,
  submitToComfyUI
} from './generationCommon'
import {
  expandCustomTags,
  detectCompositionFromTags,
  cleanDirectivesFromTags,
  prefetchWildcardFilesFromTexts
} from './tagExpansion'
import { getWildcardModel } from '../stores/tagsStore'
import { readWildcardZones } from './wildcardZones'
import { updateComposition } from '../stores/promptsStore'
import type { PromptsData, Settings, ProgressData, ComfyUIWorkflow } from '$lib/types'

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
  const modelSettings = getEffectiveModelSettings(settings, promptsData.selectedCheckpoint)

  if (!isInpainting && modelSettings?.modelType === 'qwen') {
    return generateQwenImage(options, modelSettings)
  }

  if (isInpainting && modelSettings?.modelType === 'qwen') {
    const message = 'Qwen models do not support inpainting.'
    console.warn(message)
    onError(message)
    throw new Error(message)
  }

  try {
    const workflow = JSON.parse(
      JSON.stringify(isInpainting ? inpaintingWorkflowPrompt : defaultWorkflowPrompt)
    )

    onLoadingChange(true)
    onProgressUpdate({ value: 0, max: 100, currentNode: '' })

    // Generate unique client ID
    const clientId = generateClientId()

    // Read wildcard zones instead of using promptsData.tags
    const wildcardZones = await readWildcardZones(modelSettings?.modelType)

    // Expand custom tags and create prompt parts, using previous resolutions if regenerating
    const previousAll = previousRandomTagResolutions?.all || {}
    const model = getWildcardModel()
    // Prefetch wildcard files for all zones to allow synchronous replacement during expansion
    await prefetchWildcardFilesFromTexts([
      wildcardZones.all,
      wildcardZones.zone1,
      wildcardZones.zone2,
      wildcardZones.negative,
      wildcardZones.inpainting
    ])
    // Also prefetch from previous resolutions to support overrides that contain wildcards
    const prevTextsAll: string[] = Object.values(previousAll || {})
    const allResult = expandCustomTags(wildcardZones.all, model, new Set(), {}, previousAll)

    // Check for composition detection
    const detectedComposition = detectCompositionFromTags([allResult.expandedText])
    if (detectedComposition) {
      console.log(`Auto-selecting composition: ${detectedComposition}`)
      updateComposition(detectedComposition)
      // Update promptsData with the new composition for this generation
      promptsData.selectedComposition = detectedComposition
    }

    const previousZone1 = previousRandomTagResolutions?.zone1 || {}
    const prevTextsZone1: string[] = Object.values(previousZone1 || {})
    const zone1Result = expandCustomTags(
      wildcardZones.zone1,
      model,
      new Set(),
      { ...allResult.randomTagResolutions },
      previousZone1
    )

    const previousZone2 = previousRandomTagResolutions?.zone2 || {}
    const prevTextsZone2: string[] = Object.values(previousZone2 || {})
    const zone2Result = expandCustomTags(
      wildcardZones.zone2,
      model,
      new Set(),
      { ...allResult.randomTagResolutions, ...zone1Result.randomTagResolutions },
      previousZone2
    )

    const previousNegative = previousRandomTagResolutions?.negative || {}
    const prevTextsNeg: string[] = Object.values(previousNegative || {})
    const negativeResult = expandCustomTags(
      wildcardZones.negative,
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
      wildcardZones.inpainting,
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
    let allTagsText = cleanDirectivesFromTags(allResult.expandedText)

    const zone1TagsText = cleanDirectivesFromTags(zone1Result.expandedText)

    let zone2TagsText = cleanDirectivesFromTags(zone2Result.expandedText)

    let negativeTagsText = cleanDirectivesFromTags(negativeResult.expandedText)

    const inpaintingTagsText = cleanDirectivesFromTags(inpaintingResult.expandedText)

    // Organize random tag resolutions by zone (already resolved, includes wildcard replacements)
    const allRandomResolutions = {
      all: { ...allResult.randomTagResolutions },
      zone1: { ...zone1Result.randomTagResolutions },
      zone2: { ...zone2Result.randomTagResolutions },
      negative: { ...negativeResult.randomTagResolutions },
      inpainting: { ...inpaintingResult.randomTagResolutions }
    }

    // Apply per-model quality/negative prefixes
    const qualityPrefix = modelSettings?.qualityPrefix ?? ''
    const negativePrefix = modelSettings?.negativePrefix ?? ''
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
      // Clear face detailer wildcard since we use separate conditioning
      workflow['56'].inputs.wildcard = ''

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

    // Configure upscale text prompts if enabled
    if (promptsData.useUpscale) {
      const isAllComposition = promptsData.selectedComposition === 'all'
      const combinedPrompt = isAllComposition
        ? allTagsText
        : allTagsText && (zone1TagsText || zone2TagsText)
          ? `${allTagsText}, ${zone1TagsText || ''}${zone2TagsText ? (zone1TagsText ? ', ' : '') + zone2TagsText : ''}`
          : allTagsText || zone1TagsText || zone2TagsText

      if (workflow['123']) {
        workflow['123'].inputs.text = combinedPrompt // Positive prompt for upscale
      }
      if (workflow['124']) {
        workflow['124'].inputs.text = negativeTagsText // Negative prompt for upscale
      }
    }

    // Configure FaceDetailer text prompts and wildcard if enabled
    if (promptsData.useFaceDetailer) {
      // Set face detailer wildcard with appropriate prompts
      const isAllComposition = promptsData.selectedComposition === 'all'
      const combinedZonePrompt = isAllComposition
        ? zone1TagsText
        : zone1TagsText && zone2TagsText
          ? `[ASC] ${zone1TagsText} [SEP] ${zone2TagsText}`
          : zone1TagsText || zone2TagsText

      // Set wildcard for all FaceDetailer nodes
      if (workflow['56']) {
        workflow['56'].inputs.wildcard = combinedZonePrompt
      }
      if (workflow['69']) {
        workflow['69'].inputs.wildcard = combinedZonePrompt
      }

      // Configure FaceDetailer text prompts for separate conditioning
      const combinedPrompt = isAllComposition
        ? allTagsText
        : allTagsText && (zone1TagsText || zone2TagsText)
          ? `${allTagsText}, ${zone1TagsText || ''}${zone2TagsText ? (zone1TagsText ? ', ' : '') + zone2TagsText : ''}`
          : allTagsText || zone1TagsText || zone2TagsText

      workflow['101'].inputs.text = combinedPrompt // Positive prompt for FaceDetailer
      workflow['103'].inputs.text = negativeTagsText // Negative prompt for FaceDetailer
    }

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
      // Configure latent upscale workflow
      if (workflow['120'] && workflow['121'] && workflow['122']) {
        // Get upscale settings
        const effectiveModel = getEffectiveModelSettings(settings, promptsData.selectedCheckpoint)
        const upscaleSettings = effectiveModel?.upscale || DEFAULT_UPSCALE_SETTINGS

        // Configure LatentUpscale dimensions (use scale from settings)
        workflow['120'].inputs.width = Math.round(settings.imageWidth * upscaleSettings.scale)
        workflow['120'].inputs.height = Math.round(settings.imageHeight * upscaleSettings.scale)

        // Configure upscale checkpoint (default to selected base model if unset/placeholder)
        const resolvedUpscaleCkpt =
          upscaleSettings.checkpoint && upscaleSettings.checkpoint !== 'model.safetensors'
            ? upscaleSettings.checkpoint
            : promptsData.selectedCheckpoint || upscaleSettings.checkpoint
        workflow['122'].inputs.ckpt_name = resolvedUpscaleCkpt

        // Configure upscale VAE (if not using embedded)
        if (upscaleSettings.selectedVae && upscaleSettings.selectedVae !== '__embedded__') {
          // For regular workflow, we don't have separate VAE loader for upscale yet
          // This would need additional implementation
        }

        // Configure upscale KSampler
        workflow['121'].inputs.steps = upscaleSettings.steps
        workflow['121'].inputs.cfg = upscaleSettings.cfgScale
        workflow['121'].inputs.sampler_name = upscaleSettings.sampler
        workflow['121'].inputs.scheduler = upscaleSettings.scheduler
        workflow['121'].inputs.denoise = upscaleSettings.denoise

        // Change VAEDecode to use upscale KSampler output
        workflow['19'].inputs.samples = ['121', 0]
      }
    }

    if (promptsData.useFaceDetailer) {
      // Configure FaceDetailer with per-model settings
      const effectiveModel = getEffectiveModelSettings(settings, promptsData.selectedCheckpoint)
      const faceDetailerSettings = effectiveModel?.faceDetailer || DEFAULT_FACE_DETAILER_SETTINGS

      // Set FaceDetailer checkpoint model (default to selected base model if unset/placeholder)
      if (workflow['100']) {
        const resolvedFdCkpt =
          faceDetailerSettings.checkpoint && faceDetailerSettings.checkpoint !== 'model.safetensors'
            ? faceDetailerSettings.checkpoint
            : promptsData.selectedCheckpoint || faceDetailerSettings.checkpoint
        workflow['100'].inputs.ckpt_name = resolvedFdCkpt
      }

      // Configure FaceDetailer generation settings for all FaceDetailer nodes
      if (workflow['56']) {
        workflow['56'].inputs.steps = faceDetailerSettings.steps
        workflow['56'].inputs.cfg = faceDetailerSettings.cfgScale
        workflow['56'].inputs.sampler_name = faceDetailerSettings.sampler
        workflow['56'].inputs.scheduler = faceDetailerSettings.scheduler
        workflow['56'].inputs.denoise = faceDetailerSettings.denoise

        // Configure VAE
        if (faceDetailerSettings.selectedVae === '__embedded__') {
          workflow['56'].inputs.vae = ['100', 2] // Use embedded VAE from FaceDetailer checkpoint
        } else {
          workflow['56'].inputs.vae = ['5', 0] // Use main VAE
        }
      }
      if (workflow['69']) {
        workflow['69'].inputs.steps = faceDetailerSettings.steps
        workflow['69'].inputs.cfg = faceDetailerSettings.cfgScale
        workflow['69'].inputs.sampler_name = faceDetailerSettings.sampler
        workflow['69'].inputs.scheduler = faceDetailerSettings.scheduler
        workflow['69'].inputs.denoise = faceDetailerSettings.denoise

        // Configure VAE
        if (faceDetailerSettings.selectedVae === '__embedded__') {
          workflow['69'].inputs.vae = ['100', 2] // Use embedded VAE from FaceDetailer checkpoint
        } else {
          workflow['69'].inputs.vae = ['5', 0] // Use main VAE
        }
      }
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
  const seed = providedSeed ?? Math.floor(Math.random() * 1000000000000000)

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
      imageSourceNodeId = '19' // Output of VAE Decode (from upscale KSampler)
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

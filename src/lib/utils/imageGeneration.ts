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
import { generateChromaImage } from './chromaImageGeneration'
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
import {
  findNodeByTitle,
  setNodeTextInput,
  setNodeCheckpoint,
  setNodeSampler,
  setNodeImageSize,
  setNodeImagePath,
  setNodeVae,
  setNodeClipSkip
} from './workflowMapping'

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
  disabledZones: Set<string>
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

  if (!isInpainting && modelSettings?.modelType === 'chroma') {
    return generateChromaImage(options, modelSettings)
  }

  if (isInpainting && modelSettings?.modelType === 'chroma') {
    // Conservatively treat like SDXL inpainting unless specified otherwise
    // If Chroma does not support inpainting in your workflow, set a custom workflow per model.
  }

  try {
    // Load custom workflow if specified, otherwise use default
    let workflow: ComfyUIWorkflow
    const customWorkflowPath = modelSettings?.customWorkflowPath
    if (customWorkflowPath) {
      try {
        const { loadCustomWorkflow } = await import('./workflowMapping')
        workflow = await loadCustomWorkflow(customWorkflowPath)
        console.log('Loaded custom workflow from:', customWorkflowPath)
      } catch (error) {
        console.error('Failed to load custom workflow, using default:', error)
        workflow = JSON.parse(
          JSON.stringify(isInpainting ? inpaintingWorkflowPrompt : defaultWorkflowPrompt)
        )
      }
    } else {
      workflow = JSON.parse(
        JSON.stringify(isInpainting ? inpaintingWorkflowPrompt : defaultWorkflowPrompt)
      )
    }

    onLoadingChange(true)
    onProgressUpdate({ value: 0, max: 100, currentNode: '' })

    // Generate unique client ID
    const clientId = generateClientId()

    // Read wildcard zones instead of using promptsData.tags
    const wildcardZones = await readWildcardZones(modelSettings?.modelType)

    // Expand custom tags and create prompt parts, using previous resolutions if regenerating
    const previousAll = previousRandomTagResolutions?.all || {}
    const model = getWildcardModel()
    // Prefetch wildcard files referenced in model tree
    await prefetchWildcardFilesFromTexts(model)

    // Create shared disabled context to propagate disables across zones
    const sharedDisabledContext = { names: new Set<string>(), patterns: [] as string[] }

    const allResult = expandCustomTags(wildcardZones.all, model, new Set(), {}, previousAll, sharedDisabledContext)

    // Check for composition detection
    const detectedComposition = detectCompositionFromTags([allResult.expandedText])
    if (detectedComposition) {
      console.log(`Auto-selecting composition: ${detectedComposition}`)
      updateComposition(detectedComposition)
      // Update promptsData with the new composition for this generation
      promptsData.selectedComposition = detectedComposition
    }

    const previousZone1 = previousRandomTagResolutions?.zone1 || {}
    const zone1Result = expandCustomTags(
      wildcardZones.zone1,
      model,
      new Set(),
      { ...allResult.randomTagResolutions },
      previousZone1,
      sharedDisabledContext
    )

    const previousZone2 = previousRandomTagResolutions?.zone2 || {}
    const zone2Result = expandCustomTags(
      wildcardZones.zone2,
      model,
      new Set(),
      { ...allResult.randomTagResolutions, ...zone1Result.randomTagResolutions },
      previousZone2,
      sharedDisabledContext
    )

    const previousNegative = previousRandomTagResolutions?.negative || {}
    const negativeResult = expandCustomTags(
      wildcardZones.negative,
      model,
      new Set(),
      {
        ...allResult.randomTagResolutions,
        ...zone1Result.randomTagResolutions,
        ...zone2Result.randomTagResolutions
      },
      previousNegative,
      sharedDisabledContext
    )

    const previousInpainting = previousRandomTagResolutions?.inpainting || {}
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
      previousInpainting,
      sharedDisabledContext
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
      // Configure inpainting workflow (title-based)
      setNodeTextInput(workflow, 'CLIP Text Encode (Prompt)', inpaintingTagsText)
      setNodeTextInput(workflow, 'CLIP Text Encode (Negative)', negativeTagsText)

      // Set the current image as input
      if (currentImagePath) {
        setNodeImagePath(workflow, 'Load Input Image', currentImagePath)
        console.log('Using image path:', currentImagePath)
      }

      // Set the mask image (already has full path)
      if (maskFilePath) {
        setNodeImagePath(workflow, 'Load Mask Image', maskFilePath)
        console.log('Using mask path:', maskFilePath)
      }
    } else {
      // Configure regular workflow
      // If composition is 'all', ignore zone2 so it doesn't affect generation
      const isAll = promptsData.selectedComposition === 'all'
      if (isAll) {
        zone2TagsText = ''
      }

      // Assign prompts to different nodes (title-based)
      setNodeTextInput(workflow, 'CLIP Text Encode (All)', allTagsText)
      setNodeTextInput(workflow, 'CLIP Text Encode (Zone1)', zone1TagsText)
      setNodeTextInput(workflow, 'CLIP Text Encode (Zone2)', zone2TagsText)

      // Set mask configuration for regional separation (title-based)
      const coupleNode = findNodeByTitle(workflow, 'Attention Couple 🍌')?.nodeId
      const leftMask = findNodeByTitle(workflow, 'Convert Image to Mask')?.nodeId
      const invertedMask = findNodeByTitle(workflow, 'InvertMask')?.nodeId
      if (coupleNode && leftMask && workflow[coupleNode]) {
        workflow[coupleNode].inputs.mask_1 = [leftMask, 0]
      }
      if (coupleNode && invertedMask && workflow[coupleNode]) {
        workflow[coupleNode].inputs.mask_2 = [invertedMask, 0]
      }

      // Set negative prompt from negative tags
      setNodeTextInput(workflow, 'CLIP Text Encode (Negative)', negativeTagsText)

      // Get mask image path from server-side API with selected composition
      const maskResponse = await fetch(
        `/api/mask-path?composition=${encodeURIComponent(promptsData.selectedComposition)}`
      )
      if (!maskResponse.ok) {
        throw new Error(`Failed to get mask path: ${maskResponse.statusText}`)
      }
      const { maskImagePath } = await maskResponse.json()
      setNodeImagePath(workflow, 'Load Image', maskImagePath)
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

    // Configure CLIP skip (title-based and legacy numeric for compatibility)
    setNodeClipSkip(workflow, 'CLIP Set Last Layer', appliedSettings.clipSkip)
    if (isInpainting) setNodeClipSkip(workflow, 'CLIP Set Last Layer (Inpainting)', appliedSettings.clipSkip)
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

      setNodeTextInput(workflow, 'Upscale CLIP Text Encode (Positive)', combinedPrompt)
      setNodeTextInput(workflow, 'Upscale CLIP Text Encode (Negative)', negativeTagsText)
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

      // Set wildcard for FaceDetailer node
      const fdNode = findNodeByTitle(workflow, 'FaceDetailer')?.nodeId
      if (fdNode && workflow[fdNode] && 'wildcard' in workflow[fdNode].inputs) {
        workflow[fdNode].inputs.wildcard = combinedZonePrompt
      }

      // Configure FaceDetailer text prompts for separate conditioning
      const combinedPrompt = isAllComposition
        ? allTagsText
        : allTagsText && (zone1TagsText || zone2TagsText)
          ? `${allTagsText}, ${zone1TagsText || ''}${zone2TagsText ? (zone1TagsText ? ', ' : '') + zone2TagsText : ''}`
          : allTagsText || zone1TagsText || zone2TagsText

      setNodeTextInput(workflow, 'FaceDetailer CLIP Text Encode (Positive)', combinedPrompt)
      setNodeTextInput(workflow, 'FaceDetailer CLIP Text Encode (Negative)', negativeTagsText)
    }

    // Update mask file in workflow if provided
    if (maskFilePath) {
      console.log('Using mask file:', maskFilePath)
      // Update composition mask image node
      setNodeImagePath(workflow, 'Load Image', maskFilePath)
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

    return {
      seed: appliedSeed,
      randomTagResolutions: allRandomResolutions,
      disabledZones: sharedDisabledContext.names
    }
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
  // Set checkpoint by title
  if (promptsData.selectedCheckpoint) {
    setNodeCheckpoint(workflow, 'Load Checkpoint', promptsData.selectedCheckpoint)
  }

  // Get effective model settings (includes scheduler)
  const effectiveModel = getEffectiveModelSettings(settings, promptsData.selectedCheckpoint)
  const scheduler = effectiveModel?.scheduler || 'simple'

  if (isInpainting) {
    // Inpainting workflow configuration (title-based)
    setNodeSampler(workflow, 'KSampler (inpainting)', {
      steps: settings.steps,
      cfg: settings.cfgScale,
      sampler_name: settings.sampler,
      scheduler,
      denoise: inpaintDenoiseStrength
    })

    // For inpainting, image size is determined by input image, not by EmptyLatentImage
  } else {
    // Regular workflow configuration
    // Apply settings values to workflow
    setNodeSampler(workflow, 'BasicScheduler', { steps: settings.steps, scheduler })
    setNodeSampler(workflow, 'SamplerCustom', { cfg: settings.cfgScale })
    setNodeSampler(workflow, 'KSamplerSelect', { sampler_name: settings.sampler })
    setNodeImageSize(workflow, 'Empty Latent Image', settings.imageWidth, settings.imageHeight)

    // Ensure Upscale Checkpoint Loader has a valid checkpoint even if upscale is disabled
    const effectiveModel2 = getEffectiveModelSettings(settings, promptsData.selectedCheckpoint)
    const upscaleSettings2 = effectiveModel2?.upscale || DEFAULT_UPSCALE_SETTINGS
    const baseCkptNodeId = findNodeByTitle(workflow, 'Load Checkpoint')?.nodeId
    const baseCkptName =
      baseCkptNodeId && typeof workflow[baseCkptNodeId]?.inputs?.ckpt_name === 'string'
        ? (workflow[baseCkptNodeId].inputs.ckpt_name as string)
        : null
    const resolvedUpscaleCkptAlways =
      (upscaleSettings2.checkpoint && upscaleSettings2.checkpoint !== 'model.safetensors'
        ? upscaleSettings2.checkpoint
        : null) || promptsData.selectedCheckpoint || baseCkptName || upscaleSettings2.checkpoint
    setNodeCheckpoint(workflow, 'Upscale Checkpoint Loader', resolvedUpscaleCkptAlways)

    // Configure FaceDetailer scheduler (title-based)
    setNodeSampler(workflow, 'FaceDetailer', { scheduler })

    // Configure optional features
    if (promptsData.useUpscale) {
      // Configure latent upscale workflow when upscale nodes exist
      {
        // Get upscale settings
        const effectiveModel = getEffectiveModelSettings(settings, promptsData.selectedCheckpoint)
        const upscaleSettings = effectiveModel?.upscale || DEFAULT_UPSCALE_SETTINGS

        // Configure LatentUpscale dimensions (use scale from settings)
        const latentUpscale = findNodeByTitle(workflow, 'Latent Upscale')?.nodeId
        if (latentUpscale && workflow[latentUpscale]) {
          workflow[latentUpscale].inputs.width = Math.round(settings.imageWidth * upscaleSettings.scale)
          workflow[latentUpscale].inputs.height = Math.round(settings.imageHeight * upscaleSettings.scale)
        }

        // Configure upscale checkpoint (default to selected base model if unset/placeholder)
        const resolvedUpscaleCkpt =
          upscaleSettings.checkpoint && upscaleSettings.checkpoint !== 'model.safetensors'
            ? upscaleSettings.checkpoint
            : promptsData.selectedCheckpoint || upscaleSettings.checkpoint
        setNodeCheckpoint(workflow, 'Upscale Checkpoint Loader', resolvedUpscaleCkpt)

        // Configure upscale VAE (if not using embedded)
        if (upscaleSettings.selectedVae && upscaleSettings.selectedVae !== '__embedded__') {
          // For regular workflow, we don't have separate VAE loader for upscale yet
          // This would need additional implementation
        }

        // Configure upscale KSampler
        setNodeSampler(workflow, 'KSampler (Upscale)', {
          steps: upscaleSettings.steps,
          cfg: upscaleSettings.cfgScale,
          sampler_name: upscaleSettings.sampler,
          scheduler: upscaleSettings.scheduler,
          denoise: upscaleSettings.denoise
        })

        // Change VAEDecode to use upscale KSampler output
        const upscaleSampler = findNodeByTitle(workflow, 'KSampler (Upscale)')?.nodeId
        const baseDecode = findNodeByTitle(workflow, 'VAE Decode')?.nodeId
        if (upscaleSampler && baseDecode && workflow[baseDecode]) {
          workflow[baseDecode].inputs.samples = [upscaleSampler, 0]
        }
      }
    }

    if (promptsData.useFaceDetailer) {
      // Configure FaceDetailer with per-model settings
      const effectiveModel = getEffectiveModelSettings(settings, promptsData.selectedCheckpoint)
      const faceDetailerSettings = effectiveModel?.faceDetailer || DEFAULT_FACE_DETAILER_SETTINGS

      // Set FaceDetailer checkpoint model (default to selected base model if unset/placeholder)
      if (findNodeByTitle(workflow, 'FaceDetailer Checkpoint Loader')?.nodeId) {
        const resolvedFdCkpt =
          faceDetailerSettings.checkpoint && faceDetailerSettings.checkpoint !== 'model.safetensors'
            ? faceDetailerSettings.checkpoint
            : promptsData.selectedCheckpoint || faceDetailerSettings.checkpoint
        setNodeCheckpoint(workflow, 'FaceDetailer Checkpoint Loader', resolvedFdCkpt)
      }

      // Configure FaceDetailer generation settings
      if (findNodeByTitle(workflow, 'FaceDetailer')?.nodeId) {
        setNodeSampler(workflow, 'FaceDetailer', {
          steps: faceDetailerSettings.steps,
          cfg: faceDetailerSettings.cfgScale,
          sampler_name: faceDetailerSettings.sampler,
          scheduler: faceDetailerSettings.scheduler,
          denoise: faceDetailerSettings.denoise
        })

        // Configure VAE
        if (faceDetailerSettings.selectedVae === '__embedded__') {
          const fdCkpt = findNodeByTitle(workflow, 'FaceDetailer Checkpoint Loader')?.nodeId
          const fdNode = findNodeByTitle(workflow, 'FaceDetailer')?.nodeId
          if (fdCkpt && fdNode && workflow[fdNode]) workflow[fdNode].inputs.vae = [fdCkpt, 2]
        }

        // Set FaceDetailer input image based on upscale usage
        const fdNode = findNodeByTitle(workflow, 'FaceDetailer')?.nodeId
        const upDecode = findNodeByTitle(workflow, 'VAE Decode (Upscale)')?.nodeId
        const baseDecode = findNodeByTitle(workflow, 'VAE Decode')?.nodeId
        if (fdNode && workflow[fdNode]) {
          if (promptsData.useUpscale && upDecode) workflow[fdNode].inputs.image = [upDecode, 0]
          else if (!promptsData.useUpscale && baseDecode) workflow[fdNode].inputs.image = [baseDecode, 0]
        }
      }
    }
  }
}

function applyCustomVae(workflow: ComfyUIWorkflow, vaeName: string) {
  // Pick a unique node id for the injected VAELoader
  const baseId = 'custom_vae_loader'
  let vaeNodeId = baseId
  if (workflow[vaeNodeId]) {
    let i = 1
    while (workflow[`${baseId}_${i}`]) i++
    vaeNodeId = `${baseId}_${i}`
  }

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
      // Inpainting workflow - set seed for KSampler node by title
      setNodeSampler(workflow, 'KSampler (inpainting)', { seed })

    } else {
      // Regular workflow - set seed for SamplerCustom node (noise_seed)
      setNodeSampler(workflow, 'SamplerCustom', { seed })

      // Set seed for FaceDetailer node
      setNodeSampler(workflow, 'FaceDetailer', { seed: seed + 1 })
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
      // Composite FaceDetailer result with original
      imageSourceNodeId = findNodeByTitle(workflow, 'Composite FaceDetailer Result with Original')?.nodeId || '106'
    } else {
      // Use VAE Decode output directly from LatentCompositeMasked path
      imageSourceNodeId = findNodeByTitle(workflow, 'VAE Decode for FaceDetailer')?.nodeId || '102'
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
      imageSourceNodeId = findNodeByTitle(workflow, 'FaceDetailer')?.nodeId || '69'
    } else {
      imageSourceNodeId = findNodeByTitle(workflow, 'VAE Decode (Upscale)')?.nodeId || '126'
    }
  } else {
    imageSourceNodeId = (promptsData.useFaceDetailer
      ? findNodeByTitle(workflow, 'FaceDetailer')?.nodeId
      : findNodeByTitle(workflow, 'VAE Decode')?.nodeId) || (promptsData.useFaceDetailer ? '69' : '19')
  }

  // Add the single, dynamically configured SaveImageWebsocket node
  workflow[FINAL_SAVE_NODE_ID] = {
    inputs: { images: [imageSourceNodeId, 0] }, // Assuming output index 0
    class_type: 'SaveImageWebsocket',
    _meta: { title: 'Final Save Image Websocket' }
  }
}

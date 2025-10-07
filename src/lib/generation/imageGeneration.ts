// Image generation utility functions
//
// This module orchestrates the complete image generation workflow with ComfyUI

import {
  defaultWorkflowPrompt,
  inpaintingWorkflowPrompt,
  FINAL_SAVE_NODE_ID,
  generateLoraChain
} from './workflow'
import { DEFAULT_FACE_DETAILER_SETTINGS, DEFAULT_UPSCALE_SETTINGS } from '$lib/constants'
import { generateQwenImage } from './qwenImageGeneration'
import { generateChromaImage } from './chromaImageGeneration'
import { generateFlux1KreaImage } from './flux1KreaImageGeneration'
import {
  generateClientId,
  getEffectiveModelSettings,
  getEffectiveLoras,
  applyPerModelOverrides,
  submitToComfyUI
} from './generationCommon'
import { loadCustomWorkflow } from './workflowMapping'
import {
  expandCustomTags,
  detectCompositionFromTags,
  cleanDirectivesFromTags,
  prefetchWildcardFilesFromTexts
} from '../utils/tagExpansion'
import { getWildcardModel } from '../stores/tagsStore'
import { readWildcardZones } from '../utils/wildcardZones'
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
}

export async function generateImage(options: GenerationOptions): Promise<{
  error?: string
  seed?: number
  randomTagResolutions?: {
    all: Record<string, string>
    zone1: Record<string, string>
    zone2: Record<string, string>
    negative: Record<string, string>
    inpainting: Record<string, string>
  }
  disabledZones?: Set<string>
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
    onImageReceived
  } = options
  const modelSettings = getEffectiveModelSettings(settings, promptsData.selectedCheckpoint)

  if (!isInpainting && modelSettings?.modelType === 'qwen') {
    return generateQwenImage(options, modelSettings)
  }

  if (isInpainting && modelSettings?.modelType === 'qwen') {
    const message = 'Qwen models do not support inpainting.'
    console.warn(message)
    return { error: message }
  }

  if (!isInpainting && modelSettings?.modelType === 'chroma') {
    return generateChromaImage(options, modelSettings)
  }

  if (isInpainting && modelSettings?.modelType === 'chroma') {
    // Conservatively treat like SDXL inpainting unless specified otherwise
    // If Chroma does not support inpainting in your workflow, set a custom workflow per model.
  }

  if (!isInpainting && modelSettings?.modelType === 'flux1_krea') {
    return generateFlux1KreaImage(options, modelSettings)
  }

  if (isInpainting && modelSettings?.modelType === 'flux1_krea') {
    const message = 'Flux1 Krea models do not support inpainting.'
    console.warn(message)
    return { error: message }
  }

  try {
    // Load custom workflow if specified, otherwise use default
    let workflow: ComfyUIWorkflow
    const customWorkflowPath = modelSettings?.customWorkflowPath
    if (customWorkflowPath) {
      try {
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
    let wildcardZones
    try {
      wildcardZones = await readWildcardZones(modelSettings?.wildcardsFile, {
        reroll: true,
        skipRefresh: true
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load wildcards file'
      return { error: message }
    }

    // Expand custom tags and create prompt parts, using previous resolutions if regenerating
    const previousAll = previousRandomTagResolutions?.all || {}
    const model = getWildcardModel()
    // Prefetch wildcard files referenced in model tree
    await prefetchWildcardFilesFromTexts(model)

    // Create shared disabled context to propagate disables across zones
    const sharedDisabledContext = { names: new Set<string>(), patterns: [] as string[] }

    const allResult = expandCustomTags(
      wildcardZones.all,
      model,
      new Set(),
      {},
      previousAll,
      sharedDisabledContext
    )

    // Check for composition detection
    const detectedComposition = detectCompositionFromTags([allResult.expandedText])
    if (detectedComposition) {
      console.log(`Auto-selecting composition: ${detectedComposition}`)
      updateComposition(detectedComposition)
      // Update promptsData with the new composition for this generation
      promptsData.selectedComposition = detectedComposition
    }

    const previousZone1 = previousRandomTagResolutions?.zone1 || {}
    // Check if zone1 is disabled before expanding
    const zone1Result = sharedDisabledContext.names.has('zone1')
      ? { expandedText: '', randomTagResolutions: {} }
      : expandCustomTags(
          wildcardZones.zone1,
          model,
          new Set(),
          { ...allResult.randomTagResolutions },
          previousZone1,
          sharedDisabledContext
        )

    const previousZone2 = previousRandomTagResolutions?.zone2 || {}
    // Check if zone2 is disabled before expanding
    const zone2Result = sharedDisabledContext.names.has('zone2')
      ? { expandedText: '', randomTagResolutions: {} }
      : expandCustomTags(
          wildcardZones.zone2,
          model,
          new Set(),
          { ...allResult.randomTagResolutions, ...zone1Result.randomTagResolutions },
          previousZone2,
          sharedDisabledContext
        )

    const previousNegative = previousRandomTagResolutions?.negative || {}
    // Check if negative is disabled before expanding
    const negativeResult = sharedDisabledContext.names.has('negative')
      ? { expandedText: '', randomTagResolutions: {} }
      : expandCustomTags(
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
    // Check if inpainting is disabled before expanding
    const inpaintingResult = sharedDisabledContext.names.has('inpainting')
      ? { expandedText: '', randomTagResolutions: {} }
      : expandCustomTags(
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

    let zone1TagsText = cleanDirectivesFromTags(zone1Result.expandedText)

    let zone2TagsText = cleanDirectivesFromTags(zone2Result.expandedText)

    let negativeTagsText = cleanDirectivesFromTags(negativeResult.expandedText)

    let inpaintingTagsText = cleanDirectivesFromTags(inpaintingResult.expandedText)

    // Track disabled zones for UI feedback (zones already filtered during expansion)
    const disabledZones = new Set<string>(sharedDisabledContext.names)

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
      if (!setNodeTextInput(workflow, 'CLIP Text Encode (Prompt)', inpaintingTagsText)) {
        return { error: 'Workflow node not found: CLIP Text Encode (Prompt)' }
      }
      if (!setNodeTextInput(workflow, 'CLIP Text Encode (Negative)', negativeTagsText)) {
        return { error: 'Workflow node not found: CLIP Text Encode (Negative)' }
      }

      // Set the current image as input
      if (currentImagePath) {
        if (!setNodeImagePath(workflow, 'Load Input Image', currentImagePath)) {
          return { error: 'Workflow node not found: Load Input Image' }
        }
        console.log('Using image path:', currentImagePath)
      }

      // Set the mask image (already has full path)
      if (maskFilePath) {
        if (!setNodeImagePath(workflow, 'Load Mask Image', maskFilePath)) {
          return { error: 'Workflow node not found: Load Mask Image' }
        }
        console.log('Using mask path:', maskFilePath)
      }
    } else {
      // Configure regular workflow
      // If composition is 'all', ignore zone2 so it doesn't affect generation
      const isAll = promptsData.selectedComposition === 'all'
      if (isAll) {
        zone2TagsText = ''
        disabledZones.add('zone2')
      }

      // Assign prompts to different nodes (title-based)
      if (!setNodeTextInput(workflow, 'CLIP Text Encode (All)', allTagsText)) {
        return { error: 'Workflow node not found: CLIP Text Encode (All)' }
      }
      if (!setNodeTextInput(workflow, 'CLIP Text Encode (Zone1)', zone1TagsText)) {
        return { error: 'Workflow node not found: CLIP Text Encode (Zone1)' }
      }
      if (!setNodeTextInput(workflow, 'CLIP Text Encode (Zone2)', zone2TagsText)) {
        return { error: 'Workflow node not found: CLIP Text Encode (Zone2)' }
      }

      // Set mask configuration for regional separation (title-based)
      const coupleNode = findNodeByTitle(workflow, 'Attention Couple 🍌')?.nodeId
      if (!coupleNode) {
        return { error: 'Workflow node not found: Attention Couple 🍌' }
      }
      const leftMask = findNodeByTitle(workflow, 'Convert Image to Mask')?.nodeId
      if (!leftMask) {
        return { error: 'Workflow node not found: Convert Image to Mask' }
      }
      const invertedMask = findNodeByTitle(workflow, 'InvertMask')?.nodeId
      if (!invertedMask) {
        return { error: 'Workflow node not found: InvertMask' }
      }
      if (workflow[coupleNode]) {
        workflow[coupleNode].inputs.mask_1 = [leftMask, 0]
        workflow[coupleNode].inputs.mask_2 = [invertedMask, 0]
      }

      // Set negative prompt from negative tags
      if (!setNodeTextInput(workflow, 'CLIP Text Encode (Negative)', negativeTagsText)) {
        return { error: 'Workflow node not found: CLIP Text Encode (Negative)' }
      }

      // Get mask image path from server-side API with selected composition
      const maskResponse = await fetch(
        `/api/mask-path?composition=${encodeURIComponent(promptsData.selectedComposition)}`
      )
      if (!maskResponse.ok) {
        throw new Error(`Failed to get mask path: ${maskResponse.statusText}`)
      }
      const { maskImagePath } = await maskResponse.json()
      if (!setNodeImagePath(workflow, 'Load Image', maskImagePath)) {
        return { error: 'Workflow node not found: Load Image' }
      }
    }

    // Configure workflow based on settings merged with per-model overrides
    const appliedSettings = applyPerModelOverrides(settings, promptsData.selectedCheckpoint)

    // Configure LoRA chain with per-model overrides
    const effectiveLoras = getEffectiveLoras(
      settings,
      promptsData.selectedCheckpoint,
      promptsData.selectedLoras
    )
    const loraResult = generateLoraChain(effectiveLoras, workflow, appliedSettings.clipSkip)
    if (loraResult.error) {
      return { error: loraResult.error }
    }

    const configureResult = configureWorkflow(
      workflow,
      promptsData,
      appliedSettings,
      isInpainting,
      inpaintDenoiseStrength
    )
    if (configureResult) {
      return { error: configureResult.error }
    }

    // Configure CLIP skip (title-based and legacy numeric for compatibility)
    if (!setNodeClipSkip(workflow, 'CLIP Set Last Layer', appliedSettings.clipSkip)) {
      return { error: 'Workflow node not found: CLIP Set Last Layer' }
    }
    if (isInpainting) {
      if (!setNodeClipSkip(workflow, 'CLIP Set Last Layer (Inpainting)', appliedSettings.clipSkip)) {
        return { error: 'Workflow node not found: CLIP Set Last Layer (Inpainting)' }
      }
    }

    // Apply seeds (either use provided seed or generate new one)
    const appliedSeed = applySeedsToWorkflow(workflow, seed, isInpainting)

    // Add SaveImageWebsocket node for output
    const saveImageResult = addSaveImageWebsocketNode(workflow, promptsData, isInpainting)
    if (saveImageResult) {
      return { error: saveImageResult.error }
    }

    // Configure upscale text prompts if enabled
    if (promptsData.useUpscale) {
      const isAllComposition = promptsData.selectedComposition === 'all'
      const combinedPrompt = isAllComposition
        ? allTagsText
        : allTagsText && (zone1TagsText || zone2TagsText)
          ? `${allTagsText}, ${zone1TagsText || ''}${zone2TagsText ? (zone1TagsText ? ', ' : '') + zone2TagsText : ''}`
          : allTagsText || zone1TagsText || zone2TagsText

      if (!setNodeTextInput(workflow, 'Upscale CLIP Text Encode (Positive)', combinedPrompt)) {
        return { error: 'Workflow node not found: Upscale CLIP Text Encode (Positive)' }
      }
      if (!setNodeTextInput(workflow, 'Upscale CLIP Text Encode (Negative)', negativeTagsText)) {
        return { error: 'Workflow node not found: Upscale CLIP Text Encode (Negative)' }
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

      if (!setNodeTextInput(workflow, 'FaceDetailer CLIP Text Encode (Positive)', combinedPrompt)) {
        return { error: 'Workflow node not found: FaceDetailer CLIP Text Encode (Positive)' }
      }
      if (
        !setNodeTextInput(workflow, 'FaceDetailer CLIP Text Encode (Negative)', negativeTagsText)
      ) {
        return { error: 'Workflow node not found: FaceDetailer CLIP Text Encode (Negative)' }
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
        onImageReceived
      }
    )

    return {
      seed: appliedSeed,
      randomTagResolutions: allRandomResolutions,
      disabledZones
    }
  } catch (error) {
    console.error('Failed to generate image:', error)
    return {
      error: error instanceof Error ? error.message : 'Failed to generate image'
    }
  }
}

function configureWorkflow(
  workflow: ComfyUIWorkflow,
  promptsData: PromptsData,
  settings: Settings,
  isInpainting: boolean = false,
  inpaintDenoiseStrength?: number
): { error: string } | null {
  // Set checkpoint by title
  if (promptsData.selectedCheckpoint) {
    if (!setNodeCheckpoint(workflow, 'Load Checkpoint', promptsData.selectedCheckpoint)) {
      return { error: 'Workflow node not found: Load Checkpoint' }
    }
  }

  if (settings.selectedVae && settings.selectedVae !== '__embedded__') {
    if (!setNodeVae(workflow, 'Load VAE', settings.selectedVae)) {
      return { error: 'Workflow node not found: Load VAE' }
    }
  }

  // Get effective model settings (includes scheduler)
  const effectiveModel = getEffectiveModelSettings(settings, promptsData.selectedCheckpoint)
  const scheduler = effectiveModel?.scheduler || 'simple'

  if (isInpainting) {
    // Inpainting workflow configuration (title-based)
    if (
      !setNodeSampler(workflow, 'KSampler (inpainting)', {
        steps: settings.steps,
        cfg: settings.cfgScale,
        sampler_name: settings.sampler,
        scheduler,
        denoise: inpaintDenoiseStrength
      })
    ) {
      return { error: 'Workflow node not found: KSampler (inpainting)' }
    }

    // For inpainting, image size is determined by input image, not by EmptyLatentImage
  } else {
    // Regular workflow configuration
    // Apply settings values to workflow
    if (!setNodeSampler(workflow, 'BasicScheduler', { steps: settings.steps, scheduler })) {
      return { error: 'Workflow node not found: BasicScheduler' }
    }
    if (!setNodeSampler(workflow, 'SamplerCustom', { cfg: settings.cfgScale })) {
      return { error: 'Workflow node not found: SamplerCustom' }
    }
    if (!setNodeSampler(workflow, 'KSamplerSelect', { sampler_name: settings.sampler })) {
      return { error: 'Workflow node not found: KSamplerSelect' }
    }
    if (
      !setNodeImageSize(workflow, 'Empty Latent Image', settings.imageWidth, settings.imageHeight)
    ) {
      return { error: 'Workflow node not found: Empty Latent Image' }
    }

    // Configure FaceDetailer scheduler (title-based)
    if (!setNodeSampler(workflow, 'FaceDetailer', { scheduler })) {
      return { error: 'Workflow node not found: FaceDetailer' }
    }

    // Configure optional features
    if (promptsData.useUpscale) {
      // Configure latent upscale workflow when upscale nodes exist
      {
        // Get upscale settings
        const effectiveModel = getEffectiveModelSettings(settings, promptsData.selectedCheckpoint)
        const upscaleSettings = effectiveModel?.upscale || DEFAULT_UPSCALE_SETTINGS

        // Validate upscale checkpoint is configured
        if (!upscaleSettings.checkpoint || upscaleSettings.checkpoint === 'model.safetensors') {
          return { error: 'Upscale checkpoint not configured in model settings' }
        }

        // Configure Upscale Image dimensions (use scale from settings)
        const upscaleImage = findNodeByTitle(workflow, 'Upscale Image')?.nodeId
        if (upscaleImage && workflow[upscaleImage]) {
          workflow[upscaleImage].inputs.width = Math.round(
            settings.imageWidth * upscaleSettings.scale
          )
          workflow[upscaleImage].inputs.height = Math.round(
            settings.imageHeight * upscaleSettings.scale
          )
        }

        // Configure upscale checkpoint
        if (!setNodeCheckpoint(workflow, 'Upscale Checkpoint Loader', upscaleSettings.checkpoint)) {
          return { error: 'Workflow node not found: Upscale Checkpoint Loader' }
        }

        // Configure upscale VAE nodes
        const vaeEncodeNode = findNodeByTitle(workflow, 'VAE Encode (Tiled)')
        if (!vaeEncodeNode) {
          return { error: 'Workflow node not found: VAE Encode (Tiled)' }
        }

        const vaeDecodeNode = findNodeByTitle(workflow, 'VAE Decode (Tiled)')
        if (!vaeDecodeNode) {
          return { error: 'Workflow node not found: VAE Decode (Tiled)' }
        }

        // Determine VAE source and connect to both encode and decode nodes
        let vaeSourceNodeId: string
        let vaeSourceOutputIndex: number

        if (upscaleSettings.selectedVae && upscaleSettings.selectedVae !== '__embedded__') {
          // Use external VAE loader
          if (!setNodeVae(workflow, 'Load VAE (Upscale)', upscaleSettings.selectedVae)) {
            return { error: 'Workflow node not found: Load VAE (Upscale)' }
          }
          const vaeLoaderNode = findNodeByTitle(workflow, 'Load VAE (Upscale)')
          if (!vaeLoaderNode) {
            return { error: 'Workflow node not found: Load VAE (Upscale)' }
          }
          vaeSourceNodeId = vaeLoaderNode.nodeId
          vaeSourceOutputIndex = 0
        } else {
          // Use embedded VAE from checkpoint
          const upscaleCkptNode = findNodeByTitle(workflow, 'Upscale Checkpoint Loader')
          if (!upscaleCkptNode) {
            return { error: 'Workflow node not found: Upscale Checkpoint Loader' }
          }
          vaeSourceNodeId = upscaleCkptNode.nodeId
          vaeSourceOutputIndex = 2
        }

        // Connect VAE to both encode and decode nodes
        workflow[vaeEncodeNode.nodeId].inputs.vae = [vaeSourceNodeId, vaeSourceOutputIndex]
        workflow[vaeDecodeNode.nodeId].inputs.vae = [vaeSourceNodeId, vaeSourceOutputIndex]

        // Configure upscale KSampler
        if (
          !setNodeSampler(workflow, 'KSampler (Upscale)', {
            steps: upscaleSettings.steps,
            cfg: upscaleSettings.cfgScale,
            sampler_name: upscaleSettings.sampler,
            scheduler: upscaleSettings.scheduler,
            denoise: upscaleSettings.denoise
          })
        ) {
          return { error: 'Workflow node not found: KSampler (Upscale)' }
        }

        // Connect KSampler output to VAE Decode
        const upscaleSampler = findNodeByTitle(workflow, 'KSampler (Upscale)')?.nodeId
        if (upscaleSampler && workflow[vaeDecodeNode.nodeId]) {
          workflow[vaeDecodeNode.nodeId].inputs.samples = [upscaleSampler, 0]
        }
      }
    }

    if (promptsData.useFaceDetailer) {
      // Configure FaceDetailer with per-model settings
      const effectiveModel = getEffectiveModelSettings(settings, promptsData.selectedCheckpoint)
      const faceDetailerSettings = effectiveModel?.faceDetailer || DEFAULT_FACE_DETAILER_SETTINGS

      // Validate FaceDetailer checkpoint is configured
      if (
        !faceDetailerSettings.checkpoint ||
        faceDetailerSettings.checkpoint === 'model.safetensors'
      ) {
        return { error: 'FaceDetailer checkpoint not configured in model settings' }
      }

      // Set FaceDetailer checkpoint model
      if (
        !setNodeCheckpoint(workflow, 'FaceDetailer Checkpoint Loader', faceDetailerSettings.checkpoint)
      ) {
        return { error: 'Workflow node not found: FaceDetailer Checkpoint Loader' }
      }

      // Configure FaceDetailer generation settings
      if (
        !setNodeSampler(workflow, 'FaceDetailer', {
          steps: faceDetailerSettings.steps,
          cfg: faceDetailerSettings.cfgScale,
          sampler_name: faceDetailerSettings.sampler,
          scheduler: faceDetailerSettings.scheduler,
          denoise: faceDetailerSettings.denoise
        })
      ) {
        return { error: 'Workflow node not found: FaceDetailer' }
      }

      // Configure VAE
      const fdNodeEntry = findNodeByTitle(workflow, 'FaceDetailer')
      const fdNodeId = fdNodeEntry?.nodeId
      if (faceDetailerSettings.selectedVae === '__embedded__') {
        const fdCkpt = findNodeByTitle(workflow, 'FaceDetailer Checkpoint Loader')?.nodeId
        if (fdCkpt && fdNodeId && workflow[fdNodeId]) {
          workflow[fdNodeId].inputs.vae = [fdCkpt, 2]
        }
      } else {
        const desiredVae = faceDetailerSettings.selectedVae
        const fdVaeNode = findNodeByTitle(workflow, 'Load VAE (FaceDetailer)')
        if (!fdNodeId || !fdVaeNode) {
          return { error: 'Workflow node not found: Load VAE (FaceDetailer)' }
        }
        workflow[fdVaeNode.nodeId].inputs.vae_name = desiredVae
        workflow[fdNodeId].inputs.vae = [fdVaeNode.nodeId, 0]
      }

      // Set FaceDetailer input image based on upscale usage
      if (fdNodeId && workflow[fdNodeId]) {
        const upDecode = findNodeByTitle(workflow, 'VAE Decode (Tiled)')?.nodeId
        const baseDecode = findNodeByTitle(workflow, 'VAE Decode')?.nodeId
        if (promptsData.useUpscale && upDecode) {
          workflow[fdNodeId].inputs.image = [upDecode, 0]
        } else if (!promptsData.useUpscale && baseDecode) {
          workflow[fdNodeId].inputs.image = [baseDecode, 0]
        }
      }
    }
  }

  return null
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
): { error: string } | null {
  if (isInpainting) {
    // Inpainting workflow - check if FaceDetailer should be used
    let imageSourceNodeId: string
    if (promptsData.useFaceDetailer) {
      // Use FaceDetailer output
      const faceDetailerNode = findNodeByTitle(workflow, 'FaceDetailer')
      if (!faceDetailerNode) {
        return { error: 'Workflow node not found: FaceDetailer' }
      }
      imageSourceNodeId = faceDetailerNode.nodeId
    } else {
      // Use VAE Decode output directly from LatentCompositeMasked path
      if (promptsData.useUpscale) {
        const vaeDecode = findNodeByTitle(workflow, 'VAE Decode (Tiled)')
        if (!vaeDecode) {
          return { error: 'Workflow node not found: VAE Decode (Tiled)' }
        }
        imageSourceNodeId = vaeDecode.nodeId
      } else {
        const vaeDecode = findNodeByTitle(workflow, 'VAE Decode')
        if (!vaeDecode) {
          return { error: 'Workflow node not found: VAE Decode' }
        }
        imageSourceNodeId = vaeDecode.nodeId
      }
    }

    workflow[FINAL_SAVE_NODE_ID] = {
      inputs: { images: [imageSourceNodeId, 0] },
      class_type: 'SaveImageWebsocket',
      _meta: { title: 'Final Save Image Websocket' }
    }
    return null
  }

  // Determine which node to use as image source based on upscale and face detailer settings
  let imageSourceNodeId: string

  if (promptsData.useUpscale) {
    if (promptsData.useFaceDetailer) {
      const faceDetailerNode = findNodeByTitle(workflow, 'FaceDetailer')
      if (!faceDetailerNode) {
        return { error: 'Workflow node not found: FaceDetailer' }
      }
      imageSourceNodeId = faceDetailerNode.nodeId
    } else {
      const vaeDecode = findNodeByTitle(workflow, 'VAE Decode (Tiled)')
      if (!vaeDecode) {
        return { error: 'Workflow node not found: VAE Decode (Tiled)' }
      }
      imageSourceNodeId = vaeDecode.nodeId
    }
  } else {
    if (promptsData.useFaceDetailer) {
      const faceDetailerNode = findNodeByTitle(workflow, 'FaceDetailer')
      if (!faceDetailerNode) {
        return { error: 'Workflow node not found: FaceDetailer' }
      }
      imageSourceNodeId = faceDetailerNode.nodeId
    } else {
      const vaeDecode = findNodeByTitle(workflow, 'VAE Decode')
      if (!vaeDecode) {
        return { error: 'Workflow node not found: VAE Decode' }
      }
      imageSourceNodeId = vaeDecode.nodeId
    }
  }

  // Add the single, dynamically configured SaveImageWebsocket node
  workflow[FINAL_SAVE_NODE_ID] = {
    inputs: { images: [imageSourceNodeId, 0] }, // Assuming output index 0
    class_type: 'SaveImageWebsocket',
    _meta: { title: 'Final Save Image Websocket' }
  }

  return null
}

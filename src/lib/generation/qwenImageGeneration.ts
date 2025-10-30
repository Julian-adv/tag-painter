// Qwen-specific image generation utility functions
//
// This module handles Qwen model image generation workflows

import { qwenWorkflowPrompt } from './qwenWorkflow'
import { FINAL_SAVE_NODE_ID } from './workflow'
import {
  findNodeByTitle,
  setNodeTextInput,
  setNodeSampler,
  setNodeImageSize,
  setNodeVae,
  loadCustomWorkflow,
  findMissingNodeTitles
} from './workflowMapping'
import { DEFAULT_FACE_DETAILER_SETTINGS, DEFAULT_UPSCALE_SETTINGS } from '$lib/constants'
import {
  expandCustomTags,
  detectCompositionFromTags,
  cleanDirectivesFromTags,
  prefetchWildcardFilesFromTexts
} from '../utils/tagExpansion'
import { getWildcardModel } from '../stores/tagsStore'
import { readWildcardZones } from '../utils/wildcardZones'
import { updateComposition } from '../stores/promptsStore'
import {
  generateClientId,
  getEffectiveLoras,
  applyPerModelOverrides,
  submitToComfyUI
} from './generationCommon'
import type { ComfyUIWorkflow, ModelSettings } from '$lib/types'
import type { GenerationOptions } from './imageGeneration'

function applyQwenLoraChain(
  workflow: ComfyUIWorkflow,
  loras: { name: string; weight: number }[]
): string | null {
  const baseUnetNode = findNodeByTitle(workflow, 'Load Qwen UNet')
  if (!baseUnetNode) {
    return 'Missing required node: "Load Qwen UNet"'
  }
  const baseUnet = baseUnetNode.nodeId

  const modelSamplingNode = findNodeByTitle(workflow, 'Model Sampling Aura Flow')
  if (!modelSamplingNode) {
    return 'Missing required node: "Model Sampling Aura Flow"'
  }
  const modelSampling = modelSamplingNode.nodeId

  const mainSamplerNode = findNodeByTitle(workflow, 'KSampler')
  if (!mainSamplerNode) {
    return 'Missing required node: "KSampler"'
  }
  const mainSampler = mainSamplerNode.nodeId

  if (!Array.isArray(loras) || loras.length === 0) {
    if (workflow[modelSampling]) {
      workflow[modelSampling].inputs.model = [baseUnet, 0]
    }
    if (workflow[mainSampler]) {
      workflow[mainSampler].inputs.model = [modelSampling, 0]
    }
    return null
  }

  let previousNodeId = baseUnet

  loras.forEach((lora, index) => {
    const nodeId = (200 + index).toString()
    workflow[nodeId] = {
      inputs: {
        model: [previousNodeId, 0],
        lora_name: lora.name,
        strength_model: lora.weight
      },
      class_type: 'LoraLoaderModelOnly',
      _meta: {
        title: `Load Qwen LoRA ${index + 1}`
      }
    }

    previousNodeId = nodeId
  })

  if (workflow[modelSampling]) {
    workflow[modelSampling].inputs.model = [previousNodeId, 0]
  }
  if (workflow[mainSampler]) {
    workflow[mainSampler].inputs.model = [modelSampling, 0]
  }

  return null
}

export async function generateQwenImage(
  options: GenerationOptions,
  modelSettings: ModelSettings | null
): Promise<{
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
    previousRandomTagResolutions,
    onLoadingChange,
    onProgressUpdate,
    onImageReceived,
    wildcardOverrides
  } = options

  // Load custom workflow if specified, otherwise use default Qwen workflow
  let workflow: ComfyUIWorkflow
  const customWorkflowPath = modelSettings?.customWorkflowPath
  if (customWorkflowPath) {
    try {
      workflow = await loadCustomWorkflow(customWorkflowPath)
      console.log('Loaded custom Qwen workflow from:', customWorkflowPath)
    } catch (error) {
      console.error('Failed to load custom workflow, using default Qwen workflow:', error)
      workflow = JSON.parse(JSON.stringify(qwenWorkflowPrompt))
    }
  } else {
    workflow = JSON.parse(JSON.stringify(qwenWorkflowPrompt))
  }

  try {
    onLoadingChange(true)
    onProgressUpdate({ value: 0, max: 100, currentNode: '' })

    const clientId = generateClientId()

    // Read wildcard zones for Qwen model
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
    if (wildcardOverrides) {
      if (wildcardOverrides.all !== null) {
        wildcardZones.all = wildcardOverrides.all
      }
      if (wildcardOverrides.zone1 !== null) {
        wildcardZones.zone1 = wildcardOverrides.zone1
      }
      if (wildcardOverrides.zone2 !== null) {
        wildcardZones.zone2 = wildcardOverrides.zone2
      }
      if (wildcardOverrides.negative !== null) {
        wildcardZones.negative = wildcardOverrides.negative
      }
      if (wildcardOverrides.inpainting !== null) {
        wildcardZones.inpainting = wildcardOverrides.inpainting
      }
    }

    const model = getWildcardModel()

    const previousAll = previousRandomTagResolutions?.all || {}
    const previousZone1 = previousRandomTagResolutions?.zone1 || {}
    const previousZone2 = previousRandomTagResolutions?.zone2 || {}
    const previousNegative = previousRandomTagResolutions?.negative || {}

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

    // Detect composition from expanded 'all' tags and propagate to store/UI
    const detectedComposition = detectCompositionFromTags([allResult.expandedText])
    if (detectedComposition) {
      console.log(`Auto-selecting composition: ${detectedComposition}`)
      updateComposition(detectedComposition)
      // Keep promptsData in sync for this generation
      promptsData.selectedComposition = detectedComposition
    }

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

    let allTagsText = cleanDirectivesFromTags(allResult.expandedText)
    let zone1TagsText = cleanDirectivesFromTags(zone1Result.expandedText)
    let zone2TagsText = cleanDirectivesFromTags(zone2Result.expandedText)
    let negativeTagsText = cleanDirectivesFromTags(negativeResult.expandedText)

    // Track disabled zones for UI feedback (zones already filtered during expansion)
    const disabledZones = new Set<string>(sharedDisabledContext.names)

    // Apply composition-based zone filtering
    const isAll = promptsData.selectedComposition === 'all'
    if (isAll) {
      zone2TagsText = '' // Disable zone2 for 'all' composition
      disabledZones.add('zone2')
    }

    const qualityPrefix = modelSettings?.qualityPrefix ?? ''
    if (qualityPrefix.trim().length > 0) {
      allTagsText = [qualityPrefix.trim(), allTagsText].filter((p) => p && p.length > 0).join(', ')
    }

    const negativePrefix = modelSettings?.negativePrefix ?? ''
    if (negativePrefix.trim().length > 0) {
      negativeTagsText = [negativePrefix.trim(), negativeTagsText]
        .filter((p) => p && p.length > 0)
        .join(', ')
    }

    const allRandomResolutions = {
      all: { ...allResult.randomTagResolutions },
      zone1: { ...zone1Result.randomTagResolutions },
      zone2: { ...zone2Result.randomTagResolutions },
      negative: { ...negativeResult.randomTagResolutions },
      inpainting: {}
    }

    const appliedSettings = applyPerModelOverrides(settings, promptsData.selectedCheckpoint)
    const scheduler = modelSettings?.scheduler || 'simple'

    const effectiveLoras = getEffectiveLoras(
      settings,
      promptsData.selectedCheckpoint,
      promptsData.selectedLoras
    )
    const loraError = applyQwenLoraChain(workflow, effectiveLoras)
    if (loraError) {
      return { error: loraError }
    }

    // Main sampler settings
    if (
      !setNodeSampler(workflow, 'KSampler', {
        steps: appliedSettings.steps,
        cfg: appliedSettings.cfgScale,
        sampler_name: appliedSettings.sampler,
        scheduler
      })
    ) {
      return { error: 'Missing required node: "KSampler"' }
    }

    // Canvas size
    if (
      !setNodeImageSize(
        workflow,
        'Empty Latent Image',
        appliedSettings.imageWidth,
        appliedSettings.imageHeight
      )
    ) {
      return { error: 'Missing required node: "Empty Latent Image"' }
    }

    // Model Sampling
    const modelSamplingNode = findNodeByTitle(workflow, 'Model Sampling Aura Flow')
    if (!modelSamplingNode) {
      return { error: 'Missing required node: "Model Sampling Aura Flow"' }
    }

    // UNet checkpoint (Qwen)
    if (promptsData.selectedCheckpoint) {
      const unetNode = findNodeByTitle(workflow, 'Load Qwen UNet')
      if (!unetNode) {
        return { error: 'Missing required node: "Load Qwen UNet"' }
      }
      workflow[unetNode.nodeId].inputs.unet_name = promptsData.selectedCheckpoint
    }

    // VAE selection (use explicit selection or keep existing/default)
    const vaeNode = findNodeByTitle(workflow, 'Load Qwen VAE')
    if (!vaeNode) {
      return { error: 'Missing required node: "Load Qwen VAE"' }
    }
    const vaeDefaultFromWorkflow =
      typeof workflow[vaeNode.nodeId].inputs.vae_name === 'string'
        ? (workflow[vaeNode.nodeId].inputs.vae_name as string)
        : 'qwen_image_vae.safetensors'

    const vaeName =
      appliedSettings.selectedVae && appliedSettings.selectedVae !== '__embedded__'
        ? appliedSettings.selectedVae
        : vaeDefaultFromWorkflow

    if (!setNodeVae(workflow, 'Load Qwen VAE', vaeName)) {
      return { error: 'Missing required node: "Load Qwen VAE"' }
    }

    // Combine all enabled zones for Qwen's single prompt input
    const combinedPrompt = [allTagsText, zone1TagsText, zone2TagsText]
      .filter((text) => text && text.trim().length > 0)
      .join(' BREAK ')

    if (!setNodeTextInput(workflow, 'CLIP Text Encode (Positive)', combinedPrompt)) {
      return { error: 'Missing required node: "CLIP Text Encode (Positive)"' }
    }
    if (!setNodeTextInput(workflow, 'CLIP Text Encode (Negative)', negativeTagsText)) {
      return { error: 'Missing required node: "CLIP Text Encode (Negative)"' }
    }

    const appliedSeed = seed ?? Math.floor(Math.random() * 1000000000000000)
    if (
      !setNodeSampler(workflow, 'KSampler', {
        seed: appliedSeed,
        steps: appliedSettings.steps,
        cfg: appliedSettings.cfgScale,
        sampler_name: appliedSettings.sampler,
        scheduler
      })
    ) {
      return { error: 'Missing required node: "KSampler"' }
    }

    // Configure FaceDetailer if enabled
    if (promptsData.useFaceDetailer) {
      const fdNode = findNodeByTitle(workflow, 'FaceDetailer')
      if (!fdNode) {
        return { error: 'Missing required node: "FaceDetailer"' }
      }

      const faceDetailerSettings = modelSettings?.faceDetailer || DEFAULT_FACE_DETAILER_SETTINGS
      const fdModelType = faceDetailerSettings.modelType || 'sdxl'

      if (fdModelType === 'qwen') {
        const resolvedFdUnet =
          faceDetailerSettings.checkpoint &&
          faceDetailerSettings.checkpoint !== 'model.safetensors'
            ? faceDetailerSettings.checkpoint
            : promptsData.selectedCheckpoint || 'qwen_image_fp8_e4m3fn.safetensors'

        const fdUnet = findNodeByTitle(workflow, 'FaceDetailer UNet Loader (Qwen)')
        if (!fdUnet) {
          return { error: 'Missing required node: "FaceDetailer UNet Loader (Qwen)"' }
        }
        workflow[fdUnet.nodeId].inputs.unet_name = resolvedFdUnet

        const fdModelSampling = findNodeByTitle(
          workflow,
          'FaceDetailer Model Sampling Aura Flow (Qwen)'
        )
        if (!fdModelSampling) {
          return { error: 'Missing required node: "FaceDetailer Model Sampling Aura Flow (Qwen)"' }
        }

        const fdClipLoader = findNodeByTitle(workflow, 'FaceDetailer CLIP Loader (Qwen)')
        if (!fdClipLoader) {
          return { error: 'Missing required node: "FaceDetailer CLIP Loader (Qwen)"' }
        }

        workflow[fdNode.nodeId].inputs.model = [fdModelSampling.nodeId, 0]
        workflow[fdNode.nodeId].inputs.clip = [fdClipLoader.nodeId, 0]

        const fdVaeLoaderQwen = findNodeByTitle(workflow, 'FaceDetailer VAE Loader (Qwen)')
        if (!fdVaeLoaderQwen) {
          return { error: 'Missing required node: "FaceDetailer VAE Loader (Qwen)"' }
        }
        const fdVaeName = faceDetailerSettings.selectedVae || 'qwen_image_vae.safetensors'
        workflow[fdNode.nodeId].inputs.vae = [fdVaeLoaderQwen.nodeId, 0]
        workflow[fdVaeLoaderQwen.nodeId].inputs.vae_name = fdVaeName

        const fdPos = findNodeByTitle(workflow, 'FaceDetailer CLIP Text Encode (Positive)')
        if (!fdPos) {
          return { error: 'Missing required node: "FaceDetailer CLIP Text Encode (Positive)"' }
        }
        workflow[fdPos.nodeId].inputs.clip = [fdClipLoader.nodeId, 0]
        workflow[fdPos.nodeId].inputs.text = combinedPrompt

        const fdNeg = findNodeByTitle(workflow, 'FaceDetailer CLIP Text Encode (Negative)')
        if (!fdNeg) {
          return { error: 'Missing required node: "FaceDetailer CLIP Text Encode (Negative)"' }
        }
        workflow[fdNeg.nodeId].inputs.clip = [fdClipLoader.nodeId, 0]
        workflow[fdNeg.nodeId].inputs.text = negativeTagsText
      } else {
        // SDXL FaceDetailer
        const resolvedFdCkpt =
          faceDetailerSettings.checkpoint &&
          faceDetailerSettings.checkpoint !== 'model.safetensors'
            ? faceDetailerSettings.checkpoint
            : promptsData.selectedCheckpoint || faceDetailerSettings.checkpoint

        const fdCkpt = findNodeByTitle(workflow, 'FaceDetailer Checkpoint Loader (SDXL)')
        if (!fdCkpt) {
          return { error: 'Missing required node: "FaceDetailer Checkpoint Loader (SDXL)"' }
        }
        workflow[fdCkpt.nodeId].inputs.ckpt_name = resolvedFdCkpt

        workflow[fdNode.nodeId].inputs.model = [fdCkpt.nodeId, 0]
        workflow[fdNode.nodeId].inputs.clip = [fdCkpt.nodeId, 1]

        if (faceDetailerSettings.selectedVae === '__embedded__') {
          workflow[fdNode.nodeId].inputs.vae = [fdCkpt.nodeId, 2]
        } else {
          const fdVaeLoader = findNodeByTitle(workflow, 'FaceDetailer VAE Loader (SDXL)')
          if (!fdVaeLoader) {
            return { error: 'Missing required node: "FaceDetailer VAE Loader (SDXL)"' }
          }
          workflow[fdNode.nodeId].inputs.vae = [fdVaeLoader.nodeId, 0]
          const fdVaeName =
            faceDetailerSettings.selectedVae || 'fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors'
          workflow[fdVaeLoader.nodeId].inputs.vae_name = fdVaeName
        }

        const fdPos = findNodeByTitle(workflow, 'FaceDetailer CLIP Text Encode (Positive)')
        if (!fdPos) {
          return { error: 'Missing required node: "FaceDetailer CLIP Text Encode (Positive)"' }
        }
        workflow[fdPos.nodeId].inputs.clip = [fdCkpt.nodeId, 1]
        workflow[fdPos.nodeId].inputs.text = combinedPrompt

        const fdNeg = findNodeByTitle(workflow, 'FaceDetailer CLIP Text Encode (Negative)')
        if (!fdNeg) {
          return { error: 'Missing required node: "FaceDetailer CLIP Text Encode (Negative)"' }
        }
        workflow[fdNeg.nodeId].inputs.clip = [fdCkpt.nodeId, 1]
        workflow[fdNeg.nodeId].inputs.text = negativeTagsText
      }

      // Common FaceDetailer settings
      workflow[fdNode.nodeId].inputs.seed = appliedSeed + 1
      workflow[fdNode.nodeId].inputs.steps = faceDetailerSettings.steps
      workflow[fdNode.nodeId].inputs.cfg = faceDetailerSettings.cfgScale
      workflow[fdNode.nodeId].inputs.sampler_name = faceDetailerSettings.sampler
      workflow[fdNode.nodeId].inputs.scheduler = faceDetailerSettings.scheduler
      workflow[fdNode.nodeId].inputs.denoise = faceDetailerSettings.denoise

      // FD input image: upscale decode output or base decode output
      const upscaleDecode = findNodeByTitle(workflow, 'VAE Decode (Tiled)')?.nodeId
      const baseDecode = findNodeByTitle(workflow, 'VAE Decode')?.nodeId
      if (promptsData.useUpscale && upscaleDecode) {
        workflow[fdNode.nodeId].inputs.image = [upscaleDecode, 0]
      } else if (!promptsData.useUpscale && baseDecode) {
        workflow[fdNode.nodeId].inputs.image = [baseDecode, 0]
      }
    }

    // Configure upscale if enabled
    if (promptsData.useUpscale) {
      // Get upscale settings from per-model configuration
      const upscaleSettings = modelSettings?.upscale || DEFAULT_UPSCALE_SETTINGS
      const usModelType = upscaleSettings.modelType || 'sdxl'

      // Configure LatentUpscale dimensions (use scale from settings)
      const latentUpscale = findNodeByTitle(workflow, 'Upscale Image')
      if (!latentUpscale) {
        return { error: 'Missing required node: "Upscale Image"' }
      }
      workflow[latentUpscale.nodeId].inputs.width = Math.round(
        appliedSettings.imageWidth * upscaleSettings.scale
      )
      workflow[latentUpscale.nodeId].inputs.height = Math.round(
        appliedSettings.imageHeight * upscaleSettings.scale
      )

      const upscaleSampler = findNodeByTitle(workflow, 'KSampler (Upscale)')
      if (!upscaleSampler) {
        return { error: 'Missing required node: "KSampler (Upscale)"' }
      }

      if (usModelType === 'qwen') {
        // Configure Qwen upscale path
        const resolvedUsUnet =
          upscaleSettings.checkpoint && upscaleSettings.checkpoint !== 'model.safetensors'
            ? upscaleSettings.checkpoint
            : promptsData.selectedCheckpoint || 'qwen_image_fp8_e4m3fn.safetensors'

        // Check if upscale checkpoint is the same as the main checkpoint
        const isSameCheckpoint = resolvedUsUnet === promptsData.selectedCheckpoint

        if (isSameCheckpoint) {
          // Reuse base model nodes
          const baseModelSampling = findNodeByTitle(workflow, 'Model Sampling Aura Flow')
          if (!baseModelSampling) {
            return { error: 'Missing required node: "Model Sampling Aura Flow"' }
          }
          workflow[upscaleSampler.nodeId].inputs.model = [baseModelSampling.nodeId, 0]

          const basePos = findNodeByTitle(workflow, 'CLIP Text Encode (Positive)')
          if (!basePos) {
            return { error: 'Missing required node: "CLIP Text Encode (Positive)"' }
          }
          workflow[upscaleSampler.nodeId].inputs.positive = [basePos.nodeId, 0]

          const baseNeg = findNodeByTitle(workflow, 'CLIP Text Encode (Negative)')
          if (!baseNeg) {
            return { error: 'Missing required node: "CLIP Text Encode (Negative)"' }
          }
          workflow[upscaleSampler.nodeId].inputs.negative = [baseNeg.nodeId, 0]
        } else {
          // Use separate upscale model nodes
          const usUnet = findNodeByTitle(workflow, 'Upscale UNet Loader (Qwen)')
          if (!usUnet) {
            return { error: 'Missing required node: "Upscale UNet Loader (Qwen)"' }
          }
          workflow[usUnet.nodeId].inputs.unet_name = resolvedUsUnet

          const upscaleModelSampling = findNodeByTitle(
            workflow,
            'Upscale Model Sampling Aura Flow (Qwen)'
          )
          if (!upscaleModelSampling) {
            return { error: 'Missing required node: "Upscale Model Sampling Aura Flow (Qwen)"' }
          }
          workflow[upscaleSampler.nodeId].inputs.model = [upscaleModelSampling.nodeId, 0]

          const upscaleClipQwen = findNodeByTitle(workflow, 'Upscale CLIP Loader (Qwen)')
          if (!upscaleClipQwen) {
            return { error: 'Missing required node: "Upscale CLIP Loader (Qwen)"' }
          }

          const upscalePos = findNodeByTitle(workflow, 'Upscale CLIP Text Encode (Positive)')
          if (!upscalePos) {
            return { error: 'Missing required node: "Upscale CLIP Text Encode (Positive)"' }
          }
          workflow[upscalePos.nodeId].inputs.clip = [upscaleClipQwen.nodeId, 0]
          workflow[upscalePos.nodeId].inputs.text = combinedPrompt

          const upscaleNeg = findNodeByTitle(workflow, 'Upscale CLIP Text Encode (Negative)')
          if (!upscaleNeg) {
            return { error: 'Missing required node: "Upscale CLIP Text Encode (Negative)"' }
          }
          workflow[upscaleNeg.nodeId].inputs.clip = [upscaleClipQwen.nodeId, 0]
          workflow[upscaleNeg.nodeId].inputs.text = negativeTagsText
        }

        const upscaleVaeQwen = findNodeByTitle(workflow, 'Upscale VAE Loader (Qwen)')
        if (!upscaleVaeQwen) {
          return { error: 'Missing required node: "Upscale VAE Loader (Qwen)"' }
        }
        const usVaeName = upscaleSettings.selectedVae || 'qwen_image_vae.safetensors'
        workflow[upscaleVaeQwen.nodeId].inputs.vae_name = usVaeName

        const upscaleEncode = findNodeByTitle(workflow, 'VAE Encode (Tiled)')
        if (!upscaleEncode) {
          return { error: 'Missing required node: "VAE Encode (Tiled)"' }
        }
        workflow[upscaleEncode.nodeId].inputs.vae = [upscaleVaeQwen.nodeId, 0]

        const upscaleDecode = findNodeByTitle(workflow, 'VAE Decode (Tiled)')
        if (!upscaleDecode) {
          return { error: 'Missing required node: "VAE Decode (Tiled)"' }
        }
        workflow[upscaleDecode.nodeId].inputs.vae = [upscaleVaeQwen.nodeId, 0]
      } else {
        // Configure SDXL upscale path
        const resolvedUpscaleCkpt =
          upscaleSettings.checkpoint && upscaleSettings.checkpoint !== 'model.safetensors'
            ? upscaleSettings.checkpoint
            : promptsData.selectedCheckpoint || upscaleSettings.checkpoint

        const upCkpt = findNodeByTitle(workflow, 'Upscale Checkpoint Loader (SDXL)')
        if (!upCkpt) {
          return { error: 'Missing required node: "Upscale Checkpoint Loader (SDXL)"' }
        }
        workflow[upCkpt.nodeId].inputs.ckpt_name = resolvedUpscaleCkpt
        workflow[upscaleSampler.nodeId].inputs.model = [upCkpt.nodeId, 0]

        const upscaleEncode = findNodeByTitle(workflow, 'VAE Encode (Tiled)')
        if (!upscaleEncode) {
          return { error: 'Missing required node: "VAE Encode (Tiled)"' }
        }

        if (upscaleSettings.selectedVae === '__embedded__') {
          workflow[upscaleEncode.nodeId].inputs.vae = [upCkpt.nodeId, 2]
        } else {
          const upVae = findNodeByTitle(workflow, 'Upscale VAE Loader (SDXL)')
          if (!upVae) {
            return { error: 'Missing required node: "Upscale VAE Loader (SDXL)"' }
          }
          workflow[upscaleEncode.nodeId].inputs.vae = [upVae.nodeId, 0]
          const usVaeName =
            upscaleSettings.selectedVae || 'fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors'
          workflow[upVae.nodeId].inputs.vae_name = usVaeName
        }

        const upscaleDecode = findNodeByTitle(workflow, 'VAE Decode (Tiled)')
        if (!upscaleDecode) {
          return { error: 'Missing required node: "VAE Decode (Tiled)"' }
        }
        workflow[upscaleDecode.nodeId].inputs.vae = [upCkpt.nodeId, 2]

        const upscalePos = findNodeByTitle(workflow, 'Upscale CLIP Text Encode (Positive)')
        if (!upscalePos) {
          return { error: 'Missing required node: "Upscale CLIP Text Encode (Positive)"' }
        }
        workflow[upscalePos.nodeId].inputs.clip = [upCkpt.nodeId, 1]
        workflow[upscalePos.nodeId].inputs.text = combinedPrompt

        const upscaleNeg = findNodeByTitle(workflow, 'Upscale CLIP Text Encode (Negative)')
        if (!upscaleNeg) {
          return { error: 'Missing required node: "Upscale CLIP Text Encode (Negative)"' }
        }
        workflow[upscaleNeg.nodeId].inputs.clip = [upCkpt.nodeId, 1]
        workflow[upscaleNeg.nodeId].inputs.text = negativeTagsText
      }

      // Configure upscale KSampler (common for both model types)
      if (
        !setNodeSampler(workflow, 'KSampler (Upscale)', {
          steps: upscaleSettings.steps,
          cfg: upscaleSettings.cfgScale,
          sampler_name: upscaleSettings.sampler,
          scheduler: upscaleSettings.scheduler,
          denoise: upscaleSettings.denoise
        })
      ) {
        return { error: 'Missing required node: "KSampler (Upscale)"' }
      }
    }

    // Configure final save node based on upscale and FaceDetailer usage
    let imageSourceNodeId: string
    if (promptsData.useUpscale) {
      if (promptsData.useFaceDetailer) {
        imageSourceNodeId = findNodeByTitle(workflow, 'FaceDetailer')?.nodeId || '69'
      } else {
        imageSourceNodeId = findNodeByTitle(workflow, 'VAE Decode (Tiled)')?.nodeId || '126'
      }
    } else {
      imageSourceNodeId = promptsData.useFaceDetailer
        ? findNodeByTitle(workflow, 'FaceDetailer')?.nodeId || '69'
        : findNodeByTitle(workflow, 'VAE Decode')?.nodeId || '8'
    }

    workflow[FINAL_SAVE_NODE_ID] = {
      inputs: { images: [imageSourceNodeId, 0] },
      class_type: 'SaveImageWebsocket',
      _meta: { title: 'Final Save Image Websocket' }
    }

    console.log('workflow (qwen)', workflow)
    await submitToComfyUI(
      workflow,
      clientId,
      {
        all: allTagsText,
        zone1: zone1TagsText,
        zone2: zone2TagsText,
        negative: negativeTagsText,
        inpainting: ''
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
    console.error('Failed to generate Qwen image:', error)
    return {
      error: error instanceof Error ? error.message : 'Failed to generate image'
    }
  }
}

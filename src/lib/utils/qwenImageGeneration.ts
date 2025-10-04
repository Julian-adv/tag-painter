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
} from './tagExpansion'
import { getWildcardModel } from '../stores/tagsStore'
import { readWildcardZones } from './wildcardZones'
import { updateComposition } from '../stores/promptsStore'
import {
  generateClientId,
  getEffectiveLoras,
  applyPerModelOverrides,
  submitToComfyUI
} from './generationCommon'
import type { ComfyUIWorkflow, ModelSettings } from '$lib/types'
import type { GenerationOptions } from './imageGeneration'

function applyQwenLoraChain(workflow: ComfyUIWorkflow, loras: { name: string; weight: number }[]) {
  const baseUnet = findNodeByTitle(workflow, 'Load Qwen UNet')?.nodeId || '37'
  const modelSampling = findNodeByTitle(workflow, 'Model Sampling Aura Flow')?.nodeId || '66'
  const mainSampler = findNodeByTitle(workflow, 'KSampler')?.nodeId || '3'

  if (!Array.isArray(loras) || loras.length === 0) {
    if (workflow[modelSampling]) {
      workflow[modelSampling].inputs.model = [baseUnet, 0]
    }
    if (workflow[mainSampler]) {
      workflow[mainSampler].inputs.model = [modelSampling, 0]
    }
    return
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
    onImageReceived
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

    // Read wildcard zones for Qwen model (this also loads the Qwen wildcard model)
    const wildcardZones = await readWildcardZones('qwen')
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
    applyQwenLoraChain(workflow, effectiveLoras)

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
      const fdNodeId = findNodeByTitle(workflow, 'FaceDetailer')?.nodeId
      if (fdNodeId) {
        const faceDetailerSettings = modelSettings?.faceDetailer || DEFAULT_FACE_DETAILER_SETTINGS
        const fdModelType = faceDetailerSettings.modelType || 'sdxl'

        if (fdModelType === 'qwen') {
          const resolvedFdUnet =
            faceDetailerSettings.checkpoint &&
            faceDetailerSettings.checkpoint !== 'model.safetensors'
              ? faceDetailerSettings.checkpoint
              : promptsData.selectedCheckpoint || 'qwen_image_fp8_e4m3fn.safetensors'

          const fdUnet = findNodeByTitle(workflow, 'FaceDetailer UNet Loader (Qwen)')?.nodeId
          if (fdUnet && workflow[fdUnet]) workflow[fdUnet].inputs.unet_name = resolvedFdUnet

          const fdModelSampling = findNodeByTitle(
            workflow,
            'FaceDetailer Model Sampling Aura Flow (Qwen)'
          )?.nodeId
          const fdClipLoader = findNodeByTitle(workflow, 'FaceDetailer CLIP Loader (Qwen)')?.nodeId
          if (workflow[fdNodeId]) {
            if (fdModelSampling) workflow[fdNodeId].inputs.model = [fdModelSampling, 0]
            if (fdClipLoader) workflow[fdNodeId].inputs.clip = [fdClipLoader, 0]
          }

          const fdVaeLoaderQwen = findNodeByTitle(
            workflow,
            'FaceDetailer VAE Loader (Qwen)'
          )?.nodeId
          if (fdVaeLoaderQwen) {
            const fdVaeName = faceDetailerSettings.selectedVae || 'qwen_image_vae.safetensors'
            if (workflow[fdNodeId]) workflow[fdNodeId].inputs.vae = [fdVaeLoaderQwen, 0]
            if (workflow[fdVaeLoaderQwen]) workflow[fdVaeLoaderQwen].inputs.vae_name = fdVaeName
          }

          const fdPos = findNodeByTitle(
            workflow,
            'FaceDetailer CLIP Text Encode (Positive)'
          )?.nodeId
          const fdNeg = findNodeByTitle(
            workflow,
            'FaceDetailer CLIP Text Encode (Negative)'
          )?.nodeId
          if (fdPos && fdClipLoader && workflow[fdPos]) {
            workflow[fdPos].inputs.clip = [fdClipLoader, 0]
            workflow[fdPos].inputs.text = combinedPrompt
          }
          if (fdNeg && fdClipLoader && workflow[fdNeg]) {
            workflow[fdNeg].inputs.clip = [fdClipLoader, 0]
            workflow[fdNeg].inputs.text = negativeTagsText
          }
        } else {
          const resolvedFdCkpt =
            faceDetailerSettings.checkpoint &&
            faceDetailerSettings.checkpoint !== 'model.safetensors'
              ? faceDetailerSettings.checkpoint
              : promptsData.selectedCheckpoint || faceDetailerSettings.checkpoint
          const fdCkpt = findNodeByTitle(workflow, 'FaceDetailer Checkpoint Loader (SDXL)')?.nodeId
          if (fdCkpt && workflow[fdCkpt]) workflow[fdCkpt].inputs.ckpt_name = resolvedFdCkpt

          if (workflow[fdNodeId] && fdCkpt) {
            workflow[fdNodeId].inputs.model = [fdCkpt, 0]
            workflow[fdNodeId].inputs.clip = [fdCkpt, 1]
          }

          if (faceDetailerSettings.selectedVae === '__embedded__') {
            if (workflow[fdNodeId] && fdCkpt) workflow[fdNodeId].inputs.vae = [fdCkpt, 2]
          } else {
            const fdVaeLoader = findNodeByTitle(workflow, 'FaceDetailer VAE Loader (SDXL)')?.nodeId
            if (workflow[fdNodeId] && fdVaeLoader) workflow[fdNodeId].inputs.vae = [fdVaeLoader, 0]
            const fdVaeName =
              faceDetailerSettings.selectedVae || 'fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors'
            if (fdVaeLoader && workflow[fdVaeLoader])
              workflow[fdVaeLoader].inputs.vae_name = fdVaeName
          }

          const fdPos = findNodeByTitle(
            workflow,
            'FaceDetailer CLIP Text Encode (Positive)'
          )?.nodeId
          const fdNeg = findNodeByTitle(
            workflow,
            'FaceDetailer CLIP Text Encode (Negative)'
          )?.nodeId
          if (fdPos && fdCkpt && workflow[fdPos]) {
            workflow[fdPos].inputs.clip = [fdCkpt, 1]
            workflow[fdPos].inputs.text = combinedPrompt
          }
          if (fdNeg && fdCkpt && workflow[fdNeg]) {
            workflow[fdNeg].inputs.clip = [fdCkpt, 1]
            workflow[fdNeg].inputs.text = negativeTagsText
          }
        }

        // Common FaceDetailer settings
        if (workflow[fdNodeId]) {
          workflow[fdNodeId].inputs.seed = appliedSeed + 1
          workflow[fdNodeId].inputs.steps = faceDetailerSettings.steps
          workflow[fdNodeId].inputs.cfg = faceDetailerSettings.cfgScale
          workflow[fdNodeId].inputs.sampler_name = faceDetailerSettings.sampler
          workflow[fdNodeId].inputs.scheduler = faceDetailerSettings.scheduler
          workflow[fdNodeId].inputs.denoise = faceDetailerSettings.denoise
        }

        // FD input image: upscale decode output or base decode output
        const upscaleDecode = findNodeByTitle(workflow, 'Upscale VAE Decode')?.nodeId
        const baseDecode = findNodeByTitle(workflow, 'VAE Decode')?.nodeId
        if (workflow[fdNodeId]) {
          if (promptsData.useUpscale && upscaleDecode) {
            workflow[fdNodeId].inputs.image = [upscaleDecode, 0]
          } else if (!promptsData.useUpscale && baseDecode) {
            workflow[fdNodeId].inputs.image = [baseDecode, 0]
          }
        }
      }
    }

    // Configure upscale if enabled
    if (promptsData.useUpscale) {
      // Get upscale settings from per-model configuration
      const upscaleSettings = modelSettings?.upscale || DEFAULT_UPSCALE_SETTINGS
      const usModelType = upscaleSettings.modelType || 'sdxl'

      // Configure LatentUpscale dimensions (use scale from settings)
      const latentUpscaleId = findNodeByTitle(workflow, 'Latent Upscale')?.nodeId
      if (latentUpscaleId && workflow[latentUpscaleId]) {
        workflow[latentUpscaleId].inputs.width = Math.round(
          appliedSettings.imageWidth * upscaleSettings.scale
        )
        workflow[latentUpscaleId].inputs.height = Math.round(
          appliedSettings.imageHeight * upscaleSettings.scale
        )
      }

      if (usModelType === 'qwen') {
        // Configure Qwen upscale path
        const resolvedUsUnet =
          upscaleSettings.checkpoint && upscaleSettings.checkpoint !== 'model.safetensors'
            ? upscaleSettings.checkpoint
            : promptsData.selectedCheckpoint || 'qwen_image_fp8_e4m3fn.safetensors'

        const usUnet = findNodeByTitle(workflow, 'Upscale UNet Loader (Qwen)')?.nodeId
        if (usUnet && workflow[usUnet]) workflow[usUnet].inputs.unet_name = resolvedUsUnet

        // Set KSampler to use Qwen model sampling node
        const upscaleSampler = findNodeByTitle(workflow, 'KSampler (Upscale)')?.nodeId
        const upscaleModelSampling = findNodeByTitle(
          workflow,
          'Upscale Model Sampling Aura Flow (Qwen)'
        )?.nodeId
        if (upscaleSampler && upscaleModelSampling && workflow[upscaleSampler]) {
          workflow[upscaleSampler].inputs.model = [upscaleModelSampling, 0]
        }

        // Configure Upscale VAE for encoding
        const upscaleEncode = findNodeByTitle(workflow, 'SDXL VAE Encode')?.nodeId
        const upscaleVaeQwen = findNodeByTitle(workflow, 'Upscale VAE Loader (Qwen)')?.nodeId
        if (upscaleEncode && upscaleVaeQwen && workflow[upscaleEncode]) {
          workflow[upscaleEncode].inputs.vae = [upscaleVaeQwen, 0]
          const usVaeName = upscaleSettings.selectedVae || 'qwen_image_vae.safetensors'
          if (upscaleVaeQwen && workflow[upscaleVaeQwen])
            workflow[upscaleVaeQwen].inputs.vae_name = usVaeName
        }

        // Configure Upscale VAE for decoding - same loader
        const upscaleDecodeNode = findNodeByTitle(workflow, 'Upscale VAE Decode')?.nodeId
        if (upscaleDecodeNode && upscaleVaeQwen && workflow[upscaleDecodeNode]) {
          workflow[upscaleDecodeNode].inputs.vae = [upscaleVaeQwen, 0]
        }

        // Configure upscale text prompts with Qwen CLIP
        const upscalePos = findNodeByTitle(workflow, 'Upscale CLIP Text Encode (Positive)')?.nodeId
        const upscaleNeg = findNodeByTitle(workflow, 'Upscale CLIP Text Encode (Negative)')?.nodeId
        const upscaleClipQwen = findNodeByTitle(workflow, 'Upscale CLIP Loader (Qwen)')?.nodeId
        if (upscalePos && upscaleClipQwen && workflow[upscalePos]) {
          workflow[upscalePos].inputs.clip = [upscaleClipQwen, 0]
          workflow[upscalePos].inputs.text = combinedPrompt
        }
        if (upscaleNeg && upscaleClipQwen && workflow[upscaleNeg]) {
          workflow[upscaleNeg].inputs.clip = [upscaleClipQwen, 0]
          workflow[upscaleNeg].inputs.text = negativeTagsText
        }
      } else {
        // Configure SDXL upscale path
        const resolvedUpscaleCkpt =
          upscaleSettings.checkpoint && upscaleSettings.checkpoint !== 'model.safetensors'
            ? upscaleSettings.checkpoint
            : promptsData.selectedCheckpoint || upscaleSettings.checkpoint
        const upCkpt = findNodeByTitle(workflow, 'Upscale Checkpoint Loader (SDXL)')?.nodeId
        if (upCkpt && workflow[upCkpt]) workflow[upCkpt].inputs.ckpt_name = resolvedUpscaleCkpt

        // Set KSampler to use SDXL checkpoint
        const upscaleSampler = findNodeByTitle(workflow, 'KSampler (Upscale)')?.nodeId
        if (upscaleSampler && upCkpt && workflow[upscaleSampler]) {
          workflow[upscaleSampler].inputs.model = [upCkpt, 0]
        }

        // Configure VAE input for encode
        const upscaleEncode = findNodeByTitle(workflow, 'SDXL VAE Encode')?.nodeId
        if (upscaleEncode && upCkpt && workflow[upscaleEncode]) {
          if (upscaleSettings.selectedVae === '__embedded__') {
            workflow[upscaleEncode].inputs.vae = [upCkpt, 2]
          } else {
            const upVae = findNodeByTitle(workflow, 'Upscale VAE Loader (SDXL)')?.nodeId
            if (upVae) {
              workflow[upscaleEncode].inputs.vae = [upVae, 0]
              const usVaeName =
                upscaleSettings.selectedVae || 'fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors'
              if (workflow[upVae]) workflow[upVae].inputs.vae_name = usVaeName
            }
          }
        }

        // Configure Upscale VAE for decoding
        const upscaleDecodeNode = findNodeByTitle(workflow, 'Upscale VAE Decode')?.nodeId
        if (upscaleDecodeNode && upCkpt && workflow[upscaleDecodeNode]) {
          workflow[upscaleDecodeNode].inputs.vae = [upCkpt, 2]
        }

        // Configure upscale text prompts with SDXL CLIP
        const upscalePos = findNodeByTitle(workflow, 'Upscale CLIP Text Encode (Positive)')?.nodeId
        const upscaleNeg = findNodeByTitle(workflow, 'Upscale CLIP Text Encode (Negative)')?.nodeId
        if (upscalePos && upCkpt && workflow[upscalePos]) {
          workflow[upscalePos].inputs.clip = [upCkpt, 1]
          workflow[upscalePos].inputs.text = combinedPrompt
        }
        if (upscaleNeg && upCkpt && workflow[upscaleNeg]) {
          workflow[upscaleNeg].inputs.clip = [upCkpt, 1]
          workflow[upscaleNeg].inputs.text = negativeTagsText
        }
      }

      // Configure upscale KSampler (common for both model types)
      setNodeSampler(workflow, 'KSampler (Upscale)', {
        steps: upscaleSettings.steps,
        cfg: upscaleSettings.cfgScale,
        sampler_name: upscaleSettings.sampler,
        scheduler: upscaleSettings.scheduler,
        denoise: upscaleSettings.denoise
      })
    }

    // Configure final save node based on upscale and FaceDetailer usage
    let imageSourceNodeId: string
    if (promptsData.useUpscale) {
      if (promptsData.useFaceDetailer) {
        imageSourceNodeId = findNodeByTitle(workflow, 'FaceDetailer')?.nodeId || '69'
      } else {
        imageSourceNodeId = findNodeByTitle(workflow, 'Upscale VAE Decode')?.nodeId || '126'
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

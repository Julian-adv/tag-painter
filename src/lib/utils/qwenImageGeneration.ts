// Qwen-specific image generation utility functions
//
// This module handles Qwen model image generation workflows

import { qwenWorkflowPrompt } from './qwenWorkflow'
import { FINAL_SAVE_NODE_ID } from './workflow'
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
  const baseNodeId = '37'
  const samplerNodeId = '66'

  if (!Array.isArray(loras) || loras.length === 0) {
    if (workflow[samplerNodeId]) {
      workflow[samplerNodeId].inputs.model = [baseNodeId, 0]
    }
    workflow['3'].inputs.model = [samplerNodeId, 0]
    return
  }

  let previousNodeId = baseNodeId

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

  if (workflow[samplerNodeId]) {
    workflow[samplerNodeId].inputs.model = [previousNodeId, 0]
  }
  workflow['3'].inputs.model = [samplerNodeId, 0]
}

export async function generateQwenImage(
  options: GenerationOptions,
  modelSettings: ModelSettings | null
): Promise<{
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
    previousRandomTagResolutions,
    onLoadingChange,
    onProgressUpdate,
    onImageReceived,
    onError
  } = options

  const workflow = JSON.parse(JSON.stringify(qwenWorkflowPrompt))

  try {
    onLoadingChange(true)
    onProgressUpdate({ value: 0, max: 100, currentNode: '' })

    const clientId = generateClientId()
    const model = getWildcardModel()

    // Read wildcard zones for Qwen model
    const wildcardZones = await readWildcardZones('qwen')

    const previousAll = previousRandomTagResolutions?.all || {}
    const previousZone1 = previousRandomTagResolutions?.zone1 || {}
    const previousZone2 = previousRandomTagResolutions?.zone2 || {}
    const previousNegative = previousRandomTagResolutions?.negative || {}

    await prefetchWildcardFilesFromTexts([
      wildcardZones.all,
      wildcardZones.zone1,
      wildcardZones.zone2,
      wildcardZones.negative
    ])

    const prevTextsAll: string[] = Object.values(previousAll)
    const prevTextsZone1: string[] = Object.values(previousZone1)
    const prevTextsZone2: string[] = Object.values(previousZone2)
    const prevTextsNegative: string[] = Object.values(previousNegative)
    await prefetchWildcardFilesFromTexts([
      ...prevTextsAll,
      ...prevTextsZone1,
      ...prevTextsZone2,
      ...prevTextsNegative
    ])

    const allResult = expandCustomTags(wildcardZones.all, model, new Set(), {}, previousAll)

    // Detect composition from expanded 'all' tags and propagate to store/UI
    const detectedComposition = detectCompositionFromTags([allResult.expandedText])
    if (detectedComposition) {
      console.log(`Auto-selecting composition: ${detectedComposition}`)
      updateComposition(detectedComposition)
      // Keep promptsData in sync for this generation
      promptsData.selectedComposition = detectedComposition
    }

    const zone1Result = expandCustomTags(
      wildcardZones.zone1,
      model,
      new Set(),
      { ...allResult.randomTagResolutions },
      previousZone1
    )

    const zone2Result = expandCustomTags(
      wildcardZones.zone2,
      model,
      new Set(),
      { ...allResult.randomTagResolutions, ...zone1Result.randomTagResolutions },
      previousZone2
    )

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

    let allTagsText = cleanDirectivesFromTags(allResult.expandedText)
    let zone1TagsText = cleanDirectivesFromTags(zone1Result.expandedText)
    let zone2TagsText = cleanDirectivesFromTags(zone2Result.expandedText)
    let negativeTagsText = cleanDirectivesFromTags(negativeResult.expandedText)

    // Apply composition-based zone filtering
    const isAll = promptsData.selectedComposition === 'all'
    if (isAll) {
      zone2TagsText = '' // Disable zone2 for 'all' composition
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

    workflow['3'].inputs.steps = appliedSettings.steps
    workflow['3'].inputs.cfg = appliedSettings.cfgScale
    workflow['3'].inputs.sampler_name = appliedSettings.sampler
    workflow['3'].inputs.scheduler = scheduler

    if (workflow['70']) {
      workflow['70'].inputs.width = appliedSettings.imageWidth
      workflow['70'].inputs.height = appliedSettings.imageHeight
    }

    if (promptsData.selectedCheckpoint) {
      workflow['37'].inputs.unet_name = promptsData.selectedCheckpoint
    }

    const vaeName =
      appliedSettings.selectedVae && appliedSettings.selectedVae !== '__embedded__'
        ? appliedSettings.selectedVae
        : (workflow['39']?.inputs?.vae_name as string) || 'qwen_image_vae.safetensors'
    if (workflow['39']) {
      workflow['39'].inputs.vae_name = vaeName
    }

    // Combine all enabled zones for Qwen's single prompt input
    const combinedPrompt = [allTagsText, zone1TagsText, zone2TagsText]
      .filter(text => text && text.trim().length > 0)
      .join(' ')

    workflow['6'].inputs.text = combinedPrompt
    workflow['7'].inputs.text = negativeTagsText

    const appliedSeed = seed ?? Math.floor(Math.random() * 1000000000000000)
    workflow['3'].inputs.seed = appliedSeed

    // Configure FaceDetailer if enabled
    if (promptsData.useFaceDetailer && workflow['56']) {
      // Get FaceDetailer settings from per-model configuration
      const faceDetailerSettings = modelSettings?.faceDetailer || DEFAULT_FACE_DETAILER_SETTINGS

      // Set FaceDetailer checkpoint model
      if (workflow['71']) {
        workflow['71'].inputs.ckpt_name = faceDetailerSettings.checkpoint
      }

      // Configure FaceDetailer text prompts (use combined prompts as main generation)
      if (workflow['73']) {
        workflow['73'].inputs.text = combinedPrompt
      }
      if (workflow['74']) {
        workflow['74'].inputs.text = negativeTagsText
      }

      // Configure FaceDetailer generation settings
      workflow['56'].inputs.seed = appliedSeed + 1
      workflow['56'].inputs.steps = faceDetailerSettings.steps
      workflow['56'].inputs.cfg = faceDetailerSettings.cfgScale
      workflow['56'].inputs.sampler_name = faceDetailerSettings.sampler
      workflow['56'].inputs.scheduler = faceDetailerSettings.scheduler
      workflow['56'].inputs.denoise = faceDetailerSettings.denoise

      // Set FaceDetailer input image based on upscale usage
      if (promptsData.useUpscale) {
        // Use upscaled image from Node 126
        workflow['56'].inputs.image = ['126', 0]
      } else {
        // Use original Qwen image from Node 8
        workflow['56'].inputs.image = ['8', 0]
      }
    }

    // Configure upscale if enabled
    if (promptsData.useUpscale) {
      // Get upscale settings from per-model configuration
      const upscaleSettings = modelSettings?.upscale || DEFAULT_UPSCALE_SETTINGS

      // Configure SDXL VAE Encode (convert Qwen image to SDXL latent)
      // Node 120: VAEEncode uses Node 8 (Qwen VAEDecode) and Node 127 (SDXL VAE)

      // Configure LatentUpscale dimensions (use scale from settings)
      workflow['121'].inputs.width = Math.round(appliedSettings.imageWidth * upscaleSettings.scale)
      workflow['121'].inputs.height = Math.round(
        appliedSettings.imageHeight * upscaleSettings.scale
      )

      // Configure upscale checkpoint
      workflow['123'].inputs.ckpt_name = upscaleSettings.checkpoint

      // Configure Node 120 VAE input based on selectedVae setting
      if (upscaleSettings.selectedVae === '__embedded__') {
        // Use embedded VAE from checkpoint (Node 123)
        workflow['120'].inputs.vae = ['123', 2]
      } else {
        // Use separate VAE loader (Node 127)
        workflow['120'].inputs.vae = ['127', 0]

        // Configure upscale VAE name only when using separate VAE loader
        const upscaleVaeName =
          upscaleSettings.selectedVae || 'fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors'
        workflow['127'].inputs.vae_name = upscaleVaeName
      }

      // Configure upscale KSampler
      workflow['122'].inputs.steps = upscaleSettings.steps
      workflow['122'].inputs.cfg = upscaleSettings.cfgScale
      workflow['122'].inputs.sampler_name = upscaleSettings.sampler
      workflow['122'].inputs.scheduler = upscaleSettings.scheduler
      workflow['122'].inputs.denoise = upscaleSettings.denoise

      // Configure upscale text prompts
      workflow['124'].inputs.text = combinedPrompt // Positive prompt for upscale
      workflow['125'].inputs.text = negativeTagsText // Negative prompt for upscale
    }

    // Configure final save node based on upscale and FaceDetailer usage
    let imageSourceNodeId: string
    if (promptsData.useUpscale) {
      if (promptsData.useFaceDetailer) {
        // Upscale=true, FaceDetailer=true
        imageSourceNodeId = '56' // Output of FaceDetailer (receives upscaled image from Node 126)
      } else {
        // Upscale=true, FaceDetailer=false
        imageSourceNodeId = '126' // Output of upscale VAEDecode
      }
    } else {
      // Upscale=false
      imageSourceNodeId = promptsData.useFaceDetailer ? '56' : '8'
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
        onImageReceived,
        onError
      }
    )

    return { seed: appliedSeed, randomTagResolutions: allRandomResolutions }
  } catch (error) {
    console.error('Failed to generate Qwen image:', error)
    onError(error instanceof Error ? error.message : 'Failed to generate image')
    onLoadingChange(false)
    throw error
  }
}

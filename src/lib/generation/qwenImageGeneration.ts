// Qwen-specific image generation utility functions
//
// This module handles Qwen model image generation workflows

import { findNodeByTitle } from './workflowMapping'
import { buildQwenWorkflow } from './qwenWorkflowBuilder'
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
  applyPerModelOverrides,
  submitToComfyUI
} from './generationCommon'
import type { ComfyUIWorkflow, ModelSettings } from '$lib/types'
import type { GenerationOptions } from './imageGeneration'
import { applyQwenNunchakuLoraChain } from './qwenNunchakuLora'


export function applyQwenLoraChain(
  workflow: ComfyUIWorkflow,
  loras: { name: string; weight: number }[]
): string | null {
  const baseUnetNode = findNodeByTitle(workflow, 'Load Qwen UNet')
  if (!baseUnetNode) {
    const baseNunchakuNode = findNodeByTitle(workflow, 'Nunchaku Qwen-Image DiT Loader')
    if (baseNunchakuNode) {
      return applyQwenNunchakuLoraChain(workflow, loras)
    }
    return 'Missing required node: "Load Qwen UNet" or "Nunchaku Qwen-Image DiT Loader"'
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
    onImageReceived
  } = options

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

    // Combine all enabled zones for Qwen's single prompt input
    const combinedPrompt = [allTagsText, zone1TagsText, zone2TagsText]
      .filter((text) => text && text.trim().length > 0)
      .join(' BREAK ')

    const appliedSeed = seed ?? Math.floor(Math.random() * 1000000000000000)

    // Build workflow using centralized builder function
    const workflow = await buildQwenWorkflow(
      combinedPrompt,
      negativeTagsText,
      { ...settings, seed: appliedSeed },
      promptsData.selectedCheckpoint || 'qwen_image_fp8_e4m3fn.safetensors',
      promptsData.useUpscale || false,
      promptsData.useFaceDetailer || false,
      modelSettings
    )

    const appliedSettings = applyPerModelOverrides(settings, promptsData.selectedCheckpoint)

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

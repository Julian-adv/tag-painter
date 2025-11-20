// Image generation utility functions
//
// This module provides shared types and image generation for all models

import type {
  PromptsData,
  Settings,
  ProgressData,
  ComfyUIWorkflow,
  ModelSettings,
  GenerationMetadataPayload
} from '$lib/types'
import { RefineMode, FaceDetailerMode } from '$lib/types'
import { findNodeByTitle } from './workflowMapping'
import { buildWorkflow } from './universalWorkflowBuilder'
import {
  expandCustomTags,
  detectCompositionFromTags,
  cleanDirectivesFromTags,
  prefetchWildcardFilesFromTexts
} from '../utils/tagExpansion'
import { getWildcardModel } from '../stores/tagsStore'
import { readWildcardZones } from '../utils/wildcardZones'
import { updateComposition } from '../stores/promptsStore'
import { generateClientId, applyPerModelOverrides, submitToComfyUI } from './generationCommon'
import { attachLoraChainBetweenNodes } from './qwenNunchakuLora'

export { buildWorkflowForPrompts } from './workflowBuilder'

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

export function applyQwenLoraChain(
  workflow: ComfyUIWorkflow,
  loras: { name: string; weight: number }[]
): void {
  const baseUnetNode = findNodeByTitle(workflow, 'Load Qwen UNet')
  if (baseUnetNode) {
    attachLoraChainBetweenNodes(
      workflow,
      'Load Qwen UNet',
      0,
      'Model Sampling Aura Flow',
      'model',
      loras,
      'LoraLoaderModelOnly',
      'strength_model',
      200
    )
  } else {
    const baseNunchakuNode = findNodeByTitle(workflow, 'Nunchaku Qwen-Image DiT Loader')
    if (baseNunchakuNode) {
      attachLoraChainBetweenNodes(
        workflow,
        'Nunchaku Qwen-Image DiT Loader',
        0,
        'KSampler',
        'model',
        loras,
        'NunchakuQwenImageLoraLoader',
        'lora_strength',
        200
      )
    } else {
      throw new Error(
        'Workflow must contain either "Load Qwen UNet" or "Nunchaku Qwen-Image DiT Loader" node'
      )
    }
  }
}

export async function generateImage(
  options: GenerationOptions,
  modelSettings: ModelSettings | null,
  refineMode: RefineMode,
  faceDetailerMode: FaceDetailerMode,
  useFilmgrain: boolean
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
    maskFilePath,
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
    if (wildcardZones.directives?.disabledZones) {
      for (const zone of wildcardZones.directives.disabledZones) {
        if (zone) {
          sharedDisabledContext.names.add(zone)
        }
      }
    }
    const hasDisabledZone = (zoneName: string): boolean => {
      const normalizedZone = zoneName.trim().toLowerCase()
      for (const name of sharedDisabledContext.names) {
        if (typeof name === 'string' && name.trim().toLowerCase() === normalizedZone) {
          return true
        }
      }
      return false
    }

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
    const zone1Result = hasDisabledZone('zone1')
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
    const zone2Result = hasDisabledZone('zone2')
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
    const negativeResult = hasDisabledZone('negative')
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
    const disabledZones = sharedDisabledContext.names

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

    const appliedSeed = seed ?? Math.floor(Math.random() * 1000000000000000)

    // Build workflow using universal workflow builder
    const appliedSettings = applyPerModelOverrides(settings, promptsData.selectedCheckpoint)

    const clipSkipValue = appliedSettings.clipSkip ?? 0
    const checkpointName = promptsData.selectedCheckpoint || ''
    const metadataPayload: GenerationMetadataPayload | null = modelSettings
      ? {
          base: {
            steps: modelSettings.steps,
            sampler: modelSettings.sampler,
            scheduler: modelSettings.scheduler,
            cfgScale: modelSettings.cfgScale,
            seed: appliedSeed,
            width: appliedSettings.imageWidth,
            height: appliedSettings.imageHeight,
            model: checkpointName,
            clipSkip: clipSkipValue
          },
          upscale:
            refineMode === RefineMode.none
              ? null
              : {
                  steps: modelSettings.upscale.steps,
                  sampler: modelSettings.upscale.sampler,
                  scheduler: modelSettings.upscale.scheduler,
                  cfgScale: modelSettings.upscale.cfgScale,
                  model: modelSettings.upscale.checkpoint,
                  scale: modelSettings.upscale.scale,
                  denoise: modelSettings.upscale.denoise
                },
          faceDetailer:
            faceDetailerMode === FaceDetailerMode.none
              ? null
              : {
                  steps: modelSettings.faceDetailer.steps,
                  sampler: modelSettings.faceDetailer.sampler,
                  scheduler: modelSettings.faceDetailer.scheduler,
                  cfgScale: modelSettings.faceDetailer.cfgScale,
                  model: modelSettings.faceDetailer.checkpoint,
                  scale: 1,
                  denoise: modelSettings.faceDetailer.denoise
                }
        }
      : null

    const workflow = await buildWorkflow(
      allTagsText,
      zone1TagsText,
      zone2TagsText,
      negativeTagsText,
      appliedSettings,
      promptsData.selectedCheckpoint,
      refineMode,
      faceDetailerMode,
      useFilmgrain,
      modelSettings!,
      maskFilePath,
      appliedSeed,
      disabledZones
    )

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
      },
      modelSettings?.saveBaseImages ?? false,
      modelSettings?.upscale?.saveUpscaleImages ?? false,
      modelSettings?.loras ?? [],
      metadataPayload
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

// Qwen-specific image generation utility functions
//
// This module handles Qwen model image generation workflows

import { qwenWorkflowPrompt } from './qwenWorkflow'
import { FINAL_SAVE_NODE_ID } from './workflow'
import {
  expandCustomTags,
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
    const previousNegative = previousRandomTagResolutions?.negative || {}

    await prefetchWildcardFilesFromTexts([wildcardZones.all, wildcardZones.negative])

    const prevTextsAll: string[] = Object.values(previousAll)
    const prevTextsNegative: string[] = Object.values(previousNegative)
    await prefetchWildcardFilesFromTexts([...prevTextsAll, ...prevTextsNegative])

    const allResult = expandCustomTags(wildcardZones.all, model, new Set(), {}, previousAll)
    const negativeResult = expandCustomTags(
      wildcardZones.negative,
      model,
      new Set(),
      { ...allResult.randomTagResolutions },
      previousNegative
    )

    let allTagsText = cleanDirectivesFromTags(allResult.expandedText)
    let negativeTagsText = cleanDirectivesFromTags(negativeResult.expandedText)

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

    if (promptsData.selectedComposition !== 'all') {
      updateComposition('all')
      promptsData.selectedComposition = 'all'
    }

    const allRandomResolutions = {
      all: { ...allResult.randomTagResolutions },
      zone1: {},
      zone2: {},
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

    if (workflow['58']) {
      workflow['58'].inputs.width = appliedSettings.imageWidth
      workflow['58'].inputs.height = appliedSettings.imageHeight
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

    workflow['6'].inputs.text = allTagsText
    workflow['7'].inputs.text = negativeTagsText

    const appliedSeed = seed ?? Math.floor(Math.random() * 1000000000000000)
    workflow['3'].inputs.seed = appliedSeed

    workflow[FINAL_SAVE_NODE_ID] = {
      inputs: { images: ['8', 0] },
      class_type: 'SaveImageWebsocket',
      _meta: { title: 'Final Save Image Websocket' }
    }

    console.log('workflow (qwen)', workflow)
    await submitToComfyUI(
      workflow,
      clientId,
      {
        all: allTagsText,
        zone1: '',
        zone2: '',
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

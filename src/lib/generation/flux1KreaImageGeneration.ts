// Flux1 Krea-specific image generation utility functions
//
// Loads a Flux1 Krea workflow JSON from data/workflow/flux1_krea.api.workflow.json by default
// and applies Settings into the workflow using title-based node lookups.

import { FINAL_SAVE_NODE_ID } from './workflow'
import {
  expandCustomTags,
  detectCompositionFromTags,
  cleanDirectivesFromTags,
  prefetchWildcardFilesFromTexts
} from '../utils/tagExpansion'
import { getWildcardModel } from '../stores/tagsStore'
import { readWildcardZones } from '../utils/wildcardZones'
import {
  generateClientId,
  applyPerModelOverrides,
  submitToComfyUI
} from './generationCommon'
import type { ComfyUIWorkflow, ModelSettings } from '$lib/types'
import type { GenerationOptions } from './imageGeneration'
import {
  findNodeByTitle,
  setNodeTextInput,
  setNodeCheckpoint,
  setNodeSampler,
  setNodeImageSize,
  setNodeVae,
  loadCustomWorkflow
} from './workflowMapping'

async function loadFlux1KreaWorkflow(customPath: string | undefined): Promise<ComfyUIWorkflow> {
  // Try per-model custom workflow first
  if (customPath) {
    try {
      const wf = await loadCustomWorkflow(customPath)
      return wf
    } catch {
      // Fall through to default
    }
  }
  // Try bundled flux1_krea workflow in data/workflow
  try {
    const wf = await loadCustomWorkflow('flux1_krea.api.workflow.json')
    return wf
  } catch {
    // As a last resort, load the default SD workflow
    const { defaultWorkflowPrompt } = await import('./workflow')
    return JSON.parse(JSON.stringify(defaultWorkflowPrompt))
  }
}

export async function generateFlux1KreaImage(
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
    onLoadingChange,
    onProgressUpdate,
    onImageReceived
  } = options

  let workflow: ComfyUIWorkflow = await loadFlux1KreaWorkflow(modelSettings?.customWorkflowPath)

  try {
    onLoadingChange(true)
    onProgressUpdate({ value: 0, max: 100, currentNode: '' })

    const clientId = generateClientId()

    // Read wildcard zones for flux1_krea model
    const wildcardZones = await readWildcardZones('flux1_krea')
    const model = getWildcardModel()
    await prefetchWildcardFilesFromTexts(model)

    const sharedDisabledContext = { names: new Set<string>(), patterns: [] as string[] }

    const allResult = expandCustomTags(
      wildcardZones.all,
      model,
      new Set(),
      {},
      {},
      sharedDisabledContext
    )
    const detectedComposition = detectCompositionFromTags([allResult.expandedText])
    if (detectedComposition) {
      const { updateComposition } = await import('../stores/promptsStore')
      updateComposition(detectedComposition)
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
          {},
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
          {},
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
          {},
          sharedDisabledContext
        )

    let allTagsText = cleanDirectivesFromTags(allResult.expandedText)
    let zone1TagsText = cleanDirectivesFromTags(zone1Result.expandedText)
    let zone2TagsText = cleanDirectivesFromTags(zone2Result.expandedText)
    let negativeTagsText = cleanDirectivesFromTags(negativeResult.expandedText)

    // Track disabled zones for UI feedback
    const disabledZones = new Set<string>(sharedDisabledContext.names)

    // Apply composition-based zone filtering
    const isAll = promptsData.selectedComposition === 'all'
    if (isAll) {
      zone2TagsText = ''
      disabledZones.add('zone2')
    }

    const appliedSettings = applyPerModelOverrides(settings, promptsData.selectedCheckpoint)
    const scheduler = modelSettings?.scheduler || 'simple'

    // Apply quality/negative prefixes
    const qualityPrefix = modelSettings?.qualityPrefix || ''
    if (qualityPrefix.trim().length > 0) {
      allTagsText = [qualityPrefix.trim(), allTagsText].filter((p) => p && p.length > 0).join(', ')
    }
    const negativePrefix = modelSettings?.negativePrefix || ''
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

    // Configure size (Flux1 Krea uses EmptySD3LatentImage like Chroma)
    if (
      !setNodeImageSize(
        workflow,
        'EmptySD3LatentImage',
        appliedSettings.imageWidth,
        appliedSettings.imageHeight
      )
    ) {
      return {
        error: 'Could not find EmptySD3LatentImage node in workflow'
      }
    }

    // Configure main prompts
    const combinedPrompt = [allTagsText, zone1TagsText, zone2TagsText]
      .filter((t) => t && t.trim().length > 0)
      .join(', ')

    // Flux1 Krea uses CLIP Text Encode (Prompt) for positive
    if (!setNodeTextInput(workflow, 'CLIP Text Encode (Prompt)', combinedPrompt)) {
      return { error: 'Missing required node: "CLIP Text Encode (Prompt)"' }
    }

    // Flux1 Krea uses ConditioningZeroOut for negative (no text input needed)
    // The negative conditioning is handled by the ConditioningZeroOut node

    // Configure main sampler
    const mainSeed = seed ?? Math.floor(Math.random() * 1000000000000000)

    if (
      !setNodeSampler(workflow, 'KSampler', {
        seed: mainSeed,
        steps: appliedSettings.steps,
        cfg: appliedSettings.cfgScale,
        sampler_name: appliedSettings.sampler,
        scheduler: scheduler
      })
    ) {
      return { error: 'Missing required node: "KSampler"' }
    }

    // Configure main VAE
    if (appliedSettings.selectedVae) {
      const vaeToLoad =
        appliedSettings.selectedVae === '__embedded__'
          ? 'ae.safetensors' // Default Flux1 Krea VAE
          : appliedSettings.selectedVae

      if (!setNodeVae(workflow, 'Load VAE', vaeToLoad)) {
        return { error: 'Missing required node: "Load VAE"' }
      }
    }

    // Flux1 Krea UNET selection from selected checkpoint when provided
    if (promptsData.selectedCheckpoint) {
      const unetNode = findNodeByTitle(workflow, 'Load Diffusion Model')
      if (!unetNode) {
        return { error: 'Missing required node: "Load Diffusion Model"' }
      }
      workflow[unetNode.nodeId].inputs.unet_name = promptsData.selectedCheckpoint
    }

    // Upscale configuration (if enabled)
    if (promptsData.useUpscale && modelSettings?.upscale) {
      const upscaleSettings = modelSettings.upscale

      // Configure upscale checkpoint (SDXL)
      const upscaleCkpt = upscaleSettings.checkpoint
      if (upscaleCkpt && upscaleCkpt.length > 0) {
        if (!setNodeCheckpoint(workflow, 'Load Checkpoint', upscaleCkpt)) {
          return { error: 'Missing required node: "Load Checkpoint" for upscale' }
        }
      }

      // Configure upscale prompts (SDXL uses same prompts)
      const upscaleCheckpointNode = findNodeByTitle(workflow, 'Load Checkpoint')
      if (upscaleCheckpointNode) {
        const upscalePosNode = findNodeByTitle(workflow, 'CLIP Text Encode (Prompt)')
        if (upscalePosNode && upscalePosNode.nodeId === '61') {
          // Node 61 is the upscale positive prompt
          workflow[upscalePosNode.nodeId].inputs.text = combinedPrompt
        }

        const upscaleNegNode = findNodeByTitle(workflow, 'CLIP Text Encode (Prompt)')
        if (upscaleNegNode && upscaleNegNode.nodeId === '62') {
          // Node 62 is the upscale negative prompt
          workflow[upscaleNegNode.nodeId].inputs.text = negativeTagsText
        }
      }

      // Configure upscale KSampler (node 59)
      const upscaleSamplerNode = findNodeByTitle(workflow, 'KSampler')
      if (upscaleSamplerNode && upscaleSamplerNode.nodeId === '59') {
        workflow[upscaleSamplerNode.nodeId].inputs.seed = mainSeed + 1
        workflow[upscaleSamplerNode.nodeId].inputs.steps = upscaleSettings.steps
        workflow[upscaleSamplerNode.nodeId].inputs.cfg = upscaleSettings.cfgScale
        workflow[upscaleSamplerNode.nodeId].inputs.sampler_name = upscaleSettings.sampler
        workflow[upscaleSamplerNode.nodeId].inputs.scheduler = upscaleSettings.scheduler
        workflow[upscaleSamplerNode.nodeId].inputs.denoise = upscaleSettings.denoise
      }

      // Configure upscale VAE (node 58)
      const upscaleVaeNode = findNodeByTitle(workflow, 'Load VAE')
      if (upscaleVaeNode && upscaleVaeNode.nodeId === '58') {
        const upscaleVae =
          upscaleSettings.selectedVae === '__embedded__'
            ? 'fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors'
            : upscaleSettings.selectedVae
        workflow[upscaleVaeNode.nodeId].inputs.vae_name = upscaleVae
      }

      // Configure ImageScale dimensions based on scale factor
      const imageScaleNode = findNodeByTitle(workflow, 'Upscale Image')
      if (imageScaleNode) {
        workflow[imageScaleNode.nodeId].inputs.width = Math.round(
          appliedSettings.imageWidth * upscaleSettings.scale
        )
        workflow[imageScaleNode.nodeId].inputs.height = Math.round(
          appliedSettings.imageHeight * upscaleSettings.scale
        )
      }
    }

    // FaceDetailer configuration (if enabled)
    if (promptsData.useFaceDetailer && modelSettings?.faceDetailer) {
      const fdSettings = modelSettings.faceDetailer

      // Configure FaceDetailer checkpoint (node 69, SDXL)
      const fdCkpt = fdSettings.checkpoint
      if (fdCkpt && fdCkpt.length > 0) {
        const fdCheckpointNode = findNodeByTitle(workflow, 'Load Checkpoint')
        if (fdCheckpointNode && fdCheckpointNode.nodeId === '69') {
          workflow[fdCheckpointNode.nodeId].inputs.ckpt_name = fdCkpt
        }
      }

      // Configure FaceDetailer prompts (nodes 71, 72)
      const fdPosNode = findNodeByTitle(workflow, 'CLIP Text Encode (Prompt)')
      if (fdPosNode && fdPosNode.nodeId === '71') {
        workflow[fdPosNode.nodeId].inputs.text = combinedPrompt
      }

      const fdNegNode = findNodeByTitle(workflow, 'CLIP Text Encode (Prompt)')
      if (fdNegNode && fdNegNode.nodeId === '72') {
        workflow[fdNegNode.nodeId].inputs.text = negativeTagsText
      }

      // Configure FaceDetailer VAE (node 70)
      const fdVaeNode = findNodeByTitle(workflow, 'Load VAE')
      if (fdVaeNode && fdVaeNode.nodeId === '70') {
        const fdVae =
          fdSettings.selectedVae === '__embedded__'
            ? 'fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors'
            : fdSettings.selectedVae
        workflow[fdVaeNode.nodeId].inputs.vae_name = fdVae
      }

      // Configure FaceDetailer sampler params (node 68)
      const fdNode = findNodeByTitle(workflow, 'FaceDetailer')
      if (fdNode) {
        workflow[fdNode.nodeId].inputs.seed = mainSeed + 2
        workflow[fdNode.nodeId].inputs.steps = fdSettings.steps
        workflow[fdNode.nodeId].inputs.cfg = fdSettings.cfgScale
        workflow[fdNode.nodeId].inputs.sampler_name = fdSettings.sampler
        workflow[fdNode.nodeId].inputs.scheduler = fdSettings.scheduler
        workflow[fdNode.nodeId].inputs.denoise = fdSettings.denoise
      }
    }

    // Final Save node wiring: respect upscale/face detailer toggles
    let imageSourceNodeId: string

    if (promptsData.useUpscale) {
      if (promptsData.useFaceDetailer) {
        const fdNode = findNodeByTitle(workflow, 'FaceDetailer')
        if (!fdNode) {
          return { error: 'Missing required node: "FaceDetailer"' }
        }
        imageSourceNodeId = fdNode.nodeId
      } else {
        const upscaleDecode = findNodeByTitle(workflow, 'VAE Decode (Tiled)')
        if (!upscaleDecode) {
          return { error: 'Missing required node: "VAE Decode (Tiled)"' }
        }
        imageSourceNodeId = upscaleDecode.nodeId
      }
    } else {
      if (promptsData.useFaceDetailer) {
        const fdNode = findNodeByTitle(workflow, 'FaceDetailer')
        if (!fdNode) {
          return { error: 'Missing required node: "FaceDetailer"' }
        }
        imageSourceNodeId = fdNode.nodeId
      } else {
        const baseDecode = findNodeByTitle(workflow, 'VAE Decode')
        if (!baseDecode) {
          return { error: 'Missing required node: "VAE Decode"' }
        }
        imageSourceNodeId = baseDecode.nodeId
      }
    }

    // Add SaveImageWebsocket node
    workflow[FINAL_SAVE_NODE_ID] = {
      inputs: { images: [imageSourceNodeId, 0] },
      class_type: 'SaveImageWebsocket',
      _meta: { title: 'Final Save Image Websocket' }
    }

    console.log('workflow (flux1_krea)', workflow)

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
      mainSeed,
      {
        onLoadingChange,
        onProgressUpdate,
        onImageReceived
      }
    )

    return {
      seed: mainSeed,
      randomTagResolutions: allRandomResolutions,
      disabledZones
    }
  } catch (error) {
    console.error('Failed to generate Flux1 Krea image:', error)
    return {
      error: error instanceof Error ? error.message : 'Failed to generate image'
    }
  }
}

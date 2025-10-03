// Chroma-specific image generation utility functions
//
// Loads a Chroma workflow JSON from data/workflow/chroma.workflow.json by default
// and applies Settings into the workflow similarly to the Qwen path, but using
// title-based node lookups to minimize coupling to specific node IDs.

import { FINAL_SAVE_NODE_ID } from './workflow'
import {
  expandCustomTags,
  detectCompositionFromTags,
  cleanDirectivesFromTags,
  prefetchWildcardFilesFromTexts
} from './tagExpansion'
import { getWildcardModel } from '../stores/tagsStore'
import { readWildcardZones } from './wildcardZones'
import {
  generateClientId,
  getEffectiveLoras,
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
  setNodeClipSkip,
  loadCustomWorkflow
} from './workflowMapping'

function findFirstNodeByClassType(workflow: ComfyUIWorkflow, classType: string): string | null {
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (node && node.class_type === classType) return nodeId
  }
  return null
}

async function loadChromaWorkflow(customPath: string | undefined): Promise<ComfyUIWorkflow> {
  // Try per-model custom workflow first
  if (customPath) {
    try {
      const wf = await loadCustomWorkflow(customPath)
      return wf
    } catch {
      // Fall through to default
    }
  }
  // Try bundled chroma workflow in data/workflow
  try {
    const wf = await loadCustomWorkflow('chroma.workflow.json')
    return wf
  } catch {
    // As a last resort, load the default SD workflow
    const { defaultWorkflowPrompt } = await import('./workflow')
    return JSON.parse(JSON.stringify(defaultWorkflowPrompt))
  }
}

export async function generateChromaImage(
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
  disabledZones: Set<string>
}> {
  const {
    promptsData,
    settings,
    seed,
    onLoadingChange,
    onProgressUpdate,
    onImageReceived,
    onError
  } = options

  let workflow: ComfyUIWorkflow = await loadChromaWorkflow(modelSettings?.customWorkflowPath)

  try {
    onLoadingChange(true)
    onProgressUpdate({ value: 0, max: 100, currentNode: '' })

    const clientId = generateClientId()

    // Read wildcard zones for chroma model; falls back to default wildcards
    const wildcardZones = await readWildcardZones('chroma')
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

    const zone1Result = expandCustomTags(
      wildcardZones.zone1,
      model,
      new Set(),
      { ...allResult.randomTagResolutions },
      {},
      sharedDisabledContext
    )

    const zone2Result = expandCustomTags(
      wildcardZones.zone2,
      model,
      new Set(),
      { ...allResult.randomTagResolutions, ...zone1Result.randomTagResolutions },
      {},
      sharedDisabledContext
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
      {},
      sharedDisabledContext
    )

    let allTagsText = cleanDirectivesFromTags(allResult.expandedText)
    let zone1TagsText = cleanDirectivesFromTags(zone1Result.expandedText)
    let zone2TagsText = cleanDirectivesFromTags(zone2Result.expandedText)
    let negativeTagsText = cleanDirectivesFromTags(negativeResult.expandedText)

    const isAll = promptsData.selectedComposition === 'all'
    if (isAll) {
      zone2TagsText = ''
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

    // Configure size (Chroma uses EmptySD3LatentImage)
    setNodeImageSize(
      workflow,
      'Empty Latent Image',
      appliedSettings.imageWidth,
      appliedSettings.imageHeight
    )
    const sd3EmptyId = findFirstNodeByClassType(workflow, 'EmptySD3LatentImage')
    if (sd3EmptyId && workflow[sd3EmptyId]) {
      workflow[sd3EmptyId].inputs.width = appliedSettings.imageWidth
      workflow[sd3EmptyId].inputs.height = appliedSettings.imageHeight
    }

    // Do not override SDXL CheckpointLoader for Chroma workflows.
    // Chroma uses UNETLoader for the main model; SDXL checkpoint (if any) is used only for upscale/FD paths.

    // Configure CLIP skip (if present)
    setNodeClipSkip(workflow, 'CLIP Set Last Layer', appliedSettings.clipSkip)

    // Configure main prompts: prefer explicit Positive/Negative, else Prompt
    const combinedPrompt = [allTagsText, zone1TagsText, zone2TagsText]
      .filter((t) => t && t.trim().length > 0)
      .join(', ')
    // Main prompts (Chroma path)
    setNodeTextInput(workflow, 'CLIP Text Encode (Positive Prompt)', combinedPrompt)
    setNodeTextInput(workflow, 'CLIP Text Encode (Negative Prompt)', negativeTagsText)

    // Upscale/FaceDetailer prompts (separate nodes with explicit titles)
    if (promptsData.useFaceDetailer) {
      setNodeTextInput(workflow, 'Upscale CLIP Text Encode (Positive)', combinedPrompt)
      setNodeTextInput(workflow, 'Upscale CLIP Text Encode (Negative)', negativeTagsText)
    }

    // Configure main sampler / scheduler / noise seed (Chroma: RandomNoise + BasicScheduler + CFGGuider + KSamplerSelect)
    const mainSeed = seed ?? Math.floor(Math.random() * 1000000000000000)
    // RandomNoise node
    const randomNoiseId = findFirstNodeByClassType(workflow, 'RandomNoise')
    if (randomNoiseId && workflow[randomNoiseId]) {
      workflow[randomNoiseId].inputs.noise_seed = mainSeed
    }
    // BasicScheduler
    const schedulerId = findFirstNodeByClassType(workflow, 'BasicScheduler')
    if (schedulerId && workflow[schedulerId]) {
      const inputs = workflow[schedulerId].inputs
      if (typeof appliedSettings.steps === 'number') inputs.steps = appliedSettings.steps
      inputs.scheduler = scheduler
      if (typeof inputs.denoise === 'number') {
        // Keep existing denoise if present; users can change via settings.upscale/face detailer where relevant
      }
    }
    // CFGGuider (cfg scale)
    const cfgGuiderId = findFirstNodeByClassType(workflow, 'CFGGuider')
    if (cfgGuiderId && workflow[cfgGuiderId]) {
      workflow[cfgGuiderId].inputs.cfg = appliedSettings.cfgScale
    }
    // KSamplerSelect (sampler algorithm)
    const ksamplerSelectId = findFirstNodeByClassType(workflow, 'KSamplerSelect')
    if (ksamplerSelectId && workflow[ksamplerSelectId]) {
      workflow[ksamplerSelectId].inputs.sampler_name = appliedSettings.sampler
    }
    // Also support classic SamplerCustom if present (for rare custom chroma pipelines)
    if (
      !setNodeSampler(workflow, 'KSampler (Main)', {
        steps: appliedSettings.steps,
        cfg: appliedSettings.cfgScale,
        sampler_name: appliedSettings.sampler,
        scheduler,
        seed: mainSeed
      }) &&
      !setNodeSampler(workflow, 'KSampler', {
        steps: appliedSettings.steps,
        cfg: appliedSettings.cfgScale,
        sampler_name: appliedSettings.sampler,
        scheduler,
        seed: mainSeed
      })
    ) {
      const samplerNode = findNodeByTitle(workflow, 'SamplerCustom')
      if (samplerNode) {
        const inputs = workflow[samplerNode.nodeId].inputs
        inputs.cfg = appliedSettings.cfgScale
        if ('noise_seed' in inputs) inputs.noise_seed = mainSeed
      }
    }

    // Upscale KSampler (if present)
    setNodeSampler(workflow, 'KSampler (Upscale)', {
      steps: modelSettings?.upscale.steps,
      cfg: modelSettings?.upscale.cfgScale,
      sampler_name: modelSettings?.upscale.sampler,
      scheduler: modelSettings?.upscale.scheduler,
      denoise: modelSettings?.upscale.denoise
    })

    // FaceDetailer wiring and settings (only when enabled)
    if (promptsData.useFaceDetailer && modelSettings) {
      // Configure sampler params
      setNodeSampler(workflow, 'FaceDetailer', {
        steps: modelSettings.faceDetailer.steps,
        cfg: modelSettings.faceDetailer.cfgScale,
        sampler_name: modelSettings.faceDetailer.sampler,
        scheduler: modelSettings.faceDetailer.scheduler,
        denoise: modelSettings.faceDetailer.denoise,
        seed: mainSeed + 1
      })

      // Configure FaceDetailer checkpoint if specified in settings
      const fdCkpt = modelSettings.faceDetailer.checkpoint
      if (fdCkpt && typeof fdCkpt === 'string' && fdCkpt.length > 0) {
        setNodeCheckpoint(workflow, 'Load Checkpoint', fdCkpt)
      }

      // Configure FaceDetailer VAE based on per-model choice
      const fdNode = findNodeByTitle(workflow, 'FaceDetailer')
      const vaeLoaderId = findFirstNodeByClassType(workflow, 'VAELoader')
      if (fdNode && vaeLoaderId) {
        const fdVae = modelSettings.faceDetailer.selectedVae
        if (fdVae && fdVae !== '__embedded__') {
          // Point FD to external VAE loader
          workflow[fdNode.nodeId].inputs.vae = [vaeLoaderId, 0]
          setNodeVae(workflow, 'Load VAE', fdVae)
        } else {
          // Use embedded VAE from checkpoint (keep as-is)
        }
      }

      // Provide FaceDetailer wildcard with zone prompts
      const isAllComposition = promptsData.selectedComposition === 'all'
      const combinedZonePrompt = isAllComposition
        ? zone1TagsText
        : zone1TagsText && zone2TagsText
          ? `[ASC] ${zone1TagsText} [SEP] ${zone2TagsText}`
          : zone1TagsText || zone2TagsText
      if (fdNode && workflow[fdNode.nodeId] && 'wildcard' in workflow[fdNode.nodeId].inputs) {
        workflow[fdNode.nodeId].inputs.wildcard = combinedZonePrompt
      }
    }

    // VAE override if selected explicitly
    if (appliedSettings.selectedVae && appliedSettings.selectedVae !== '__embedded__') {
      // Try English title first, otherwise set first VAELoader by class_type
      if (!setNodeVae(workflow, 'Load VAE', appliedSettings.selectedVae)) {
        const vaeNodeId = findFirstNodeByClassType(workflow, 'VAELoader')
        if (vaeNodeId && workflow[vaeNodeId]) {
          workflow[vaeNodeId].inputs.vae_name = appliedSettings.selectedVae
        }
      }
    }

    // Chroma UNET selection from selected checkpoint when provided
    if (promptsData.selectedCheckpoint) {
      const unetNodeId = findFirstNodeByClassType(workflow, 'UNETLoader')
      if (unetNodeId && workflow[unetNodeId]) {
        if (typeof workflow[unetNodeId].inputs.unet_name === 'string') {
          workflow[unetNodeId].inputs.unet_name = promptsData.selectedCheckpoint
        }
      }
    }

    // Final Save node wiring: respect upscale/face detailer toggles
    let imageSourceNodeId = '19'
    const fdNode = findNodeByTitle(workflow, 'FaceDetailer')
    const upscaleDecode = findNodeByTitle(workflow, 'VAE Decode (Upscale)')
    const baseDecode = findNodeByTitle(workflow, 'VAE Decode (Base)')

    if (promptsData.useUpscale) {
      imageSourceNodeId =
        promptsData.useFaceDetailer && fdNode
          ? fdNode.nodeId
          : upscaleDecode?.nodeId || imageSourceNodeId
    } else {
      imageSourceNodeId =
        promptsData.useFaceDetailer && fdNode
          ? fdNode.nodeId
          : baseDecode?.nodeId || imageSourceNodeId
    }
    // Add SaveImageWebsocket node (always overwrite the constant ID)
    workflow[FINAL_SAVE_NODE_ID] = {
      inputs: { images: [imageSourceNodeId, 0] },
      class_type: 'SaveImageWebsocket',
      _meta: { title: 'Final Save Image Websocket' }
    }

    // Debug: print workflow before submission
    console.log('workflow (chroma)', workflow)

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
        onImageReceived,
        onError
      }
    )

    return {
      seed: mainSeed,
      randomTagResolutions: allRandomResolutions,
      disabledZones: sharedDisabledContext.names
    }
  } catch (error) {
    console.error('Failed to generate Chroma image:', error)
    onError(error instanceof Error ? error.message : 'Failed to generate image')
    onLoadingChange(false)
    throw error
  }
}

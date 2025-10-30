// Chroma-specific image generation utility functions
//
// Loads a Chroma workflow JSON from data/workflow/chroma.workflow.json by default
// and applies Settings into the workflow similarly to the Qwen path, but using
// title-based node lookups to minimize coupling to specific node IDs.

import { FINAL_SAVE_NODE_ID, defaultWorkflowPrompt } from './workflow'
import {
  expandCustomTags,
  detectCompositionFromTags,
  cleanDirectivesFromTags,
  prefetchWildcardFilesFromTexts
} from '../utils/tagExpansion'
import { getWildcardModel } from '../stores/tagsStore'
import { updateComposition } from '../stores/promptsStore'
import { readWildcardZones } from '../utils/wildcardZones'
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
    return JSON.parse(JSON.stringify(defaultWorkflowPrompt))
  }
}

export async function generateChromaImage(
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
    onImageReceived,
    wildcardOverrides
  } = options

  let workflow: ComfyUIWorkflow = await loadChromaWorkflow(modelSettings?.customWorkflowPath)

  try {
    onLoadingChange(true)
    onProgressUpdate({ value: 0, max: 100, currentNode: '' })

    const clientId = generateClientId()

    // Read wildcard zones for chroma model
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

    // Track disabled zones for UI feedback (zones already filtered during expansion)
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

    // Configure size (Chroma uses EmptySD3LatentImage)
    if (
      !setNodeImageSize(
        workflow,
        'Empty Latent Image',
        appliedSettings.imageWidth,
        appliedSettings.imageHeight
      )
    ) {
      return {
        error: 'Could not find Empty Latent Image node in workflow'
      }
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
    if (!setNodeTextInput(workflow, 'CLIP Text Encode (Positive Prompt)', combinedPrompt)) {
      return { error: 'Missing required node: "CLIP Text Encode (Positive Prompt)"' }
    }
    if (!setNodeTextInput(workflow, 'CLIP Text Encode (Negative Prompt)', negativeTagsText)) {
      return { error: 'Missing required node: "CLIP Text Encode (Negative Prompt)"' }
    }

    // Configure main sampler / scheduler / noise seed (Chroma: RandomNoise + BasicScheduler + CFGGuider + KSamplerSelect)
    const mainSeed = seed ?? Math.floor(Math.random() * 1000000000000000)

    // RandomNoise node
    const randomNoiseId = findFirstNodeByClassType(workflow, 'RandomNoise')
    if (!randomNoiseId || !workflow[randomNoiseId]) {
      return { error: 'Missing required node with class type: "RandomNoise"' }
    }
    workflow[randomNoiseId].inputs.noise_seed = mainSeed

    // BasicScheduler
    const schedulerId = findFirstNodeByClassType(workflow, 'BasicScheduler')
    if (!schedulerId || !workflow[schedulerId]) {
      return { error: 'Missing required node with class type: "BasicScheduler"' }
    }
    const inputs = workflow[schedulerId].inputs
    if (typeof appliedSettings.steps === 'number') inputs.steps = appliedSettings.steps
    inputs.scheduler = scheduler

    // CFGGuider (cfg scale)
    const cfgGuiderId = findFirstNodeByClassType(workflow, 'CFGGuider')
    if (!cfgGuiderId || !workflow[cfgGuiderId]) {
      return { error: 'Missing required node with class type: "CFGGuider"' }
    }
    workflow[cfgGuiderId].inputs.cfg = appliedSettings.cfgScale

    // KSamplerSelect (sampler algorithm)
    const ksamplerSelectId = findFirstNodeByClassType(workflow, 'KSamplerSelect')
    if (!ksamplerSelectId || !workflow[ksamplerSelectId]) {
      return { error: 'Missing required node with class type: "KSamplerSelect"' }
    }
    workflow[ksamplerSelectId].inputs.sampler_name = appliedSettings.sampler

    // Upscale configuration (required when upscale is enabled)
    if (promptsData.useUpscale) {
      const upscaleSettings = modelSettings?.upscale
      const isSameCheckpoint =
        upscaleSettings?.checkpoint === promptsData.selectedCheckpoint ||
        !upscaleSettings?.checkpoint ||
        upscaleSettings?.checkpoint === 'model.safetensors'

      // Configure Upscale Image dimensions
      const upscaleImage = findNodeByTitle(workflow, 'Upscale Image')
      if (!upscaleImage) {
        return { error: 'Missing required node: "Upscale Image"' }
      }
      const scale = upscaleSettings?.scale || 1.5
      workflow[upscaleImage.nodeId].inputs.width = Math.round(appliedSettings.imageWidth * scale)
      workflow[upscaleImage.nodeId].inputs.height = Math.round(appliedSettings.imageHeight * scale)

      const upscaleSampler = findNodeByTitle(workflow, 'KSampler (Upscale)')
      if (!upscaleSampler) {
        return { error: 'Missing required node: "KSampler (Upscale)"' }
      }

      if (isSameCheckpoint) {
        // Reuse base model nodes when checkpoint is the same
        const flowShift = findNodeByTitle(workflow, 'Flow Shift')
        if (!flowShift) {
          return { error: 'Missing required node: "Flow Shift"' }
        }
        workflow[upscaleSampler.nodeId].inputs.model = [flowShift.nodeId, 0]

        const basePos = findNodeByTitle(workflow, 'CLIP Text Encode (Positive Prompt)')
        if (!basePos) {
          return { error: 'Missing required node: "CLIP Text Encode (Positive Prompt)"' }
        }
        workflow[upscaleSampler.nodeId].inputs.positive = [basePos.nodeId, 0]

        const baseNeg = findNodeByTitle(workflow, 'CLIP Text Encode (Negative Prompt)')
        if (!baseNeg) {
          return { error: 'Missing required node: "CLIP Text Encode (Negative Prompt)"' }
        }
        workflow[upscaleSampler.nodeId].inputs.negative = [baseNeg.nodeId, 0]
      } else {
        // Use separate upscale nodes when checkpoint is different
        const upscaleCheckpoint = findNodeByTitle(workflow, 'Upscale Load Checkpoint')
        if (!upscaleCheckpoint) {
          return { error: 'Missing required node: "Upscale Load Checkpoint"' }
        }

        // Set upscale checkpoint name
        if (upscaleSettings?.checkpoint && upscaleSettings.checkpoint !== 'model.safetensors') {
          workflow[upscaleCheckpoint.nodeId].inputs.ckpt_name = upscaleSettings.checkpoint
        }

        workflow[upscaleSampler.nodeId].inputs.model = [upscaleCheckpoint.nodeId, 0]

        const upscalePos = findNodeByTitle(workflow, 'Upscale CLIP Text Encode (Positive)')
        if (!upscalePos) {
          return { error: 'Missing required node: "Upscale CLIP Text Encode (Positive)"' }
        }
        workflow[upscalePos.nodeId].inputs.clip = [upscaleCheckpoint.nodeId, 1]
        workflow[upscalePos.nodeId].inputs.text = combinedPrompt
        workflow[upscaleSampler.nodeId].inputs.positive = [upscalePos.nodeId, 0]

        const upscaleNeg = findNodeByTitle(workflow, 'Upscale CLIP Text Encode (Negative)')
        if (!upscaleNeg) {
          return { error: 'Missing required node: "Upscale CLIP Text Encode (Negative)"' }
        }
        workflow[upscaleNeg.nodeId].inputs.clip = [upscaleCheckpoint.nodeId, 1]
        workflow[upscaleNeg.nodeId].inputs.text = negativeTagsText
        workflow[upscaleSampler.nodeId].inputs.negative = [upscaleNeg.nodeId, 0]
      }

      // Configure VAE nodes for upscale
      const upscaleEncode = findNodeByTitle(workflow, 'VAE Encode (Tiled)')
      if (!upscaleEncode) {
        return { error: 'Missing required node: "VAE Encode (Tiled)"' }
      }

      const upscaleDecode = findNodeByTitle(workflow, 'VAE Decode (Tiled)')
      if (!upscaleDecode) {
        return { error: 'Missing required node: "VAE Decode (Tiled)"' }
      }

      if (isSameCheckpoint) {
        // Reuse base VAE when checkpoint is the same
        const baseVae = findNodeByTitle(workflow, 'Load VAE')
        if (!baseVae) {
          return { error: 'Missing required node: "Load VAE"' }
        }
        workflow[upscaleEncode.nodeId].inputs.vae = [baseVae.nodeId, 0]
        workflow[upscaleDecode.nodeId].inputs.vae = [baseVae.nodeId, 0]
      } else {
        // Use separate upscale VAE when checkpoint is different
        const upscaleVae = findNodeByTitle(workflow, 'Upscale Load VAE')
        if (!upscaleVae) {
          return { error: 'Missing required node: "Upscale Load VAE"' }
        }

        // Set upscale VAE name if specified
        if (upscaleSettings?.selectedVae && upscaleSettings.selectedVae !== '__embedded__') {
          workflow[upscaleVae.nodeId].inputs.vae_name = upscaleSettings.selectedVae
        }

        workflow[upscaleEncode.nodeId].inputs.vae = [upscaleVae.nodeId, 0]
        workflow[upscaleDecode.nodeId].inputs.vae = [upscaleVae.nodeId, 0]
      }

      // Upscale KSampler
      if (
        !setNodeSampler(workflow, 'KSampler (Upscale)', {
          steps: modelSettings?.upscale.steps,
          cfg: modelSettings?.upscale.cfgScale,
          sampler_name: modelSettings?.upscale.sampler,
          scheduler: modelSettings?.upscale.scheduler,
          denoise: modelSettings?.upscale.denoise
        })
      ) {
        return { error: 'Missing required node: "KSampler (Upscale)"' }
      }
    }

    // FaceDetailer configuration (required when face detailer is enabled)
    if (promptsData.useFaceDetailer && modelSettings) {
      // FaceDetailer prompts
      if (!setNodeTextInput(workflow, 'FaceDetailer CLIP Text Encode (Positive)', combinedPrompt)) {
        return { error: 'Missing required node: "FaceDetailer CLIP Text Encode (Positive)"' }
      }
      if (!setNodeTextInput(workflow, 'FaceDetailer CLIP Text Encode (Negative)', negativeTagsText)) {
        return { error: 'Missing required node: "FaceDetailer CLIP Text Encode (Negative)"' }
      }

      // FaceDetailer sampler params
      if (
        !setNodeSampler(workflow, 'FaceDetailer', {
          steps: modelSettings.faceDetailer.steps,
          cfg: modelSettings.faceDetailer.cfgScale,
          sampler_name: modelSettings.faceDetailer.sampler,
          scheduler: modelSettings.faceDetailer.scheduler,
          denoise: modelSettings.faceDetailer.denoise,
          seed: mainSeed + 1
        })
      ) {
        return { error: 'Missing required node: "FaceDetailer"' }
      }

      // Configure FaceDetailer checkpoint if specified in settings
      const fdCkpt = modelSettings.faceDetailer.checkpoint
      if (fdCkpt && typeof fdCkpt === 'string' && fdCkpt.length > 0) {
        if (!setNodeCheckpoint(workflow, 'FaceDetailer Load Checkpoint', fdCkpt)) {
          return { error: 'Missing required node: "FaceDetailer Load Checkpoint"' }
        }
      }

      // Configure FaceDetailer VAE based on per-model choice
      const fdNode = findNodeByTitle(workflow, 'FaceDetailer')
      const fdVae = modelSettings.faceDetailer.selectedVae
      if (fdNode) {
        if (fdVae && fdVae !== '__embedded__') {
          // Point FD to external VAE loader with unique title
          const fdVaeNode = findNodeByTitle(workflow, 'FaceDetailer Load VAE')
          if (!fdVaeNode) {
            return { error: 'Missing required node: "FaceDetailer Load VAE"' }
          }
          workflow[fdNode.nodeId].inputs.vae = [fdVaeNode.nodeId, 0]
          if (!setNodeVae(workflow, 'FaceDetailer Load VAE', fdVae)) {
            return { error: 'Missing required node: "FaceDetailer Load VAE"' }
          }
        } else {
          // Use embedded VAE from checkpoint
          const fdCheckpointNode = findNodeByTitle(workflow, 'FaceDetailer Load Checkpoint')
          if (!fdCheckpointNode) {
            return { error: 'Missing required node: "FaceDetailer Load Checkpoint"' }
          }
          workflow[fdNode.nodeId].inputs.vae = [fdCheckpointNode.nodeId, 2]
        }
      }
    }

    // Main VAE configuration (Chroma UNETLoader doesn't provide VAE output, so always use VAE Loader)
    if (appliedSettings.selectedVae) {
      const vaeToLoad =
        appliedSettings.selectedVae === '__embedded__'
          ? 'ae.safetensors' // Default Chroma VAE
          : appliedSettings.selectedVae

      if (!setNodeVae(workflow, 'Load VAE', vaeToLoad)) {
        return { error: 'Missing required node: "Load VAE"' }
      }
    }

    // Chroma UNET selection from selected checkpoint when provided
    if (promptsData.selectedCheckpoint) {
      const unetNode = findNodeByTitle(workflow, 'Load Diffusion Model')
      if (!unetNode) {
        return { error: 'Missing required node: "Load Diffusion Model"' }
      }
      workflow[unetNode.nodeId].inputs.unet_name = promptsData.selectedCheckpoint
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
        const baseDecode = findNodeByTitle(workflow, 'VAE Decode (Base)')
        if (!baseDecode) {
          return { error: 'Missing required node: "VAE Decode (Base)"' }
        }
        imageSourceNodeId = baseDecode.nodeId
      }
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
        onImageReceived
      }
    )

    return {
      seed: mainSeed,
      randomTagResolutions: allRandomResolutions,
      disabledZones
    }
  } catch (error) {
    console.error('Failed to generate Chroma image:', error)
    return {
      error: error instanceof Error ? error.message : 'Failed to generate image'
    }
  }
}

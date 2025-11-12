// Image generation utility functions
//
// This module orchestrates the complete image generation workflow with ComfyUI

import {
  defaultWorkflowPrompt,
  inpaintingWorkflowPrompt,
  FINAL_SAVE_NODE_ID,
  generateLoraChain
} from './workflow'
import { getDefaultWorkflowForModelType } from './workflowBuilder'
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
import { RefineMode, FaceDetailerMode } from '$lib/types'
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

export async function generateImage(
  options: GenerationOptions,
  refineMode: RefineMode,
  faceDetailerMode: FaceDetailerMode
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
    currentImagePath,
    isInpainting,
    inpaintDenoiseStrength,
    previousRandomTagResolutions,
    onLoadingChange,
    onProgressUpdate,
    onImageReceived
  } = options
  const modelSettings = getEffectiveModelSettings(settings, promptsData.selectedCheckpoint)

  return generateQwenImage(options, modelSettings, refineMode, faceDetailerMode)
}

function configureWorkflow(
  workflow: ComfyUIWorkflow,
  promptsData: PromptsData,
  settings: Settings,
  isInpainting: boolean = false,
  inpaintDenoiseStrength?: number
): { error: string } | null {
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

  const effectiveModel = getEffectiveModelSettings(settings, promptsData.selectedCheckpoint)
  const scheduler = effectiveModel?.scheduler || 'simple'

  if (isInpainting) {
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
  } else {
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

    if (!setNodeSampler(workflow, 'FaceDetailer', { scheduler })) {
      return { error: 'Workflow node not found: FaceDetailer' }
    }

    if (promptsData.useUpscale) {
      const effectiveModelSettings = getEffectiveModelSettings(
        settings,
        promptsData.selectedCheckpoint
      )
      const upscaleSettings = effectiveModelSettings?.upscale || DEFAULT_UPSCALE_SETTINGS

      if (!upscaleSettings.checkpoint || upscaleSettings.checkpoint === 'model.safetensors') {
        return { error: 'Upscale checkpoint not configured in model settings' }
      }

      const upscaleImage = findNodeByTitle(workflow, 'Upscale Image')?.nodeId
      if (upscaleImage && workflow[upscaleImage]) {
        workflow[upscaleImage].inputs.width = Math.round(
          settings.imageWidth * upscaleSettings.scale
        )
        workflow[upscaleImage].inputs.height = Math.round(
          settings.imageHeight * upscaleSettings.scale
        )
      }

      if (!setNodeCheckpoint(workflow, 'Upscale Checkpoint Loader', upscaleSettings.checkpoint)) {
        return { error: 'Workflow node not found: Upscale Checkpoint Loader' }
      }

      const vaeEncodeNode = findNodeByTitle(workflow, 'VAE Encode (Tiled)')
      if (!vaeEncodeNode) {
        return { error: 'Workflow node not found: VAE Encode (Tiled)' }
      }

      const vaeDecodeNode = findNodeByTitle(workflow, 'VAE Decode (Tiled)')
      if (!vaeDecodeNode) {
        return { error: 'Workflow node not found: VAE Decode (Tiled)' }
      }

      let vaeSourceNodeId: string
      let vaeSourceOutputIndex: number

      if (upscaleSettings.selectedVae && upscaleSettings.selectedVae !== '__embedded__') {
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
        const upscaleCkptNode = findNodeByTitle(workflow, 'Upscale Checkpoint Loader')
        if (!upscaleCkptNode) {
          return { error: 'Workflow node not found: Upscale Checkpoint Loader' }
        }
        vaeSourceNodeId = upscaleCkptNode.nodeId
        vaeSourceOutputIndex = 2
      }

      workflow[vaeEncodeNode.nodeId].inputs.vae = [vaeSourceNodeId, vaeSourceOutputIndex]
      workflow[vaeDecodeNode.nodeId].inputs.vae = [vaeSourceNodeId, vaeSourceOutputIndex]

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

      const upscaleSampler = findNodeByTitle(workflow, 'KSampler (Upscale)')?.nodeId
      if (upscaleSampler && workflow[vaeDecodeNode.nodeId]) {
        workflow[vaeDecodeNode.nodeId].inputs.samples = [upscaleSampler, 0]
      }
    }

    if (promptsData.useFaceDetailer) {
      const effectiveModelSettings = getEffectiveModelSettings(
        settings,
        promptsData.selectedCheckpoint
      )
      const faceDetailerSettings =
        effectiveModelSettings?.faceDetailer || DEFAULT_FACE_DETAILER_SETTINGS

      if (
        !faceDetailerSettings.checkpoint ||
        faceDetailerSettings.checkpoint === 'model.safetensors'
      ) {
        return { error: 'FaceDetailer checkpoint not configured in model settings' }
      }

      if (
        !setNodeCheckpoint(
          workflow,
          'FaceDetailer Checkpoint Loader',
          faceDetailerSettings.checkpoint
        )
      ) {
        return { error: 'Workflow node not found: FaceDetailer Checkpoint Loader' }
      }

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

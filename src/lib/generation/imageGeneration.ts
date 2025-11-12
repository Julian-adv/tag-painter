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

// Qwen-specific workflow builder
//
// This module handles building ComfyUI workflows for Qwen models

import { DEFAULT_FACE_DETAILER_SETTINGS, DEFAULT_UPSCALE_SETTINGS } from '$lib/constants'
import type { ComfyUIWorkflow, ModelSettings, Settings } from '$lib/types'
import {
  findNodeByTitle,
  setNodeImageSize,
  setNodeSampler,
  loadCustomWorkflow,
  setRequiredNodeInput,
  setRequiredNodeText
} from './workflowMapping'
import { applyQwenLoraChain } from './qwenImageGeneration'
import { applyPerModelOverrides, getEffectiveLoras } from './generationCommon'
import { getDefaultWorkflowForModelType } from './workflowBuilder'
import { FINAL_SAVE_NODE_ID } from './workflow'

function setInput(
  workflow: ComfyUIWorkflow,
  sourceTitle: string,
  sourceOutputIndex: number,
  targetTitle: string,
  targetInputName: string
): void {
  const sourceNode = findNodeByTitle(workflow, sourceTitle)
  const targetNode = findNodeByTitle(workflow, targetTitle)
  if (sourceNode && targetNode) {
    workflow[targetNode.nodeId].inputs[targetInputName] = [sourceNode.nodeId, sourceOutputIndex]
  } else {
    throw new Error(`Failed to assign input from ${sourceTitle} to ${targetTitle}: node not found`)
  }
}

function copyInput(
  workflow: ComfyUIWorkflow,
  source: string,
  inputName: string,
  target: string
): void {
  const sourceNode = findNodeByTitle(workflow, source)
  const targetNode = findNodeByTitle(workflow, target)
  if (sourceNode && targetNode) {
    workflow[targetNode.nodeId].inputs[inputName] = workflow[sourceNode.nodeId].inputs[inputName]
  } else {
    throw new Error(`Failed to copy input from ${source} to ${target}: node not found`)
  }
}

function attachSaveImageNode(
  workflow: ComfyUIWorkflow,
  useUpscale: boolean,
  useFaceDetailer: boolean
): void {
  let imageSourceNodeId: string

  if (useUpscale) {
    if (useFaceDetailer) {
      imageSourceNodeId = findNodeByTitle(workflow, 'FaceDetailer')?.nodeId || '69'
    } else {
      imageSourceNodeId = findNodeByTitle(workflow, 'VAE Decode (Tiled)')?.nodeId || '126'
    }
  } else {
    imageSourceNodeId = useFaceDetailer
      ? findNodeByTitle(workflow, 'FaceDetailer')?.nodeId || '69'
      : findNodeByTitle(workflow, 'VAE Decode')?.nodeId || '8'
  }

  workflow[FINAL_SAVE_NODE_ID] = {
    inputs: { images: [imageSourceNodeId, 0] },
    class_type: 'SaveImageWebsocket',
    _meta: { title: 'Final Save Image Websocket' }
  }
}

export async function buildQwenWorkflow(
  positiveText: string,
  negativeText: string,
  settings: Settings,
  checkpoint: string,
  useUpscale: boolean,
  useFaceDetailer: boolean,
  modelSettings: ModelSettings | null
): Promise<ComfyUIWorkflow> {
  const workflowPath =
    modelSettings?.customWorkflowPath ||
    settings.customWorkflowPath ||
    getDefaultWorkflowForModelType('qwen')

  let workflow: ComfyUIWorkflow
  try {
    workflow = await loadCustomWorkflow(workflowPath)
  } catch {
    throw new Error(`Failed to load ${workflowPath}`)
  }

  setRequiredNodeText(workflow, 'CLIP Text Encode (Positive)', positiveText)
  setRequiredNodeText(workflow, 'CLIP Text Encode (Negative)', negativeText)

  if (useUpscale) {
    setRequiredNodeText(workflow, 'Upscale CLIP Text Encode (Positive)', positiveText)
    setRequiredNodeText(workflow, 'Upscale CLIP Text Encode (Negative)', negativeText)
  }

  if (useFaceDetailer) {
    setRequiredNodeText(workflow, 'FaceDetailer CLIP Text Encode (Positive)', positiveText)
    setRequiredNodeText(workflow, 'FaceDetailer CLIP Text Encode (Negative)', negativeText)
  }

  for (const [nodeId, node] of Object.entries(workflow)) {
    if (
      node.class_type === 'LoraLoaderModelOnly' ||
      node.class_type === 'PreviewImage' ||
      node.class_type === 'NunchakuQwenImageLoraStack'
    ) {
      delete workflow[nodeId]
    }
  }
  let mainSeed = typeof settings.seed === 'number' ? settings.seed : null
  if (mainSeed == null || mainSeed < 0) {
    mainSeed = Math.floor(Math.random() * 1000000000000000)
  }
  const faceDetailerSeed = mainSeed + 1
  const upscaleSeed = mainSeed + 2
  const appliedSettings = applyPerModelOverrides(settings, checkpoint)
  const effectiveLoras = getEffectiveLoras(settings, checkpoint, [])
  applyQwenLoraChain(workflow, effectiveLoras)
  if (
    !setNodeImageSize(
      workflow,
      'Empty Latent Image',
      appliedSettings.imageWidth,
      appliedSettings.imageHeight
    )
  ) {
    throw new Error('Empty Latent Image node not found in Qwen workflow')
  }

  const scheduler = modelSettings?.scheduler || 'simple'
  if (
    !setNodeSampler(workflow, 'KSampler', {
      seed: mainSeed,
      steps: appliedSettings.steps,
      cfg: appliedSettings.cfgScale,
      sampler_name: appliedSettings.sampler,
      scheduler
    })
  ) {
    throw new Error('KSampler node not found in Qwen workflow')
  }

  if (checkpoint) {
    const unetNode = findNodeByTitle(workflow, 'Load Qwen UNet')
    if (unetNode) {
      workflow[unetNode.nodeId].inputs.unet_name = checkpoint
    } else {
      const nunchakuNode = findNodeByTitle(workflow, 'Nunchaku Qwen-Image DiT Loader')
      if (nunchakuNode) {
        workflow[nunchakuNode.nodeId].inputs.model_name = checkpoint
      } else {
        throw new Error('Load Qwen UNet node not found in workflow')
      }
    }
  }

  if (appliedSettings.selectedVae && appliedSettings.selectedVae !== '__embedded__') {
    setRequiredNodeInput(workflow, 'Load Qwen VAE', 'vae_name', appliedSettings.selectedVae)
  }

  if (useFaceDetailer) {
    const fdNode = findNodeByTitle(workflow, 'FaceDetailer')
    if (!fdNode) {
      throw new Error('FaceDetailer node not found in Qwen workflow')
    }

    const faceDetailerSettings = modelSettings?.faceDetailer || DEFAULT_FACE_DETAILER_SETTINGS
    const fdModelType = faceDetailerSettings.modelType || 'sdxl'

    if (fdModelType === 'qwen') {
      const resolvedFdUnet =
        faceDetailerSettings.checkpoint && faceDetailerSettings.checkpoint !== 'model.safetensors'
          ? faceDetailerSettings.checkpoint
          : checkpoint || 'qwen_image_fp8_e4m3fn.safetensors'

      if (resolvedFdUnet === checkpoint) {
        // Re-use base model
        copyInput(workflow, 'KSampler', 'model', 'FaceDetailer')
        setInput(workflow, 'VAE Decode', 0, 'FaceDetailer', 'image')
        setInput(workflow, 'Load CLIP', 0, 'FaceDetailer', 'clip')
        setInput(workflow, 'Load Qwen VAE', 0, 'FaceDetailer', 'vae')
        setInput(workflow, 'CLIP Text Encode (Positive)', 0, 'FaceDetailer', 'positive')
        setInput(workflow, 'CLIP Text Encode (Negative)', 0, 'FaceDetailer', 'negative')
      } else {
        // different model, not supported yet
        throw new Error('Qwen FaceDetailer with different model not yet implemented')
      }
    } else if (fdModelType === 'sdxl') {
      const resolvedFdCkpt =
        faceDetailerSettings.checkpoint && faceDetailerSettings.checkpoint !== 'model.safetensors'
          ? faceDetailerSettings.checkpoint
          : checkpoint || faceDetailerSettings.checkpoint

      setRequiredNodeInput(
        workflow,
        'FaceDetailer Checkpoint Loader (SDXL)',
        'ckpt_name',
        resolvedFdCkpt
      )
      setInput(workflow, 'FaceDetailer Checkpoint Loader (SDXL)', 0, 'FaceDetailer', 'model')
      setInput(workflow, 'FaceDetailer Checkpoint Loader (SDXL)', 1, 'FaceDetailer', 'clip')

      if (faceDetailerSettings.selectedVae === '__embedded__') {
        setInput(workflow, 'FaceDetailer Checkpoint Loader (SDXL)', 2, 'FaceDetailer', 'vae')
      } else {
        setInput(workflow, 'FaceDetailer VAE Loader (SDXL)', 0, 'FaceDetailer', 'vae')
        const fdVaeName =
          faceDetailerSettings.selectedVae || 'fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors'
        setRequiredNodeInput(workflow, 'FaceDetailer VAE Loader (SDXL)', 'vae_name', fdVaeName)
      }

      setInput(workflow, 'FaceDetailer CLIP Text Encode (Positive)', 0, 'FaceDetailer', 'positive')
      setInput(workflow, 'FaceDetailer CLIP Text Encode (Negative)', 0, 'FaceDetailer', 'negative')
    }

    workflow[fdNode.nodeId].inputs.seed = faceDetailerSeed
    workflow[fdNode.nodeId].inputs.steps = faceDetailerSettings.steps
    workflow[fdNode.nodeId].inputs.cfg = faceDetailerSettings.cfgScale
    workflow[fdNode.nodeId].inputs.sampler_name = faceDetailerSettings.sampler
    workflow[fdNode.nodeId].inputs.scheduler = faceDetailerSettings.scheduler
    workflow[fdNode.nodeId].inputs.denoise = faceDetailerSettings.denoise
    const upscaleDecodeNodeId = findNodeByTitle(workflow, 'VAE Decode (Tiled)')?.nodeId
    const baseDecodeNodeId = findNodeByTitle(workflow, 'VAE Decode')?.nodeId
    if (useUpscale && upscaleDecodeNodeId) {
      workflow[fdNode.nodeId].inputs.image = [upscaleDecodeNodeId, 0]
    } else if (!useUpscale && baseDecodeNodeId) {
      workflow[fdNode.nodeId].inputs.image = [baseDecodeNodeId, 0]
    }

    // Ensure detector uses the same image branch to avoid triggering unused upscale path
    const detectorNode = findNodeByTitle(workflow, 'Simple Detector (SEGS)')
    if (detectorNode && workflow[detectorNode.nodeId]) {
      if (useUpscale && upscaleDecodeNodeId) {
        workflow[detectorNode.nodeId].inputs.image = [upscaleDecodeNodeId, 0]
      } else if (!useUpscale && baseDecodeNodeId) {
        workflow[detectorNode.nodeId].inputs.image = [baseDecodeNodeId, 0]
      }
    }
  }

  if (useUpscale) {
    const upscaleSettings = modelSettings?.upscale || DEFAULT_UPSCALE_SETTINGS
    const upscaleModelType = upscaleSettings.modelType || 'sdxl'

    const latentUpscale = findNodeByTitle(workflow, 'Upscale Image')
    if (!latentUpscale) {
      throw new Error('Upscale Image node not found in Qwen workflow')
    }
    workflow[latentUpscale.nodeId].inputs.width = Math.round(
      appliedSettings.imageWidth * upscaleSettings.scale
    )
    workflow[latentUpscale.nodeId].inputs.height = Math.round(
      appliedSettings.imageHeight * upscaleSettings.scale
    )

    const upscaleSampler = findNodeByTitle(workflow, 'KSampler (Upscale)')
    if (!upscaleSampler) {
      throw new Error('KSampler (Upscale) node not found in Qwen workflow')
    }

    const resolvedUpscaleUnet =
      upscaleSettings.checkpoint && upscaleSettings.checkpoint !== 'model.safetensors'
        ? upscaleSettings.checkpoint
        : checkpoint || 'qwen_image_fp8_e4m3fn.safetensors'
    if (upscaleModelType === 'qwen') {
      if (resolvedUpscaleUnet === checkpoint) {
        // Re-use base model
        copyInput(workflow, 'KSampler', 'model', 'KSampler (Upscale)')
        setInput(workflow, 'Load Qwen VAE', 0, 'VAE Encode (Tiled)', 'vae')
        setInput(workflow, 'Load Qwen VAE', 0, 'VAE Decode (Tiled)', 'vae')
        setInput(workflow, 'CLIP Text Encode (Positive)', 0, 'KSampler (Upscale)', 'positive')
        setInput(workflow, 'CLIP Text Encode (Negative)', 0, 'KSampler (Upscale)', 'negative')
      } else {
        throw new Error('Qwen Upscale with different model not yet implemented')
      }
    } else if (upscaleModelType === 'sdxl') {
      const upscaleVaeLoader = findNodeByTitle(workflow, 'Upscale VAE Loader (SDXL)')
      if (upscaleSettings.selectedVae === '__embedded__') {
        setInput(workflow, 'Upscale Checkpoint Loader (SDXL)', 2, 'VAE Encode (Tiled)', 'vae')
        setInput(workflow, 'Upscale Checkpoint Loader (SDXL)', 2, 'VAE Decode (Tiled)', 'vae')
      } else {
        if (!upscaleVaeLoader) {
          throw new Error('Upscale VAE Loader (SDXL) node not found in Qwen workflow')
        }
        setInput(workflow, 'Upscale VAE Loader (SDXL)', 0, 'VAE Encode (Tiled)', 'vae')
        setInput(workflow, 'Upscale VAE Loader (SDXL)', 0, 'VAE Decode (Tiled)', 'vae')
        const resolvedUpscaleVae =
          upscaleSettings.selectedVae || 'fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors'
        setRequiredNodeInput(workflow, 'Upscale VAE Loader (SDXL)', 'vae_name', resolvedUpscaleVae)
      }
      setRequiredNodeInput(
        workflow,
        'Upscale Checkpoint Loader (SDXL)',
        'ckpt_name',
        resolvedUpscaleUnet
      )
      setInput(workflow, 'Upscale Checkpoint Loader (SDXL)', 0, 'KSampler (Upscale)', 'model')
      setInput(workflow, 'Upscale CLIP Text Encode (Positive)', 0, 'KSampler (Upscale)', 'positive')
      setInput(workflow, 'Upscale CLIP Text Encode (Negative)', 0, 'KSampler (Upscale)', 'negative')
    } else {
      throw new Error('Unsupported upscale model type for Qwen workflow')
    }

    if (
      !setNodeSampler(workflow, 'KSampler (Upscale)', {
        seed: upscaleSeed,
        steps: upscaleSettings.steps,
        cfg: upscaleSettings.cfgScale,
        sampler_name: upscaleSettings.sampler,
        scheduler: upscaleSettings.scheduler,
        denoise: upscaleSettings.denoise
      })
    ) {
      throw new Error('KSampler (Upscale) node not found in Qwen workflow')
    }
  }

  attachSaveImageNode(workflow, useUpscale, useFaceDetailer)

  return workflow
}

import {
  defaultWorkflowPrompt,
  generateLoraChain,
  FINAL_SAVE_NODE_ID
} from './workflow'
import {
  DEFAULT_FACE_DETAILER_SETTINGS,
  DEFAULT_UPSCALE_SETTINGS
} from '$lib/constants'
import type { Settings, ComfyUIWorkflow, ModelSettings } from '$lib/types'
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
import {
  getEffectiveModelSettings,
  getEffectiveLoras,
  applyPerModelOverrides,
  generateClientId
} from './generationCommon'
import { qwenWorkflowPrompt } from './qwenWorkflow'
import { applyQwenLoraChain } from './qwenImageGeneration'
import { buildComfyHttpUrl, normalizeBaseUrl } from './comfyui'

export function getDefaultWorkflowForModelType(modelType: string | undefined): string {
  switch (modelType) {
    case 'qwen':
      return 'qwen.api.workflow.json'
    case 'chroma':
      return 'chroma.api.workflow.json'
    case 'flux1_krea':
      return 'flux1_krea.api.workflow.json'
    case 'sdxl':
    default:
      return 'sdxl.api.workflow.json'
  }
}

function setRequiredNodeInput(workflow: ComfyUIWorkflow, title: string, inputKey: string, value: any): void {
  const node = findNodeByTitle(workflow, title)
  if (node) {
    if (workflow[node.nodeId].inputs && (inputKey in workflow[node.nodeId].inputs)) {
      workflow[node.nodeId].inputs[inputKey] = value
    } else {
      throw new Error(`Workflow node "${title}" missing input key: "${inputKey}"`)
    }
  } else {
    throw new Error(`Workflow node not found: "${title}"`)
  }
}

function setRequiredNodeText(
  workflow: ComfyUIWorkflow,
  title: string,
  text: string
): void {
  setRequiredNodeInput(workflow, title, 'text', text)
}

function configureWorkflowForPrompts(
  workflow: ComfyUIWorkflow,
  settings: Settings,
  checkpoint: string,
  useUpscale: boolean,
  useFaceDetailer: boolean
): { error: string } | null {
  if (checkpoint) {
  if (!setNodeCheckpoint(workflow, 'Load Checkpoint', checkpoint)) {
      return { error: 'Workflow node not found: Load Checkpoint' }
    }
  }

  if (settings.selectedVae && settings.selectedVae !== '__embedded__') {
    if (!setNodeVae(workflow, 'Load VAE', settings.selectedVae)) {
      return { error: 'Workflow node not found: Load VAE' }
    }
  }

  const effectiveModel = getEffectiveModelSettings(settings, checkpoint)
  const scheduler = effectiveModel?.scheduler || 'simple'

  if (!setNodeSampler(workflow, 'BasicScheduler', { steps: settings.steps, scheduler })) {
    return { error: 'Workflow node not found: BasicScheduler' }
  }
  if (!setNodeSampler(workflow, 'SamplerCustom', { cfg: settings.cfgScale })) {
    return { error: 'Workflow node not found: SamplerCustom' }
  }
  if (!setNodeSampler(workflow, 'KSamplerSelect', { sampler_name: settings.sampler })) {
    return { error: 'Workflow node not found: KSamplerSelect' }
  }
  if (!setNodeImageSize(workflow, 'Empty Latent Image', settings.imageWidth, settings.imageHeight)) {
    return { error: 'Workflow node not found: Empty Latent Image' }
  }

  if (!setNodeSampler(workflow, 'FaceDetailer', { scheduler })) {
    return { error: 'Workflow node not found: FaceDetailer' }
  }

  if (useUpscale) {
    const upscaleSettings = effectiveModel?.upscale || DEFAULT_UPSCALE_SETTINGS

    if (!upscaleSettings.checkpoint || upscaleSettings.checkpoint === 'model.safetensors') {
      return { error: 'Upscale checkpoint not configured in model settings' }
    }

    const upscaleImage = findNodeByTitle(workflow, 'Upscale Image')?.nodeId
    if (upscaleImage && workflow[upscaleImage]) {
      workflow[upscaleImage].inputs.width = Math.round(settings.imageWidth * upscaleSettings.scale)
      workflow[upscaleImage].inputs.height = Math.round(settings.imageHeight * upscaleSettings.scale)
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

  if (useFaceDetailer) {
    const faceDetailerSettings = effectiveModel?.faceDetailer || DEFAULT_FACE_DETAILER_SETTINGS

    if (!faceDetailerSettings.checkpoint || faceDetailerSettings.checkpoint === 'model.safetensors') {
      return { error: 'FaceDetailer checkpoint not configured in model settings' }
    }

    if (!setNodeCheckpoint(workflow, 'FaceDetailer Checkpoint Loader', faceDetailerSettings.checkpoint)) {
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
      if (useUpscale && upDecode) {
        workflow[fdNodeId].inputs.image = [upDecode, 0]
      } else if (!useUpscale && baseDecode) {
        workflow[fdNodeId].inputs.image = [baseDecode, 0]
      }
    }
  }

  return null
}

export async function buildWorkflowForPrompts(
  positive: string,
  negative: string,
  settings: Settings,
  checkpoint: string,
  useUpscale: boolean,
  useFaceDetailer: boolean
): Promise<ComfyUIWorkflow> {
  const rawPositiveText = positive.trim()
  const rawNegativeText = negative.trim()
  const modelSettings = getEffectiveModelSettings(settings, checkpoint)
  const qualityPrefix = (modelSettings?.qualityPrefix || '').trim()
  const negativePrefix = (modelSettings?.negativePrefix || '').trim()
  const positiveText = [qualityPrefix, rawPositiveText].filter((text) => text.length > 0).join(', ')
  const negativeText = [negativePrefix, rawNegativeText].filter((text) => text.length > 0).join(', ')
  const modelType = modelSettings?.modelType || 'sdxl'

  switch (modelType) {
    case 'qwen':
      return buildQwenWorkflow(
        positiveText,
        negativeText,
        settings,
        checkpoint,
        useUpscale,
        useFaceDetailer,
        modelSettings
      )
    case 'chroma':
      return buildChromaWorkflow(
        positiveText,
        negativeText,
        settings,
        checkpoint,
        useUpscale,
        useFaceDetailer,
        modelSettings
      )
    case 'flux1_krea':
      return buildFlux1KreaWorkflow(
        positiveText,
        negativeText,
        settings,
        checkpoint,
        useUpscale,
        useFaceDetailer,
        modelSettings
      )
    case 'sdxl':
    default:
      return buildSdxlWorkflow(
        positiveText,
        negativeText,
        settings,
        checkpoint,
        useUpscale,
        useFaceDetailer,
        modelSettings
      )
  }
}

export interface SubmitWorkflowForPromptsResult {
  promptId: string
  clientId: string
  workflow: ComfyUIWorkflow
}

export async function submitWorkflowForPrompts(
  positive: string,
  negative: string,
  settings: Settings,
  checkpoint: string,
  useUpscale: boolean,
  useFaceDetailer: boolean,
  clientId?: string
): Promise<SubmitWorkflowForPromptsResult> {
  const workflow = await buildWorkflowForPrompts(
    positive,
    negative,
    settings,
    checkpoint,
    useUpscale,
    useFaceDetailer
  )

  const resolvedClientId = clientId ?? generateClientId()
  const comfyBase = normalizeBaseUrl(settings.comfyUrl)
  const response = await fetch(buildComfyHttpUrl(comfyBase, 'prompt'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: workflow,
      client_id: resolvedClientId
    })
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(
      `ComfyUI prompt submission failed (${response.status}): ${errorText || response.statusText}`
    )
  }

  const result = await response.json().catch(() => null)
  const promptId = typeof result?.prompt_id === 'string' ? result.prompt_id : null
  if (!promptId) {
    throw new Error('ComfyUI response missing prompt_id')
  }

  return {
    promptId,
    clientId: resolvedClientId,
    workflow
  }
}

async function buildSdxlWorkflow(
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
    getDefaultWorkflowForModelType('sdxl')

  let workflow: ComfyUIWorkflow
  try {
    workflow = await loadCustomWorkflow(workflowPath)
  } catch {
    workflow = JSON.parse(JSON.stringify(defaultWorkflowPrompt))
  }

  setRequiredNodeText(workflow, 'CLIP Text Encode (All)', positiveText)
  setRequiredNodeText(workflow, 'CLIP Text Encode (Negative)', negativeText)

  setNodeTextInput(workflow, 'CLIP Text Encode (Zone1)', positiveText)
  setNodeTextInput(workflow, 'CLIP Text Encode (Zone2)', '')
  if (useUpscale) {
    setRequiredNodeText(workflow, 'Upscale CLIP Text Encode (Positive)', positiveText)
    setRequiredNodeText(workflow, 'Upscale CLIP Text Encode (Negative)', negativeText)
  }

  if (useFaceDetailer) {
    setRequiredNodeText(workflow, 'FaceDetailer CLIP Text Encode (Positive)', positiveText)
    setRequiredNodeText(workflow, 'FaceDetailer CLIP Text Encode (Negative)', negativeText)
    const faceDetailerNode = findNodeByTitle(workflow, 'FaceDetailer')
    if (faceDetailerNode && workflow[faceDetailerNode.nodeId]) {
      const inputs = workflow[faceDetailerNode.nodeId].inputs
      if (Object.prototype.hasOwnProperty.call(inputs, 'wildcard')) {
        inputs.wildcard = positiveText
      }
    }
  }

  const appliedSettings = applyPerModelOverrides(settings, checkpoint)
  const effectiveLoras = getEffectiveLoras(settings, checkpoint, [])
  const loraResult = generateLoraChain(effectiveLoras, workflow, appliedSettings.clipSkip)
  if (loraResult.error) {
    throw new Error(loraResult.error)
  }

  const configureResult = configureWorkflowForPrompts(
    workflow,
    appliedSettings,
    checkpoint,
    useUpscale,
    useFaceDetailer
  )
  if (configureResult) {
    throw new Error(configureResult.error)
  }

  if (!setNodeClipSkip(workflow, 'CLIP Set Last Layer', appliedSettings.clipSkip)) {
    throw new Error('Workflow node not found: CLIP Set Last Layer')
  }

  attachSaveImageNode(workflow, useUpscale, useFaceDetailer)

  return workflow
}

function setInput(workflow: ComfyUIWorkflow, sourceTitle: string, sourceOutputIndex: number, targetTitle: string, targetInputName: string): void {
  const sourceNode = findNodeByTitle(workflow, sourceTitle)
  const targetNode = findNodeByTitle(workflow, targetTitle)
  if (sourceNode && targetNode) {
    workflow[targetNode.nodeId].inputs[targetInputName] = [sourceNode.nodeId, sourceOutputIndex]
  } else {
    throw new Error(`Failed to assign input from ${sourceTitle} to ${targetTitle}: node not found`)
  }
}

function copyInput(workflow: ComfyUIWorkflow, source: string, inputName: string, target: string): void {
  const sourceNode = findNodeByTitle(workflow, source)
  const targetNode = findNodeByTitle(workflow, target)
  if (sourceNode && targetNode) {
    workflow[targetNode.nodeId].inputs[inputName] = workflow[sourceNode.nodeId].inputs[inputName]
  } else {
    throw new Error(`Failed to copy input from ${source} to ${target}: node not found`)
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
    if (node.class_type === 'LoraLoaderModelOnly' || node.class_type === 'PreviewImage') {
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
  const loraError = applyQwenLoraChain(workflow, effectiveLoras)
  if (loraError) {
    throw new Error(loraError)
  }
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

      setRequiredNodeInput(workflow, 'FaceDetailer Checkpoint Loader (SDXL)', 'ckpt_name', resolvedFdCkpt)
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
      if (upscaleSettings.selectedVae === '__embedded__') {
        setInput(workflow, 'Upscale Checkpoint Loader (SDXL)', 2, 'VAE Encode (Tiled)', 'model')
        setInput(workflow, 'Upscale Checkpoint Loader (SDXL)', 2, 'VAE Decode (Tiled)', 'model')
      } else {
        setInput(workflow, 'Upscale VAE Loader (SDXL)', 0, 'VAE Encode (Tiled)', 'vae')
        setInput(workflow, 'Upscale VAE Loader (SDXL)', 0, 'VAE Decode (Tiled)', 'vae')
        const resolvedUpscaleVae =
          upscaleSettings.selectedVae || 'fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors'
        setRequiredNodeInput(workflow, 'Upscale VAE Loader (SDXL)', 'vae_name', resolvedUpscaleVae)
      }
      setRequiredNodeInput(workflow, 'Upscale Checkpoint Loader (SDXL)', 'ckpt_name', resolvedUpscaleUnet)
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

async function buildChromaWorkflow(
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
    getDefaultWorkflowForModelType('chroma')

  let workflow: ComfyUIWorkflow
  try {
    workflow = await loadCustomWorkflow(workflowPath)
  } catch {
    workflow = JSON.parse(JSON.stringify(defaultWorkflowPrompt))
  }

  setRequiredNodeText(workflow, 'CLIP Text Encode (Positive Prompt)', positiveText)
  setRequiredNodeText(workflow, 'CLIP Text Encode (Negative Prompt)', negativeText)

  if (useUpscale) {
    setRequiredNodeText(workflow, 'Upscale CLIP Text Encode (Positive)', positiveText)
    setRequiredNodeText(workflow, 'Upscale CLIP Text Encode (Negative)', negativeText)
  }

  if (useFaceDetailer) {
    setRequiredNodeText(workflow, 'FaceDetailer CLIP Text Encode (Positive)', positiveText)
    setRequiredNodeText(workflow, 'FaceDetailer CLIP Text Encode (Negative)', negativeText)
  }

  const appliedSettings = applyPerModelOverrides(settings, checkpoint)
  const effectiveLoras = getEffectiveLoras(settings, checkpoint, [])
  const loraResult = generateLoraChain(effectiveLoras, workflow, appliedSettings.clipSkip)
  if (loraResult.error) {
    throw new Error(loraResult.error)
  }
  setNodeImageSize(workflow, 'Empty Latent Image', appliedSettings.imageWidth, appliedSettings.imageHeight)

  const scheduler = modelSettings?.scheduler || 'simple'
  setNodeSampler(workflow, 'BasicScheduler', { steps: appliedSettings.steps, scheduler })
  setNodeSampler(workflow, 'CFGGuider', { cfg: appliedSettings.cfgScale })
  setNodeSampler(workflow, 'KSampler', {
    steps: appliedSettings.steps,
    cfg: appliedSettings.cfgScale,
    sampler_name: appliedSettings.sampler,
    scheduler
  })
  setNodeSampler(workflow, 'KSampler (Chroma)', {
    steps: appliedSettings.steps,
    cfg: appliedSettings.cfgScale,
    sampler_name: appliedSettings.sampler,
    scheduler
  })

  if (checkpoint) {
    setNodeCheckpoint(workflow, 'Load Checkpoint', checkpoint)
  }

  attachSaveImageNode(workflow, useUpscale, useFaceDetailer)

  return workflow
}

async function buildFlux1KreaWorkflow(
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
    getDefaultWorkflowForModelType('flux1_krea')

  let workflow: ComfyUIWorkflow
  try {
    workflow = await loadCustomWorkflow(workflowPath)
  } catch (error) {
    throw new Error(
      `Failed to load Flux1 Krea workflow '${workflowPath}': ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    )
  }

  setRequiredNodeText(workflow, 'CLIP Text Encode (Positive)', positiveText)

  if (useUpscale) {
    setRequiredNodeText(workflow, 'Upscale CLIP Text Encode (Positive)', positiveText)
    setRequiredNodeText(workflow, 'Upscale CLIP Text Encode (Negative)', negativeText)
  }

  if (useFaceDetailer) {
    setRequiredNodeText(workflow, 'FaceDetailer CLIP Text Encode (Positive)', positiveText)
    setRequiredNodeText(workflow, 'FaceDetailer CLIP Text Encode (Negative)', negativeText)
  }

  const appliedSettings = applyPerModelOverrides(settings, checkpoint)
  const effectiveLoras = getEffectiveLoras(settings, checkpoint, [])
  const loraResult = generateLoraChain(effectiveLoras, workflow, appliedSettings.clipSkip)
  if (loraResult.error) {
    throw new Error(loraResult.error)
  }
  setNodeImageSize(workflow, 'EmptySD3LatentImage', appliedSettings.imageWidth, appliedSettings.imageHeight)

  const scheduler = modelSettings?.scheduler || 'simple'
  setNodeSampler(workflow, 'KSampler', {
    steps: appliedSettings.steps,
    cfg: appliedSettings.cfgScale,
    sampler_name: appliedSettings.sampler,
    scheduler
  })

  if (checkpoint) {
    const unetNode = findNodeByTitle(workflow, 'Load Diffusion Model')
    if (!unetNode) {
      throw new Error('Load Diffusion Model node not found in Flux1 Krea workflow')
    }
    workflow[unetNode.nodeId].inputs.unet_name = checkpoint
  }

  const vaeNode = findNodeByTitle(workflow, 'Load VAE (Base)')
  if (vaeNode && workflow[vaeNode.nodeId]) {
    const selectedVae =
      appliedSettings.selectedVae && appliedSettings.selectedVae !== '__embedded__'
        ? appliedSettings.selectedVae
        : workflow[vaeNode.nodeId].inputs.vae_name
    if (selectedVae) {
      workflow[vaeNode.nodeId].inputs.vae_name = selectedVae
    }
  }

  attachSaveImageNode(workflow, useUpscale, useFaceDetailer)

  return workflow
}

function attachSaveImageNode(
  workflow: ComfyUIWorkflow,
  useUpscale: boolean,
  useFaceDetailer: boolean
): void {
  const upscaleDecodeNode = findNodeByTitle(workflow, 'VAE Decode (Tiled)')
  const baseDecodeNode = findNodeByTitle(workflow, 'VAE Decode')
  if (!baseDecodeNode) {
    throw new Error('Workflow node not found: VAE Decode')
  }

  let imageSourceNodeId: string | null = null

  if (useFaceDetailer) {
    const faceDetailerNode = findNodeByTitle(workflow, 'FaceDetailer')
    if (!faceDetailerNode) {
      throw new Error('Workflow node not found: FaceDetailer')
    }
    if (workflow[faceDetailerNode.nodeId]) {
      const fdInputs = workflow[faceDetailerNode.nodeId].inputs
      if (useUpscale) {
        if (!upscaleDecodeNode) {
          throw new Error('Workflow node not found: VAE Decode (Tiled) for FaceDetailer')
        }
        fdInputs.image = [upscaleDecodeNode.nodeId, 0]
      } else {
        fdInputs.image = [baseDecodeNode.nodeId, 0]
      }
    }
    imageSourceNodeId = faceDetailerNode.nodeId
  } else {
    if (useUpscale) {
      if (!upscaleDecodeNode) {
        throw new Error('Workflow node not found: VAE Decode (Tiled)')
      }
      imageSourceNodeId = upscaleDecodeNode.nodeId
    } else {
      imageSourceNodeId = baseDecodeNode.nodeId
    }
  }

  if (!imageSourceNodeId) {
    throw new Error('Workflow node not found for final image output')
  }

  workflow[FINAL_SAVE_NODE_ID] = {
    inputs: { images: [imageSourceNodeId, 0] },
    class_type: 'SaveImageWebsocket',
    _meta: { title: 'Final Save Image Websocket' }
  }
  console.log('workflow after attaching save node:', workflow)
}

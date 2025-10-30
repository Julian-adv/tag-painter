import {
  defaultWorkflowPrompt,
  generateLoraChain
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

function setRequiredNodeText(
  workflow: ComfyUIWorkflow,
  title: string,
  text: string
): void {
  if (setNodeTextInput(workflow, title, text)) {
    return
  }
  throw new Error(`Workflow node not found: "${title}"`)
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

  return workflow
}

export async function buildWorkflowForPrompts(
  positive: string,
  negative: string,
  settings: Settings,
  checkpoint: string,
  useUpscale: boolean,
  useFaceDetailer: boolean
): Promise<ComfyUIWorkflow> {
  const positiveText = positive.trim()
  const negativeText = negative.trim()
  const modelSettings = getEffectiveModelSettings(settings, checkpoint)
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

async function buildQwenWorkflow(
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
    workflow = JSON.parse(JSON.stringify(qwenWorkflowPrompt))
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

  const appliedSettings = applyPerModelOverrides(settings, checkpoint)
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
    if (!unetNode) {
      throw new Error('Load Qwen UNet node not found in workflow')
    }
    workflow[unetNode.nodeId].inputs.unet_name = checkpoint
  }

  const vaeNode = findNodeByTitle(workflow, 'Load Qwen VAE')
  if (vaeNode && workflow[vaeNode.nodeId]) {
    const selectedVae =
      appliedSettings.selectedVae && appliedSettings.selectedVae !== '__embedded__'
        ? appliedSettings.selectedVae
        : workflow[vaeNode.nodeId].inputs.vae_name
    if (selectedVae) {
      workflow[vaeNode.nodeId].inputs.vae_name = selectedVae
    }
  }

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

  return workflow
}

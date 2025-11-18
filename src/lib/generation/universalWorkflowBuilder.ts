import type {
  Settings,
  ModelSettings,
  ComfyUIWorkflow,
  ModelType,
  LoraWithWeight
} from '$lib/types'
import { RefineMode, FaceDetailerMode } from '$lib/types'
import {
  loadCustomWorkflow,
  setRequiredNodeInput,
  findNodeByTitle,
  findNodesByTitle
} from './workflowMapping'
import { FINAL_SAVE_NODE_ID } from './workflow'

// Map ModelType string values to numeric enum values
const MODEL_TYPE_MAP: Record<ModelType, number> = {
  sdxl: 1,
  qwen: 2,
  qwen_nunchaku: 3,
  flux1_krea: 4,
  chroma: 5
}

export async function buildWorkflow(
  allTagsText: string,
  zone1TagsText: string,
  zone2TagsText: string,
  negativeText: string,
  settings: Settings,
  checkpoint: string,
  refineMode: RefineMode,
  faceDetailerMode: FaceDetailerMode,
  useFilmgrain: boolean,
  modelSettings: ModelSettings,
  maskImagePath: string | null,
  seed: number,
  disabledZones: Set<string>
): Promise<ComfyUIWorkflow> {
  // Load the universal workflow
  const workflow = await loadCustomWorkflow('universal.api.workflow.json')

  // Set the Model type node
  const modelTypeValue = MODEL_TYPE_MAP[modelSettings.modelType]
  setRequiredNodeInput(workflow, 'Model type', 'value', modelTypeValue)

  // Map each model type to its checkpoint loader node and input key
  const checkpointLoaderMap: Record<ModelType, { node: string; key: string }> = {
    sdxl: { node: 'Load Checkpoint', key: 'ckpt_name' },
    qwen: { node: 'Load Diffusion Model', key: 'unet_name' },
    qwen_nunchaku: { node: 'Nunchaku Qwen-Image DiT Loader', key: 'model_name' },
    chroma: { node: 'Load Qwen Checkpoint', key: 'ckpt_name' },
    flux1_krea: { node: 'Load Diffusion Model (flux1-krea)', key: 'unet_name' }
  }

  const checkpointLoader = checkpointLoaderMap[modelSettings.modelType]
  setRequiredNodeInput(workflow, checkpointLoader.node, checkpointLoader.key, checkpoint)

  // Set refine mode
  setRequiredNodeInput(workflow, 'Refine mode', 'value', refineMode)
  // Set FaceDetailer mode
  setRequiredNodeInput(workflow, 'FaceDetailer mode', 'value', faceDetailerMode)

  setRequiredNodeInput(workflow, 'KSampler (base)', 'sampler_name', modelSettings.sampler)
  setRequiredNodeInput(workflow, 'KSampler (base)', 'scheduler', modelSettings.scheduler)
  setRequiredNodeInput(workflow, 'KSampler (base)', 'steps', modelSettings.steps)
  setRequiredNodeInput(workflow, 'KSampler (base)', 'cfg', modelSettings.cfgScale)
  if (refineMode === RefineMode.refine) {
    setRequiredNodeInput(
      workflow,
      'KSampler (refine)',
      'sampler_name',
      modelSettings.upscale.sampler
    )
    setRequiredNodeInput(
      workflow,
      'KSampler (refine)',
      'scheduler',
      modelSettings.upscale.scheduler
    )
    setRequiredNodeInput(workflow, 'KSampler (refine)', 'steps', modelSettings.upscale.steps)
    setRequiredNodeInput(workflow, 'KSampler (refine)', 'cfg', modelSettings.upscale.cfgScale)
    setRequiredNodeInput(workflow, 'KSampler (refine)', 'denoise', modelSettings.upscale.denoise)
  } else if (refineMode === RefineMode.refine_sdxl) {
    setRequiredNodeInput(
      workflow,
      'KSampler (refine sdxl)',
      'sampler_name',
      modelSettings.upscale.sampler
    )
    setRequiredNodeInput(
      workflow,
      'KSampler (refine sdxl)',
      'scheduler',
      modelSettings.upscale.scheduler
    )
    setRequiredNodeInput(workflow, 'KSampler (refine sdxl)', 'steps', modelSettings.upscale.steps)
    setRequiredNodeInput(workflow, 'KSampler (refine sdxl)', 'cfg', modelSettings.upscale.cfgScale)
    setRequiredNodeInput(
      workflow,
      'KSampler (refine sdxl)',
      'denoise',
      modelSettings.upscale.denoise
    )
    setRequiredNodeInput(
      workflow,
      'Load VAE (refine)',
      'vae_name',
      modelSettings.upscale.selectedVae
    )
  }

  if (faceDetailerMode === FaceDetailerMode.face_detail) {
    setRequiredNodeInput(workflow, 'Detailer (SEGS)', 'steps', modelSettings.faceDetailer.steps)
    setRequiredNodeInput(workflow, 'Detailer (SEGS)', 'cfg', modelSettings.faceDetailer.cfgScale)
    setRequiredNodeInput(
      workflow,
      'Detailer (SEGS)',
      'sampler_name',
      modelSettings.faceDetailer.sampler
    )
    setRequiredNodeInput(
      workflow,
      'Detailer (SEGS)',
      'scheduler',
      modelSettings.faceDetailer.scheduler
    )
    setRequiredNodeInput(workflow, 'Detailer (SEGS)', 'denoise', modelSettings.faceDetailer.denoise)
  } else if (faceDetailerMode === FaceDetailerMode.face_detail_sdxl) {
    setRequiredNodeInput(
      workflow,
      'Load Checkpoint (FaceDetail)',
      'ckpt_name',
      modelSettings.faceDetailer.checkpoint
    )
    setRequiredNodeInput(
      workflow,
      'Detailer (SEGS) (sdxl)',
      'steps',
      modelSettings.faceDetailer.steps
    )
    setRequiredNodeInput(
      workflow,
      'Detailer (SEGS) (sdxl)',
      'cfg',
      modelSettings.faceDetailer.cfgScale
    )
    setRequiredNodeInput(
      workflow,
      'Detailer (SEGS) (sdxl)',
      'sampler_name',
      modelSettings.faceDetailer.sampler
    )
    setRequiredNodeInput(
      workflow,
      'Detailer (SEGS) (sdxl)',
      'scheduler',
      modelSettings.faceDetailer.scheduler
    )
    setRequiredNodeInput(
      workflow,
      'Detailer (SEGS) (sdxl)',
      'denoise',
      modelSettings.faceDetailer.denoise
    )
  }

  // Set film grain mode
  setRequiredNodeInput(workflow, 'Film grain mode', 'value', useFilmgrain)

  // Set prompts
  if (modelSettings.modelType === 'sdxl') {
    setRequiredNodeInput(workflow, 'Positive prompt', 'value', allTagsText)
    const zone1Text = disabledZones.has('zone1') ? '' : zone1TagsText
    const zone2Text = disabledZones.has('zone2') ? '' : zone2TagsText
    setRequiredNodeInput(workflow, 'CLIP Text Encode (Left)', 'text', zone1Text)
    setRequiredNodeInput(workflow, 'CLIP Text Encode (Right)', 'text', zone2Text)
  } else {
    const promptParts = [
      allTagsText,
      disabledZones.has('zone1') ? '' : zone1TagsText,
      disabledZones.has('zone2') ? '' : zone2TagsText
    ]
    const promptText = promptParts.filter((text) => text && text.trim().length > 0).join(' BREAK ')

    setRequiredNodeInput(workflow, 'Positive prompt', 'value', promptText)
  }
  setRequiredNodeInput(workflow, 'Negative prompt', 'value', negativeText)

  setRequiredNodeInput(workflow, 'Detailer (SEGS)', 'seed', seed)
  setRequiredNodeInput(workflow, 'Detailer (SEGS) (sdxl)', 'seed', seed)
  setRequiredNodeInput(workflow, 'KSampler (base)', 'seed', seed)
  setRequiredNodeInput(workflow, 'KSampler (refine)', 'seed', seed)
  setRequiredNodeInput(workflow, 'KSampler (refine sdxl)', 'seed', seed)

  setRequiredNodeInput(workflow, 'Empty Latent Image', 'width', settings.imageWidth)
  setRequiredNodeInput(workflow, 'Empty Latent Image', 'height', settings.imageHeight)
  if (refineMode !== RefineMode.none) {
    const upscaleScale = modelSettings.upscale.scale
    const upscaleWidth = Math.round(settings.imageWidth * upscaleScale)
    const upscaleHeight = Math.round(settings.imageHeight * upscaleScale)
    setRequiredNodeInput(workflow, 'Upscale Image', 'width', upscaleWidth)
    setRequiredNodeInput(workflow, 'Upscale Image', 'height', upscaleHeight)
  }

  // Handle embedded VAE for SDXL models
  if (modelSettings.modelType === 'sdxl') {
    const useEmbeddedVae = modelSettings.selectedVae === '__embedded__'
    setRequiredNodeInput(workflow, 'Use embedded VAE', 'value', useEmbeddedVae)

    // Set CLIP Skip for SDXL models
    setRequiredNodeInput(
      workflow,
      'CLIP Set Last Layer',
      'stop_at_clip_layer',
      -modelSettings.clipSkip
    )

    if (!useEmbeddedVae && modelSettings.selectedVae) {
      setRequiredNodeInput(workflow, 'Load VAE (sdxl)', 'vae_name', modelSettings.selectedVae)
    }
    if (maskImagePath) {
      setRequiredNodeInput(workflow, 'Load Image', 'image', maskImagePath)
    }
  }

  if (modelSettings.loras.length > 0) {
    if (modelSettings.modelType === 'qwen') {
      configureQwenPowerLoraLoader(workflow, modelSettings.loras)
    } else if (modelSettings.modelType === 'qwen_nunchaku') {
      const loraStackNode = 'Nunchaku Qwen Image LoRA Stack'
      setRequiredNodeInput(workflow, loraStackNode, 'lora_count', modelSettings.loras.length)

      modelSettings.loras.forEach((lora, index) => {
        const loraIndex = index + 1
        setRequiredNodeInput(workflow, loraStackNode, `lora_name_${loraIndex}`, lora.name)
        setRequiredNodeInput(workflow, loraStackNode, `lora_strength_${loraIndex}`, lora.weight)
      })

      // Set remaining LoRA slots to None (up to 10 total slots)
      for (let i = modelSettings.loras.length + 1; i <= 10; i++) {
        setRequiredNodeInput(workflow, loraStackNode, `lora_name_${i}`, 'None')
      }
    }
  }

  // Handle VAE settings for qwen and qwen_nunchaku models
  if (
    (modelSettings.modelType === 'qwen' || modelSettings.modelType === 'qwen_nunchaku') &&
    modelSettings.selectedVae &&
    modelSettings.selectedVae !== '__embedded__'
  ) {
    setRequiredNodeInput(workflow, 'Load Qwen VAE', 'vae_name', modelSettings.selectedVae)
  }

  if (modelSettings.modelType === 'flux1_krea' && modelSettings.selectedVae) {
    setRequiredNodeInput(workflow, 'Load VAE (flux1)', 'vae_name', modelSettings.selectedVae)
  }

  for (const [nodeId, node] of Object.entries(workflow)) {
    if (node._meta?.title === 'Preview Image') {
      delete workflow[nodeId]
    }
  }

  const imageSourceNodeId = findNodeByTitle(
    workflow,
    'ImpactConditionalBranch (film grain)'
  )?.nodeId
  if (!imageSourceNodeId) {
    throw new Error('Failed to find image source node: ImpactConditionalBranch (film grain)')
  }
  workflow[FINAL_SAVE_NODE_ID] = {
    inputs: { images: [imageSourceNodeId, 0] },
    class_type: 'SaveImageWebsocket',
    _meta: { title: 'Final Save Image Websocket' }
  }

  return workflow
}

function configureQwenPowerLoraLoader(workflow: ComfyUIWorkflow, loras: LoraWithWeight[]): void {
  const powerLoraLoaderNode = findNodeByTitle(workflow, 'Power Lora Loader (rgthree)')
  if (!powerLoraLoaderNode) {
    throw new Error('Workflow must contain "Power Lora Loader (rgthree)" node')
  }

  const { nodeId } = powerLoraLoaderNode
  const node = workflow[nodeId]

  // Initialize the inputs with the header widget
  const inputs: Record<
    string,
    string | number | boolean | [string, number] | Record<string, unknown>
  > = {
    PowerLoraLoaderHeaderWidget: {
      type: 'PowerLoraLoaderHeaderWidget'
    }
  }

  // Add each LoRA to the inputs
  loras.forEach((lora, index) => {
    const loraIndex = index + 1
    inputs[`lora_${loraIndex}`] = {
      on: true,
      lora: lora.name,
      strength: lora.weight
    }
  })

  // Add the "➕ Add Lora" field
  inputs['➕ Add Lora'] = ''

  // Preserve model and clip inputs if they exist
  if (node.inputs?.model) {
    inputs.model = node.inputs.model
  }
  if (node.inputs?.clip) {
    inputs.clip = node.inputs.clip
  }

  // Update the node inputs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workflow[nodeId].inputs = inputs as any
}

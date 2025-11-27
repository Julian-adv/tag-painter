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
import {
  FINAL_SAVE_NODE_ID,
  INTERMEDIATE_SAVE_NODE_ID,
  INTERMEDIATE_SAVE_NODE_ID_2
} from './workflow'

// Map ModelType string values to numeric enum values
const MODEL_TYPE_MAP: Record<ModelType, number> = {
  sdxl: 1,
  qwen: 2,
  qwen_nunchaku: 3,
  flux1_krea: 4,
  chroma: 5,
  z_image: 2
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
    flux1_krea: { node: 'Load Diffusion Model (flux1-krea)', key: 'unet_name' },
    z_image: { node: 'Load Diffusion Model', key: 'unet_name' }
  }

  const checkpointLoader = checkpointLoaderMap[modelSettings.modelType]
  setRequiredNodeInput(workflow, checkpointLoader.node, checkpointLoader.key, checkpoint)

  if (modelSettings.modelType === 'z_image') {
    setRequiredNodeInput(workflow, 'Load CLIP (qwen)', 'clip_name', 'qwen_3_4b.safetensors')
    setRequiredNodeInput(workflow, 'Load CLIP (qwen)', 'type', 'lumina2')
    setRequiredNodeInput(workflow, 'Load Qwen VAE', 'vae_name', 'ae.safetensors')
  } else {
    setRequiredNodeInput(
      workflow,
      'Load CLIP (qwen)',
      'clip_name',
      'qwen_2.5_vl_7b_fp8_scaled.safetensors'
    )
    setRequiredNodeInput(workflow, 'Load CLIP (qwen)', 'type', 'qwen_image')
    setRequiredNodeInput(workflow, 'Load Qwen VAE', 'vae_name', 'qwen_image_vae.safetensors')
  }

  // Set refine mode
  setRequiredNodeInput(workflow, 'Refine mode', 'value', refineMode)
  // Set FaceDetailer mode
  setRequiredNodeInput(workflow, 'FaceDetailer mode', 'value', faceDetailerMode)

  setRequiredNodeInput(workflow, 'KSampler (base)', 'sampler_name', modelSettings.sampler)
  setRequiredNodeInput(workflow, 'KSampler (base)', 'scheduler', modelSettings.scheduler)
  setRequiredNodeInput(workflow, 'KSampler (base)', 'steps', modelSettings.steps)
  setRequiredNodeInput(workflow, 'KSampler (base)', 'cfg', modelSettings.cfgScale)
  setRequiredNodeInput(
    workflow,
    'Load Checkpoint (Refine)',
    'ckpt_name',
    modelSettings.upscale.checkpoint
  )
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

  const faceDetailerPrompt = `[ASC] ${zone1TagsText} [SEP] ${zone2TagsText} [SEP]`
  if (faceDetailerMode === FaceDetailerMode.face_detail) {
    setRequiredNodeInput(workflow, 'Detailer (SEGS)', 'seed', seed)
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
    setRequiredNodeInput(workflow, 'Detailer (SEGS)', 'wildcard', faceDetailerPrompt)
  } else if (faceDetailerMode === FaceDetailerMode.face_detail_sdxl) {
    setRequiredNodeInput(
      workflow,
      'Load Checkpoint (FaceDetail)',
      'ckpt_name',
      modelSettings.faceDetailer.checkpoint
    )
    setRequiredNodeInput(workflow, 'Detailer (SEGS) (sdxl)', 'seed', seed)
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
    setRequiredNodeInput(workflow, 'Detailer (SEGS) (sdxl)', 'wildcard', faceDetailerPrompt)
  }

  // Set film grain mode
  setRequiredNodeInput(workflow, 'Film grain mode', 'value', useFilmgrain)

  // Set prompts
  let positivePromptValue = ''
  if (modelSettings.modelType === 'sdxl') {
    positivePromptValue = allTagsText
    setRequiredNodeInput(workflow, 'Positive prompt', 'value', positivePromptValue)
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
    positivePromptValue = promptParts
      .filter((text) => text && text.trim().length > 0)
      .join(' BREAK ')

    setRequiredNodeInput(workflow, 'Positive prompt', 'value', positivePromptValue)
  }
  setRequiredNodeInput(workflow, 'Negative prompt', 'value', negativeText)

  setRequiredNodeInput(workflow, 'KSampler (base)', 'seed', seed)
  setRequiredNodeInput(workflow, 'KSampler (refine)', 'seed', seed)
  setRequiredNodeInput(workflow, 'KSampler (refine sdxl)', 'seed', seed)

  setRequiredNodeInput(workflow, 'SolidMask', 'width', settings.imageWidth)
  setRequiredNodeInput(workflow, 'SolidMask', 'height', settings.imageHeight)
  setRequiredNodeInput(workflow, 'SolidMask (h-base)', 'width', settings.imageWidth)
  setRequiredNodeInput(workflow, 'SolidMask (h-base)', 'height', settings.imageHeight)
  setRequiredNodeInput(workflow, 'SolidMask (h-half)', 'width', settings.imageWidth / 2)
  setRequiredNodeInput(workflow, 'SolidMask (h-half)', 'height', settings.imageHeight)
  setRequiredNodeInput(workflow, 'MaskComposite', 'x', settings.imageWidth / 2)
  setRequiredNodeInput(workflow, 'MaskComposite', 'y', 0)
  setRequiredNodeInput(workflow, 'width', 'value', settings.imageWidth)
  setRequiredNodeInput(workflow, 'height', 'value', settings.imageHeight)
  setRequiredNodeInput(workflow, 'scale', 'value', modelSettings.upscale.scale)

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

  const availableLoras = await fetchAvailableLorasSafe()
  const promptLoras = extractLorasFromPrompt(positivePromptValue, availableLoras)
  const effectiveLoras = mergeLoras(modelSettings.loras, promptLoras)

  if (effectiveLoras.length > 0) {
    if (modelSettings.modelType === 'qwen') {
      configureQwenPowerLoraLoader(workflow, effectiveLoras)
    } else if (modelSettings.modelType === 'qwen_nunchaku') {
      const loraStackNode = 'Nunchaku Qwen Image LoRA Stack'
      setRequiredNodeInput(workflow, loraStackNode, 'lora_count', effectiveLoras.length)

      effectiveLoras.forEach((lora, index) => {
        const loraIndex = index + 1
        setRequiredNodeInput(workflow, loraStackNode, `lora_name_${loraIndex}`, lora.name)
        setRequiredNodeInput(workflow, loraStackNode, `lora_strength_${loraIndex}`, lora.weight)
      })

      // Set remaining LoRA slots to None (up to 10 total slots)
      for (let i = effectiveLoras.length + 1; i <= 10; i++) {
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

  // Add intermediate save node for 'VAE Decode (base)' if it exists
  const intermediateNode = findNodeByTitle(workflow, 'VAE Decode (base)')
  if (intermediateNode) {
    workflow[INTERMEDIATE_SAVE_NODE_ID] = {
      inputs: { images: [intermediateNode.nodeId, 0] },
      class_type: 'SaveImageWebsocket',
      _meta: { title: 'Intermediate Save Image Websocket' }
    }
  }

  // Add second intermediate save node for 'Switch (Any) (after_refine)' if it exists
  const intermediateNode2 = findNodeByTitle(workflow, 'Switch (Any) (after_refine)')
  if (intermediateNode2) {
    workflow[INTERMEDIATE_SAVE_NODE_ID_2] = {
      inputs: { images: [intermediateNode2.nodeId, 0] },
      class_type: 'SaveImageWebsocket',
      _meta: { title: 'Intermediate Save Image Websocket 2' }
    }
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

function extractLorasFromPrompt(prompt: string, availableLoras: Set<string>): LoraWithWeight[] {
  const results: LoraWithWeight[] = []
  const availableList = Array.from(availableLoras).map((value) => ({
    original: value,
    lower: value.toLowerCase()
  }))
  const regex = /<lora:([^:>]+)(?::([0-9]*\.?[0-9]+))?>/gi
  let match: RegExpExecArray | null = null
  while ((match = regex.exec(prompt)) !== null) {
    const name = match[1].trim()
    const weightValue = match[2]
    const weight = weightValue !== undefined ? Number.parseFloat(weightValue) : 1
    if (!name || Number.isNaN(weight)) {
      continue
    }
    const nameLower = name.toLowerCase()
    const matched = availableList.find((entry) => entry.lower.includes(nameLower))
    if (!matched) {
      continue
    }
    results.push({ name: matched.original, weight })
  }
  return results
}

async function fetchAvailableLorasSafe(): Promise<Set<string>> {
  try {
    const res = await fetch('/api/loras')
    if (!res.ok) {
      return new Set<string>()
    }
    const data = (await res.json()) as { loras?: unknown }
    if (Array.isArray(data.loras)) {
      const names = data.loras.filter((value): value is string => typeof value === 'string')
      return new Set(names)
    }
  } catch {
    // Ignore and return empty
  }
  return new Set<string>()
}

function mergeLoras(base: LoraWithWeight[], extra: LoraWithWeight[]): LoraWithWeight[] {
  const merged = new Map<string, LoraWithWeight>()
  base.forEach((lora) => merged.set(lora.name, lora))
  extra.forEach((lora) => merged.set(lora.name, lora))
  return Array.from(merged.values())
}

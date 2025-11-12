import type {
  Settings,
  RefineMode,
  FaceDetailerMode,
  ModelSettings,
  ComfyUIWorkflow,
  ModelType
} from '$lib/types'
import { loadCustomWorkflow, setRequiredNodeInput, findNodeByTitle } from './workflowMapping'
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
  positiveText: string,
  negativeText: string,
  settings: Settings,
  checkpoint: string,
  refineMode: RefineMode,
  faceDetailerMode: FaceDetailerMode,
  useFilmgrain: boolean,
  modelSettings: ModelSettings
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

  // Set film grain mode
  setRequiredNodeInput(workflow, 'Film grain mode', 'value', useFilmgrain)

  // Set prompts
  setRequiredNodeInput(workflow, 'Positive prompt', 'value', positiveText)
  setRequiredNodeInput(workflow, 'Negative prompt', 'value', negativeText)
  setRequiredNodeInput(workflow, 'KSamplerSelect (base)', 'sampler_name', settings.sampler)

  setRequiredNodeInput(workflow, 'Empty Latent Image', 'width', settings.imageWidth)
  setRequiredNodeInput(workflow, 'Empty Latent Image', 'height', settings.imageHeight)

  // Handle embedded VAE for SDXL models
  if (modelSettings.modelType === 'sdxl') {
    const useEmbeddedVae = modelSettings.selectedVae === '__embedded__'
    setRequiredNodeInput(workflow, 'Use embedded VAE', 'value', useEmbeddedVae)

    // Set CLIP Skip for SDXL models
    setRequiredNodeInput(
      workflow,
      'CLIP Set Last Layer',
      'stop_at_clip_layer',
      modelSettings.clipSkip
    )
  }

  // Handle LoRA settings for qwen_nunchaku
  if (modelSettings.modelType === 'qwen_nunchaku' && modelSettings.loras.length > 0) {
    const loraStackNode = 'Nunchaku Qwen Image LoRA Stack'
    setRequiredNodeInput(workflow, loraStackNode, 'lora_count', modelSettings.loras.length)

    modelSettings.loras.forEach((lora, index) => {
      const loraIndex = index + 1
      setRequiredNodeInput(workflow, loraStackNode, `lora_name_${loraIndex}`, lora.name)
      setRequiredNodeInput(workflow, loraStackNode, `lora_strength_${loraIndex}`, lora.weight)
    })
  }

  // Handle VAE settings for qwen and qwen_nunchaku models
  if (
    (modelSettings.modelType === 'qwen' || modelSettings.modelType === 'qwen_nunchaku') &&
    modelSettings.selectedVae &&
    modelSettings.selectedVae !== '__embedded__'
  ) {
    setRequiredNodeInput(workflow, 'Load Qwen VAE', 'vae_name', modelSettings.selectedVae)
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

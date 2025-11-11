import type {
  Settings,
  RefineMode,
  FaceDetailerMode,
  ModelSettings,
  ComfyUIWorkflow,
  ModelType
} from '$lib/types'
import { findNodeByTitle, loadCustomWorkflow } from './workflowMapping'

// Map ModelType string values to numeric enum values
const MODEL_TYPE_MAP: Record<ModelType, number> = {
  sdxl: 1,
  qwen: 2,
  chroma: 3,
  flux1_krea: 4
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

  // Find and set the Model type node
  const modelTypeNode = findNodeByTitle(workflow, 'Model type')
  if (modelTypeNode) {
    const modelTypeValue = MODEL_TYPE_MAP[modelSettings.modelType]
    workflow[modelTypeNode.nodeId].inputs.value = modelTypeValue
  }

  return workflow
}

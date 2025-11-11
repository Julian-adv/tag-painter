import type {
  Settings,
  RefineMode,
  FaceDetailerMode,
  ModelSettings,
  ComfyUIWorkflow,
  ModelType
} from '$lib/types'
import { loadCustomWorkflow, setRequiredNodeInput } from './workflowMapping'

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

  return workflow
}

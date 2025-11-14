import type { Settings, ComfyUIWorkflow, RefineMode, FaceDetailerMode } from '$lib/types'
import { getEffectiveModelSettings, generateClientId } from './generationCommon'
import { buildWorkflow } from './universalWorkflowBuilder'
import { buildComfyHttpUrl, normalizeBaseUrl } from './comfyui'

export function getDefaultWorkflowForModelType(modelType: string | undefined): string {
  switch (modelType) {
    case 'qwen':
      return 'qwen.api.workflow.json'
    case 'qwen_nunchaku':
      return 'qwen_nunchaku.api.workflow.json'
    case 'chroma':
      return 'chroma.api.workflow.json'
    case 'flux1_krea':
      return 'flux1_krea.api.workflow.json'
    case 'sdxl':
    default:
      return 'sdxl.api.workflow.json'
  }
}

export async function buildWorkflowForPrompts(
  positive: string,
  negative: string,
  settings: Settings,
  checkpoint: string,
  refineMode: RefineMode,
  faceDetailerMode: FaceDetailerMode,
  useFilmGrain: boolean,
  composition: string = 'left-horizontal',
  maskImagePath: string | null = null
): Promise<ComfyUIWorkflow> {
  const rawPositiveText = positive.trim()
  const rawNegativeText = negative.trim()
  const modelSettings = getEffectiveModelSettings(settings, checkpoint)

  if (!modelSettings) {
    throw new Error('Failed to get model settings')
  }

  const qualityPrefix = (modelSettings.qualityPrefix || '').trim()
  const negativePrefix = (modelSettings.negativePrefix || '').trim()
  const positiveText = [qualityPrefix, rawPositiveText].filter((text) => text.length > 0).join(', ')
  const negativeText = [negativePrefix, rawNegativeText]
    .filter((text) => text.length > 0)
    .join(', ')

  return buildWorkflow(
    positiveText,
    positiveText,
    positiveText,
    negativeText,
    settings,
    checkpoint,
    refineMode,
    faceDetailerMode,
    useFilmGrain,
    modelSettings,
    maskImagePath,
    settings.seed,
    new Set()
  )
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
  refineMode: RefineMode,
  faceDetailerMode: FaceDetailerMode,
  useFilmGrain: boolean,
  composition?: string,
  maskImagePath?: string | null,
  clientId?: string
): Promise<SubmitWorkflowForPromptsResult> {
  const workflow = await buildWorkflowForPrompts(
    positive,
    negative,
    settings,
    checkpoint,
    refineMode,
    faceDetailerMode,
    useFilmGrain,
    composition,
    maskImagePath ?? null
  )
  console.log('Submitting workflow:', workflow)
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

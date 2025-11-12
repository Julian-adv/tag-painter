// Image generation utility functions
//
// This module orchestrates the complete image generation workflow with ComfyUI

import { generateQwenImage } from './qwenImageGeneration'
import { getEffectiveModelSettings } from './generationCommon'
import type { PromptsData, Settings, ProgressData } from '$lib/types'
import { RefineMode, FaceDetailerMode } from '$lib/types'
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
  const { promptsData, settings } = options
  const modelSettings = getEffectiveModelSettings(settings, promptsData.selectedCheckpoint)

  return generateQwenImage(options, modelSettings, refineMode, faceDetailerMode)
}

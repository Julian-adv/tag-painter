// Common type definitions used across the application

// ComfyUI Workflow types
export interface WorkflowNodeInput {
  [key: string]: string | number | boolean | [string, number] | undefined
}

export interface WorkflowNode {
  inputs: WorkflowNodeInput
  class_type: string
  _meta?: {
    title?: string
  }
}

export interface ComfyUIWorkflow {
  [nodeId: string]: WorkflowNode
}

export interface OptionItem {
  title: string
  value: string
}

export interface LoraWithWeight {
  name: string
  weight: number
}

export type ModelType = 'sdxl' | 'qwen'

export interface FaceDetailerSettings {
  checkpoint: string
  steps: number
  cfgScale: number
  sampler: string
  scheduler: string
  denoise: number
  selectedVae: string
}

export interface UpscaleSettings {
  checkpoint: string
  scale: number
  steps: number
  cfgScale: number
  sampler: string
  scheduler: string
  denoise: number
}

export interface ModelSettings {
  qualityPrefix: string
  negativePrefix: string
  loras: LoraWithWeight[]
  cfgScale: number
  steps: number
  sampler: string
  scheduler: string
  selectedVae: string
  clipSkip: number
  modelType: ModelType
  faceDetailer: FaceDetailerSettings
  upscale: UpscaleSettings
}

export interface Settings {
  imageWidth: number
  imageHeight: number
  cfgScale: number
  steps: number
  seed: number
  sampler: string
  comfyUrl: string
  outputDirectory: string
  // VAE selection: '__embedded__' means use checkpoint's embedded VAE
  selectedVae: string
  clipSkip: number
  locale: string
  // Per-model overrides including Default pseudo-model
  perModel: Record<string, ModelSettings>
}

export interface PromptCategory {
  id: string
  name: string
  values: OptionItem[]
  currentValue: OptionItem
  aliasOf?: string // ID of the category this one is an alias of
}

export type TagType = 'regular' | 'sequential' | 'random' | 'consistent-random' | 'root'

export interface CustomTag {
  name: string
  tags: string[]
  type: TagType
  weight?: number // Weight for emphasis/de-emphasis (1.0 = normal, >1.0 = emphasis, <1.0 = de-emphasis)
}

export interface PromptsData {
  categories: PromptCategory[]
  tags: {
    all: string[]
    zone1: string[]
    zone2: string[]
    negative: string[]
    inpainting: string[]
  }
  customTags: Record<string, CustomTag>
  selectedCheckpoint: string | null
  selectedComposition: string
  useUpscale: boolean
  useFaceDetailer: boolean
  selectedLoras: { name: string; weight: number }[]
}

export interface ProgressData {
  value: number
  max: number
  currentNode: string
}

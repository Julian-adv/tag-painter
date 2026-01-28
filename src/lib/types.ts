// Common type definitions used across the application

import type { PromptAnalyzerApiProvider } from './constants'

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

export interface LoraPreset {
  name: string
  loras: LoraWithWeight[]
}

export type ModelType = 'sdxl' | 'qwen' | 'qwen_nunchaku' | 'chroma' | 'flux1_krea' | 'z_image'

export enum ImageStage {
  base = 'base',
  after_refine = 'after_refine',
  final = 'final'
}

export enum RefineMode {
  none = 1,
  upscale_only = 2,
  refine = 3,
  refine_sdxl = 4
}

export enum FaceDetailerMode {
  none = 1,
  face_detail = 2,
  face_detail_sdxl = 3
}

export interface FaceDetailerSettings {
  checkpoint: string
  modelType: ModelType
  steps: number
  cfgScale: number
  sampler: string
  scheduler: string
  denoise: number
  selectedVae: string
}

export interface UpscaleSettings {
  checkpoint: string
  modelType: ModelType
  scale: number
  steps: number
  cfgScale: number
  sampler: string
  scheduler: string
  denoise: number
  selectedVae: string
  saveUpscaleImages: boolean
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
  // Custom workflow file path (optional, relative to data folder)
  customWorkflowPath?: string
  // Custom wildcards file path (optional, defaults to model type specific file)
  wildcardsFile?: string
  // Save base images during generation
  saveBaseImages?: boolean
}

export interface Settings {
  imageWidth: number
  imageHeight: number
  cfgScale: number
  steps: number
  seed: number
  sampler: string
  scheduler: string
  comfyUrl: string
  outputDirectory: string
  geminiApiKey: string
  openRouterApiKey: string
  ollamaBaseUrl: string
  ollamaModel: string
  promptAnalyzerApiProvider: PromptAnalyzerApiProvider
  chatPromptLanguage: 'english' | 'chinese'
  // VAE selection: '__embedded__' means use checkpoint's embedded VAE
  selectedVae: string
  clipSkip: number
  locale: string
  // Per-model overrides including Default pseudo-model
  perModel: Record<string, ModelSettings>
  // Custom workflow file path (optional, relative to data folder)
  customWorkflowPath?: string
  // LoRA presets for quick selection
  loraPresets?: LoraPreset[]
}

export interface BaseGenerationMetadata {
  steps: number
  sampler: string
  scheduler: string
  cfgScale: number
  seed: number
  width: number
  height: number
  model: string
  clipSkip: number
}

export interface SecondaryGenerationMetadata {
  steps: number
  sampler: string
  scheduler: string
  cfgScale: number
  model: string
  scale: number
  denoise: number
}

export interface GenerationMetadataPayload {
  base: BaseGenerationMetadata
  upscale: SecondaryGenerationMetadata | null
  faceDetailer: SecondaryGenerationMetadata | null
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
  tags: {
    all: string[]
    zone1: string[]
    zone2: string[]
    negative: string[]
    inpainting: string[]
  }
  selectedCheckpoint: string
  selectedComposition: string
  selectedLoras: { name: string; weight: number }[]
  useFilmGrain: boolean
  enableRefine: boolean
  enableFaceDetailer: boolean
}

export interface ProgressData {
  value: number
  max: number
  currentNode: string
}

// UI toast message type
export interface Toast {
  id: number
  message: string
  type: 'error' | 'info' | 'success'
}

// Prompt analysis result from Gemini
export interface PromptAnalysis {
  subject: string
  pose: string
  expression: string
  composition: string
  background: string
  lighting: string
  hairStyle: string
  hairColor: string
  eyes: string
  outfit: string
  legwear: string
  footwear: string
  accessories: string
}

// Tag resolution types for nested chip display

/** Hierarchical tag resolution with intermediate expansion steps */
export interface TagResolution {
  /** Final expanded text (e.g., "ponytail blonde") */
  finalText: string
  /** Intermediate text before child placeholders were expanded (e.g., "__hair_style__ __hair_color__") */
  intermediateText?: string
  /** Child tag resolutions */
  children?: Record<string, TagResolution>
}

/** Tag name to resolution map */
export type TagResolutionMap = Record<string, TagResolution>

/** Zone-based resolution map */
export type ZoneTagResolutions = {
  all: TagResolutionMap
  zone1: TagResolutionMap
  zone2: TagResolutionMap
  negative: TagResolutionMap
  inpainting: TagResolutionMap
}

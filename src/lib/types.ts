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

export interface Settings {
  imageWidth: number
  imageHeight: number
  cfgScale: number
  steps: number
  seed: number
  sampler: string
  outputDirectory: string
}

export interface PromptCategory {
  id: string
  name: string
  values: OptionItem[]
  currentValue: OptionItem
  aliasOf?: string // ID of the category this one is an alias of
}

export interface PromptsData {
  categories: PromptCategory[]
  tags: {
    all: string[]
    zone1: string[]
    zone2: string[]
  }
  selectedCheckpoint: string | null
  useUpscale: boolean
  useFaceDetailer: boolean
  selectedLoras: string[]
  loraWeight: number
}

export interface ProgressData {
  value: number
  max: number
  currentNode: string
}
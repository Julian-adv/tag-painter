export const CONSISTENT_RANDOM_MARKER = '=consistent-random'
export const DEFAULT_OUTPUT_DIRECTORY = 'data/output'
export const DEFAULT_ARRAY_WEIGHT = 100
export const DEFAULT_COMFY_URL = 'http://127.0.0.1:8188'
export const DEFAULT_WORKFLOW = 'sdxl.api.workflow.json'

// Default Settings
export const DEFAULT_SETTINGS = {
  imageWidth: 832,
  imageHeight: 1216,
  cfgScale: 4.5,
  steps: 20,
  seed: -1,
  sampler: 'euler_ancestral',
  scheduler: 'simple',
  clipSkip: 2,
  geminiApiKey: '',
  chatPromptLanguage: 'english'
} as const

// Default FaceDetailer settings
export const DEFAULT_FACE_DETAILER_SETTINGS = {
  checkpoint: 'zenijiMixKIllust_v10.safetensors',
  modelType: 'sdxl' as const,
  steps: 20,
  cfgScale: 4.5,
  sampler: 'euler_ancestral',
  scheduler: 'simple',
  denoise: 0.35,
  selectedVae: '__embedded__'
} as const

export const DEFAULT_UPSCALE_SETTINGS = {
  checkpoint: 'zenijiMixKIllust_v10.safetensors',
  modelType: 'sdxl' as const,
  scale: 1.5,
  steps: 20,
  cfgScale: 4.5,
  sampler: 'euler_ancestral',
  scheduler: 'simple',
  denoise: 0.35,
  selectedVae: '__embedded__'
} as const

// Model type specific defaults
export const MODEL_TYPE_DEFAULTS = {
  sdxl: {
    cfgScale: 4.5,
    steps: 20,
    sampler: 'euler_ancestral',
    scheduler: 'simple',
    clipSkip: 2,
    qualityPrefix: '',
    negativePrefix: '',
    wildcardsFile: 'wildcards.yaml'
  },
  qwen: {
    cfgScale: 1.0,
    steps: 20,
    sampler: 'euler',
    scheduler: 'simple',
    clipSkip: 1,
    qualityPrefix: '',
    negativePrefix: '',
    wildcardsFile: 'wildcards_qwen.yaml'
  },
  chroma: {
    cfgScale: 3.5,
    steps: 20,
    sampler: 'euler',
    scheduler: 'simple',
    clipSkip: 2,
    qualityPrefix: '',
    negativePrefix: '',
    wildcardsFile: 'wildcards.yaml'
  },
  flux1_krea: {
    cfgScale: 1.0,
    steps: 20,
    sampler: 'euler',
    scheduler: 'simple',
    clipSkip: 1,
    qualityPrefix: '',
    negativePrefix: '',
    wildcardsFile: 'wildcards.yaml'
  }
} as const

// Placeholder pattern used for __name__ style tags (non-greedy to avoid merging adjacent placeholders)
// Whitespace is intentionally excluded so markers like "__ __" are treated as plain text.
export const PLACEHOLDER_RE_SOURCE = '__([\\p{L}\\p{N}_\\-/]+?)__'
export const PLACEHOLDER_RE_FLAGS = 'gu'
export function createPlaceholderRegex(): RegExp {
  return new RegExp(PLACEHOLDER_RE_SOURCE, PLACEHOLDER_RE_FLAGS)
}

export const CONSISTENT_RANDOM_MARKER = '=consistent-random'
export const DEFAULT_OUTPUT_DIRECTORY = 'data/output'
export const DEFAULT_ARRAY_WEIGHT = 100
export const DEFAULT_COMFY_URL = 'http://127.0.0.1:8188'
export const DEFAULT_WORKFLOW = 'default.workflow.json'

// Default FaceDetailer settings
export const DEFAULT_FACE_DETAILER_SETTINGS = {
  checkpoint: 'zenijiMixKIllust_v10.safetensors',
  modelType: 'sdxl' as const,
  steps: 28,
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
  steps: 15,
  cfgScale: 4.5,
  sampler: 'euler_ancestral',
  scheduler: 'simple',
  denoise: 0.5,
  selectedVae: '__embedded__'
} as const

// Placeholder pattern used for __name__ style tags (non-greedy to avoid merging adjacent placeholders)
// Whitespace is intentionally excluded so markers like "__ __" are treated as plain text.
export const PLACEHOLDER_RE_SOURCE = '__([\\p{L}\\p{N}_\\-/]+?)__'
export const PLACEHOLDER_RE_FLAGS = 'gu'
export function createPlaceholderRegex(): RegExp {
  return new RegExp(PLACEHOLDER_RE_SOURCE, PLACEHOLDER_RE_FLAGS)
}

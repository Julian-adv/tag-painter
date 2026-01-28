export const CONSISTENT_RANDOM_MARKER = '=consistent-random'

// Valid prompt analyzer API providers
export const PROMPT_ANALYZER_API_PROVIDERS = ['gemini', 'openrouter', 'ollama'] as const
export type PromptAnalyzerApiProvider = (typeof PROMPT_ANALYZER_API_PROVIDERS)[number]
export const DEFAULT_OUTPUT_DIRECTORY = 'data/output'
export const DEFAULT_ARRAY_WEIGHT = -1 // -1 means no explicit probability set
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
  openRouterApiKey: '',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.2',
  promptAnalyzerApiProvider: 'gemini',
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
  selectedVae: '__embedded__',
  saveUpscaleImages: false
} as const

// Model type specific defaults
export const MODEL_TYPE_DEFAULTS = {
  sdxl: {
    cfgScale: 4.5,
    steps: 20,
    sampler: 'euler_ancestral',
    scheduler: 'simple',
    clipSkip: 2,
    qualityPrefix:
      '(masterpiece, best quality, highres, photorealistic, cinematic tone, highly detailed, aesthetic, real skin, soft lighting, natural depth of field, film grain, glossy color grading, luxurious and upscale scene, elegant composition, korean fashion photography style, refined attitude, glamorous atmosphere, soft light leaks, cool tone)',
    negativePrefix:
      '(worst quality, low quality, 2d, anime, cartoon, illustration, 3d render, cgi, waxy skin, plastic texture, oily reflection, distorted body, deformed eyes, bad anatomy, extra fingers, text, logo, watermark)',
    wildcardsFile: 'wildcards.yaml',
    customWorkflowPath: 'sdxl.api.workflow.json',
    selectedVae: 'fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors'
  },
  qwen: {
    cfgScale: 1.0,
    steps: 8,
    sampler: 'euler',
    scheduler: 'normal',
    clipSkip: 1,
    qualityPrefix:
      'cinematic lighting, ray tracing reflections, depth of field, ultra detailed textures, 8k resolution, hyperrealistic, dramatic composition',
    negativePrefix:
      'worst quality, low quality, normal quality, freckles, facial wrinkles, old girl, cleft chin',
    wildcardsFile: 'wildcards.new.yaml',
    customWorkflowPath: 'universal.api.workflow.json',
    selectedVae: 'qwen_image_vae.safetensors',
    loras: [
      {
        name: 'qwen/Qwen-Image-Lightning-8steps-V1.1.safetensors',
        weight: 1
      }
    ]
  },
  qwen_nunchaku: {
    cfgScale: 1.0,
    steps: 8,
    sampler: 'euler',
    scheduler: 'normal',
    clipSkip: 1,
    qualityPrefix:
      'cinematic lighting, ray tracing reflections, depth of field, ultra detailed textures, 8k resolution, hyperrealistic, dramatic composition',
    negativePrefix:
      'worst quality, low quality, normal quality, freckles, facial wrinkles, old girl, cleft chin',
    wildcardsFile: 'wildcards.new.yaml',
    customWorkflowPath: 'universal.api.workflow.json',
    selectedVae: 'qwen_image_vae.safetensors',
    loras: []
  },
  chroma: {
    cfgScale: 3.5,
    steps: 20,
    sampler: 'euler',
    scheduler: 'simple',
    clipSkip: 1,
    qualityPrefix: '',
    negativePrefix: '',
    wildcardsFile: 'wildcards.qwen.yaml',
    customWorkflowPath: 'chroma.api.workflow.json',
    selectedVae: 'ae.safetensors'
  },
  flux1_krea: {
    cfgScale: 1.0,
    steps: 20,
    sampler: 'euler',
    scheduler: 'beta',
    clipSkip: 1,
    qualityPrefix: '',
    negativePrefix: '',
    wildcardsFile: 'wildcards.qwen.yaml',
    customWorkflowPath: 'flux1_krea.api.workflow.json',
    selectedVae: 'ae.safetensors'
  },
  z_image: {
    cfgScale: 1.0,
    steps: 9,
    sampler: 'euler',
    scheduler: 'simple',
    clipSkip: 1,
    qualityPrefix: '',
    negativePrefix: 'blurry ugly bad',
    wildcardsFile: 'wildcards.new.yaml',
    customWorkflowPath: 'universal.api.workflow.json',
    selectedVae: 'ae.safetensors'
  }
} as const

// Placeholder pattern used for __name__ style tags (non-greedy to avoid merging adjacent placeholders)
// Whitespace is intentionally excluded so markers like "__ __" are treated as plain text.
export const PLACEHOLDER_RE_SOURCE = '__([\\p{L}\\p{N}_\\-/]+?)__'
export const PLACEHOLDER_RE_FLAGS = 'gu'
export function createPlaceholderRegex(): RegExp {
  return new RegExp(PLACEHOLDER_RE_SOURCE, PLACEHOLDER_RE_FLAGS)
}

// Choice pattern used for {a|b|c} style random selection
// Requires at least one | to distinguish from JSON-like syntax like {key: "value"}
export const CHOICE_RE_SOURCE = '\\{([^{}]*\\|[^{}]*)\\}'
export const CHOICE_RE_FLAGS = 'g'
export function createChoiceRegex(): RegExp {
  return new RegExp(CHOICE_RE_SOURCE, CHOICE_RE_FLAGS)
}

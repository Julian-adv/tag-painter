export const CONSISTENT_RANDOM_MARKER = '=consistent-random'
export const DEFAULT_OUTPUT_DIRECTORY = 'data/output'
export const DEFAULT_ARRAY_WEIGHT = 100
export const DEFAULT_COMFY_URL = 'http://127.0.0.1:8188'

// Placeholder pattern used for __name__ style tags (non-greedy to avoid merging adjacent placeholders)
// Whitespace is intentionally excluded so markers like "__ __" are treated as plain text.
export const PLACEHOLDER_RE_SOURCE = '__([\\p{L}\\p{N}_\\-/]+?)__'
export const PLACEHOLDER_RE_FLAGS = 'gu'
export function createPlaceholderRegex(): RegExp {
  return new RegExp(PLACEHOLDER_RE_SOURCE, PLACEHOLDER_RE_FLAGS)
}

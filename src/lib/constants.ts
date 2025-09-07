export const CONSISTENT_RANDOM_MARKER = '=consistent-random'
export const DEFAULT_OUTPUT_DIRECTORY = 'data/output'
export const DEFAULT_ARRAY_WEIGHT = 100

// Placeholder pattern used for __name__ style tags (non-greedy to avoid merging adjacent placeholders)
export const PLACEHOLDER_RE_SOURCE = '__([\\p{L}\\p{N}_\\- /]+?)__'
export const PLACEHOLDER_RE_FLAGS = 'gu'
export function createPlaceholderRegex(): RegExp {
  return new RegExp(PLACEHOLDER_RE_SOURCE, PLACEHOLDER_RE_FLAGS)
}

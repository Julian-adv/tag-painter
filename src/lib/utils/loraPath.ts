// Utility functions for LoRA path normalization

let detectedSeparator: '/' | '\\' = '/'

/**
 * Updates the detected path separator based on LoRA list from ComfyUI API
 * Call this when fetching loras from /api/loras
 */
export function updatePathSeparatorFromLoraList(loras: string[]): void {
  if (!Array.isArray(loras) || loras.length === 0) {
    return
  }

  // Check if any LoRA path contains backslashes
  const hasBackslash = loras.some((name) => typeof name === 'string' && name.includes('\\'))
  detectedSeparator = hasBackslash ? '\\' : '/'
}

/**
 * Normalizes LoRA name for ComfyUI based on detected separator
 * Uses the separator detected from ComfyUI API response
 */
export function normalizeLoraPathForComfy(loraName: string): string {
  if (typeof loraName !== 'string') {
    return loraName
  }

  if (detectedSeparator === '\\') {
    return loraName.replace(/\//g, '\\')
  } else {
    return loraName.replace(/\\/g, '/')
  }
}

/**
 * Normalizes LoRA name for display (always uses forward slashes)
 */
export function normalizeLoraNameForDisplay(loraName: string): string {
  return typeof loraName === 'string' ? loraName.replace(/\\/g, '/') : loraName
}

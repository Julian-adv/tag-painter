// Utility functions for LoRA path normalization

let detectedSeparator: '/' | '\\' = '/'
let platformDetected = false

/**
 * Fetches the platform from the server and sets the appropriate separator
 * Should be called once on app initialization
 */
export async function detectPlatform(): Promise<void> {
  if (platformDetected) {
    return
  }

  try {
    const response = await fetch('/api/platform')
    if (response.ok) {
      const data = await response.json()
      detectedSeparator = data.separator || '/'
      platformDetected = true
      console.log('[LoRA Path] Platform detected:', data.platform, 'separator:', detectedSeparator)
    }
  } catch (error) {
    console.warn('[LoRA Path] Failed to detect platform, using default separator:', error)
  }
}

/**
 * Normalizes LoRA name for ComfyUI based on detected separator
 * Uses the separator detected from platform API
 */
export function normalizeLoraPathForComfy(loraName: string): string {
  if (typeof loraName !== 'string') {
    return loraName
  }

  const result =
    detectedSeparator === '\\' ? loraName.replace(/\//g, '\\') : loraName.replace(/\\/g, '/')

  console.log(
    '[LoRA Path] Normalizing:',
    loraName,
    '→',
    result,
    '(separator:',
    detectedSeparator + ')'
  )
  return result
}

/**
 * Normalizes LoRA name for display (always uses forward slashes)
 */
export function normalizeLoraNameForDisplay(loraName: string): string {
  return typeof loraName === 'string' ? loraName.replace(/\\/g, '/') : loraName
}

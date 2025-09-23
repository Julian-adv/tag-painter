// Utility functions for wildcards file naming and management

/**
 * Get the appropriate wildcards filename based on model type
 */
export function getWildcardsFileName(modelType?: string): string {
  return modelType === 'qwen' ? 'wildcards.qwen.yaml' : 'wildcards.yaml'
}

/**
 * Get a display-friendly name for the wildcards file
 */
export function getWildcardsDisplayName(modelType?: string): string {
  return modelType === 'qwen' ? 'Qwen wildcards' : 'wildcards'
}
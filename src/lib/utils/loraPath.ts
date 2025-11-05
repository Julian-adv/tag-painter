// Utility functions for LoRA path normalization

/**
 * Normalizes LoRA name for ComfyUI based on platform
 * On Windows, uses backslashes; on other platforms, uses forward slashes
 */
export function normalizeLoraPathForComfy(loraName: string): string {
	if (typeof loraName !== 'string') {
		return loraName
	}

	// Detect platform - if we're running in browser, use server detection via API
	// If we're on server, use process.platform
	const isWindows = typeof process !== 'undefined' && process.platform === 'win32'

	if (isWindows) {
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

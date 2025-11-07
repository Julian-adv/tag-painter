/**
 * Parse ComfyUI error responses and convert them to user-friendly messages
 */

interface ComfyErrorResponse {
  error?: {
    type?: string
    message?: string
    details?: string
  }
  node_errors?: Record<
    string,
    {
      errors?: Array<{
        type?: string
        message?: string
        details?: string
        extra_info?: {
          input_name?: string
          received_value?: string
        }
      }>
      class_type?: string
    }
  >
}

export interface ParsedComfyError {
  summary: string
  details: string[]
}

/**
 * Parse a ComfyUI error response and extract user-friendly error messages
 */
export function parseComfyError(errorText: string): ParsedComfyError {
  try {
    const parsed: ComfyErrorResponse = JSON.parse(errorText)

    // Handle node-specific errors (like missing checkpoints)
    if (parsed.node_errors) {
      const detailsSet = new Set<string>()
      let summary = 'Generation failed'

      for (const nodeError of Object.values(parsed.node_errors)) {
        if (!nodeError.errors || nodeError.errors.length === 0) continue

        for (const error of nodeError.errors) {
          // Parse "value not in list" errors (missing checkpoint/model)
          if (error.type === 'value_not_in_list' && error.details) {
            const match = error.details.match(
              /(\w+):\s*'([^']+)'\s*not in\s*\[([^\]]+)\]/
            )
            if (match) {
              const [, inputName, receivedValue] = match
              if (inputName === 'ckpt_name') {
                summary = 'Checkpoint model not found'
                detailsSet.add(`The checkpoint '${receivedValue}' is not available.`)
                detailsSet.add(
                  'Please select a different checkpoint in Settings or download this model.'
                )
              } else if (inputName === 'vae_name') {
                summary = 'VAE model not found'
                detailsSet.add(`The VAE '${receivedValue}' is not available.`)
                detailsSet.add('Please select a different VAE in Settings or download this model.')
              } else if (inputName === 'lora_name') {
                summary = 'LoRA model not found'
                detailsSet.add(`The LoRA '${receivedValue}' is not available.`)
                detailsSet.add('Please remove this LoRA or download the model file.')
              } else {
                detailsSet.add(`${inputName}: '${receivedValue}' is not available.`)
              }
              continue
            }
          }

          // Generic error handling
          const errorMsg = error.details || error.message || 'Unknown error'
          detailsSet.add(errorMsg)
        }
      }

      return { summary, details: Array.from(detailsSet) }
    }

    // Handle top-level errors
    if (parsed.error) {
      const summary = parsed.error.message || 'Generation failed'
      const details: string[] = []
      if (parsed.error.details) {
        details.push(parsed.error.details)
      }
      return { summary, details }
    }

    // Fallback
    return {
      summary: 'Generation failed',
      details: [errorText]
    }
  } catch {
    // Not JSON or parsing failed
    return {
      summary: 'Generation failed',
      details: [errorText]
    }
  }
}

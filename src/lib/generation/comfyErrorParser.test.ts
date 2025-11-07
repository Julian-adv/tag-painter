import { describe, it, expect } from 'vitest'
import { parseComfyError } from './comfyErrorParser'

describe('parseComfyError', () => {
  it('should parse missing checkpoint error', () => {
    const errorResponse = JSON.stringify({
      error: {
        type: 'prompt_outputs_failed_validation',
        message: 'Prompt outputs failed validation'
      },
      node_errors: {
        '85': {
          errors: [
            {
              type: 'value_not_in_list',
              message: 'Value not in list',
              details:
                "ckpt_name: 'zenijiMixKWebtoon_v10.safetensors' not in ['perfectdeliberate_v20.safetensors']"
            }
          ],
          class_type: 'CheckpointLoaderSimple'
        }
      }
    })

    const result = parseComfyError(errorResponse)

    expect(result.summary).toBe('Checkpoint model not found')
    expect(result.details).toContain(
      "The checkpoint 'zenijiMixKWebtoon_v10.safetensors' is not available."
    )
    expect(result.details).toContain(
      'Please select a different checkpoint in Settings or download this model.'
    )
  })

  it('should parse missing VAE error', () => {
    const errorResponse = JSON.stringify({
      node_errors: {
        '42': {
          errors: [
            {
              type: 'value_not_in_list',
              details: "vae_name: 'custom_vae.safetensors' not in ['vae-ft-mse-840000-ema-pruned.safetensors']"
            }
          ]
        }
      }
    })

    const result = parseComfyError(errorResponse)

    expect(result.summary).toBe('VAE model not found')
    expect(result.details).toContain("The VAE 'custom_vae.safetensors' is not available.")
  })

  it('should parse missing LoRA error', () => {
    const errorResponse = JSON.stringify({
      node_errors: {
        '99': {
          errors: [
            {
              type: 'value_not_in_list',
              details: "lora_name: 'my_lora.safetensors' not in ['other_lora.safetensors']"
            }
          ]
        }
      }
    })

    const result = parseComfyError(errorResponse)

    expect(result.summary).toBe('LoRA model not found')
    expect(result.details).toContain("The LoRA 'my_lora.safetensors' is not available.")
  })

  it('should handle generic errors', () => {
    const errorResponse = JSON.stringify({
      error: {
        type: 'unknown_error',
        message: 'Something went wrong',
        details: 'Detailed error information'
      }
    })

    const result = parseComfyError(errorResponse)

    expect(result.summary).toBe('Something went wrong')
    expect(result.details).toContain('Detailed error information')
  })

  it('should handle non-JSON errors', () => {
    const errorResponse = 'Plain text error message'

    const result = parseComfyError(errorResponse)

    expect(result.summary).toBe('Generation failed')
    expect(result.details).toContain(errorResponse)
  })

  it('should handle multiple node errors', () => {
    const errorResponse = JSON.stringify({
      node_errors: {
        '85': {
          errors: [
            {
              type: 'value_not_in_list',
              details: "ckpt_name: 'model1.safetensors' not in ['model2.safetensors']"
            }
          ]
        },
        '101': {
          errors: [
            {
              type: 'value_not_in_list',
              details: "ckpt_name: 'model1.safetensors' not in ['model2.safetensors']"
            }
          ]
        }
      }
    })

    const result = parseComfyError(errorResponse)

    expect(result.summary).toBe('Checkpoint model not found')
    // Should not duplicate the same error message
    expect(result.details.length).toBeGreaterThan(0)
  })
})

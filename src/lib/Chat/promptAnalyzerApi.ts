import type { PromptAnalysis } from '$lib/types'
import {
  GEMINI_MODEL_ID,
  DEFAULT_OPENROUTER_MODEL_ID,
  ANALYSIS_SCHEMA,
  ANALYSIS_PROMPT,
  SYSTEM_PROMPT,
  GENERALIZE_PROMPT,
  GENERALIZE_SYSTEM_PROMPT,
  GENERALIZE_SCHEMA,
  GENERALIZE_JSON_INSTRUCTION,
  type GeneralizeResult
} from './promptAnalyzerTypes'

/**
 * Attempts to parse JSON from a string, with fallback to extract JSON from text.
 * Handles cases like ```json { ... } ``` or other text wrapping JSON.
 */
function parseJsonWithFallback<T>(content: string): T {
  // First, try parsing as-is
  try {
    return JSON.parse(content) as T
  } catch {
    // Try to extract JSON object from text
    const firstBrace = content.indexOf('{')
    const lastBrace = content.lastIndexOf('}')

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonPart = content.slice(firstBrace, lastBrace + 1)
      return JSON.parse(jsonPart) as T
    }

    // If no braces found, throw original error
    throw new Error('No valid JSON found in response')
  }
}

export async function analyzeWithGemini(prompt: string, key: string): Promise<PromptAnalysis> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_ID}:generateContent?key=${encodeURIComponent(key)}`

  const body = {
    contents: [
      {
        parts: [
          {
            text: `${ANALYSIS_PROMPT}

Prompt: "${prompt}"`
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: ANALYSIS_SCHEMA
    },
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }]
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('Failed to parse Gemini response.')
  }

  const data = payload as Record<string, unknown>

  if (!response.ok) {
    const errorData = data?.error as Record<string, unknown> | undefined
    const message =
      errorData && typeof errorData.message === 'string'
        ? errorData.message
        : 'Gemini request failed.'
    throw new Error(message)
  }

  const candidates = Array.isArray(data?.candidates) ? data.candidates : []
  const firstCandidate = candidates.length > 0 ? (candidates[0] as Record<string, unknown>) : undefined
  const content = firstCandidate?.content as Record<string, unknown> | undefined
  const parts = Array.isArray(content?.parts) ? content.parts : []

  if (parts.length > 0) {
    const part = parts[0] as Record<string, unknown>
    const text = typeof part?.text === 'string' ? part.text.trim() : ''
    if (text) {
      return JSON.parse(text) as PromptAnalysis
    }
  }

  throw new Error('Failed to get analysis from Gemini.')
}

export async function analyzeWithOpenRouter(
  prompt: string,
  key: string,
  model: string
): Promise<PromptAnalysis> {
  const schemaFields = Object.entries(ANALYSIS_SCHEMA.properties)
    .map(([name, prop]) => `- ${name}: ${(prop as { description: string }).description}`)
    .join('\n')

  const systemPromptWithSchema = `${SYSTEM_PROMPT}

You must respond with a valid JSON object containing these fields:
${schemaFields}

Respond ONLY with the JSON object, no other text.`

  const modelId = model.trim() || DEFAULT_OPENROUTER_MODEL_ID

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: systemPromptWithSchema },
        { role: 'user', content: `${ANALYSIS_PROMPT}\n\nPrompt: "${prompt}"` }
      ],
      response_format: { type: 'json_object' }
    })
  })

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('Failed to parse OpenRouter response.')
  }

  const data = payload as Record<string, unknown>

  if (!response.ok) {
    const errorData = data?.error as Record<string, unknown> | undefined
    const message =
      errorData && typeof errorData.message === 'string'
        ? errorData.message
        : 'OpenRouter request failed.'
    throw new Error(message)
  }

  const choices = Array.isArray(data?.choices) ? data.choices : []
  const firstChoice = choices.length > 0 ? (choices[0] as Record<string, unknown>) : undefined
  const message = firstChoice?.message as Record<string, unknown> | undefined
  const content = typeof message?.content === 'string' ? message.content.trim() : ''

  if (content) {
    return parseJsonWithFallback<PromptAnalysis>(content)
  }

  throw new Error('Failed to get analysis from OpenRouter.')
}

export async function analyzeWithOllama(
  prompt: string,
  baseUrl: string,
  model: string
): Promise<PromptAnalysis> {
  const schemaFields = Object.entries(ANALYSIS_SCHEMA.properties)
    .map(([name, prop]) => `- ${name}: ${(prop as { description: string }).description}`)
    .join('\n')

  const systemPromptWithSchema = `${SYSTEM_PROMPT}

You must respond with a valid JSON object containing these fields:
${schemaFields}

Respond ONLY with the JSON object, no other text.`

  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/chat`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPromptWithSchema },
        { role: 'user', content: `${ANALYSIS_PROMPT}\n\nPrompt: "${prompt}"` }
      ],
      format: 'json',
      stream: false
    })
  })

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('Failed to parse Ollama response.')
  }

  const data = payload as Record<string, unknown>

  if (!response.ok) {
    const errorMsg = typeof data?.error === 'string' ? data.error : 'Ollama request failed.'
    throw new Error(errorMsg)
  }

  const message = data?.message as Record<string, unknown> | undefined
  const content = typeof message?.content === 'string' ? message.content.trim() : ''

  if (content) {
    return parseJsonWithFallback<PromptAnalysis>(content)
  }

  throw new Error('Failed to get analysis from Ollama.')
}

export async function generalizeWithGemini(prompt: string, key: string): Promise<GeneralizeResult> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_ID}:generateContent?key=${encodeURIComponent(key)}`

  const body = {
    contents: [
      {
        parts: [
          {
            text: `${GENERALIZE_PROMPT}

"${prompt}"`
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: GENERALIZE_SCHEMA
    },
    systemInstruction: {
      parts: [{ text: GENERALIZE_SYSTEM_PROMPT }]
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('Failed to parse Gemini response.')
  }

  const data = payload as Record<string, unknown>

  if (!response.ok) {
    const errorData = data?.error as Record<string, unknown> | undefined
    const message =
      errorData && typeof errorData.message === 'string'
        ? errorData.message
        : 'Gemini request failed.'
    throw new Error(message)
  }

  const candidates = Array.isArray(data?.candidates) ? data.candidates : []
  const firstCandidate = candidates.length > 0 ? (candidates[0] as Record<string, unknown>) : undefined
  const content = firstCandidate?.content as Record<string, unknown> | undefined
  const parts = Array.isArray(content?.parts) ? content.parts : []

  if (parts.length > 0) {
    const part = parts[0] as Record<string, unknown>
    const text = typeof part?.text === 'string' ? part.text.trim() : ''
    if (text) {
      return JSON.parse(text) as GeneralizeResult
    }
  }

  throw new Error('Failed to get generalized prompt from Gemini.')
}

export async function generalizeWithOpenRouter(
  prompt: string,
  key: string,
  model: string
): Promise<GeneralizeResult> {
  const modelId = model.trim() || DEFAULT_OPENROUTER_MODEL_ID

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: GENERALIZE_SYSTEM_PROMPT + GENERALIZE_JSON_INSTRUCTION },
        { role: 'user', content: `${GENERALIZE_PROMPT}\n\n"${prompt}"` }
      ],
      response_format: { type: 'json_object' }
    })
  })

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('Failed to parse OpenRouter response.')
  }

  const data = payload as Record<string, unknown>

  if (!response.ok) {
    const errorData = data?.error as Record<string, unknown> | undefined
    const message =
      errorData && typeof errorData.message === 'string'
        ? errorData.message
        : 'OpenRouter request failed.'
    throw new Error(message)
  }

  const choices = Array.isArray(data?.choices) ? data.choices : []
  const firstChoice = choices.length > 0 ? (choices[0] as Record<string, unknown>) : undefined
  const message = firstChoice?.message as Record<string, unknown> | undefined
  const content = typeof message?.content === 'string' ? message.content.trim() : ''

  if (content) {
    return parseJsonWithFallback<GeneralizeResult>(content)
  }

  throw new Error('Failed to get generalized prompt from OpenRouter.')
}

export async function generalizeWithOllama(
  prompt: string,
  baseUrl: string,
  model: string
): Promise<GeneralizeResult> {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/chat`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: GENERALIZE_SYSTEM_PROMPT + GENERALIZE_JSON_INSTRUCTION },
        { role: 'user', content: `${GENERALIZE_PROMPT}\n\n"${prompt}"` }
      ],
      format: 'json',
      stream: false
    })
  })

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('Failed to parse Ollama response.')
  }

  const data = payload as Record<string, unknown>

  if (!response.ok) {
    const errorMsg = typeof data?.error === 'string' ? data.error : 'Ollama request failed.'
    throw new Error(errorMsg)
  }

  const message = data?.message as Record<string, unknown> | undefined
  const content = typeof message?.content === 'string' ? message.content.trim() : ''

  if (content) {
    return parseJsonWithFallback<GeneralizeResult>(content)
  }

  throw new Error('Failed to get generalized prompt from Ollama.')
}

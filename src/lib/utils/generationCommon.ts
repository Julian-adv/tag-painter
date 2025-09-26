// Common utilities for image generation workflows
//
// This module contains shared functions used by both regular and Qwen image generation

import { saveImage } from './fileIO'
import {
  buildComfyHttpUrl,
  connectWebSocket,
  normalizeBaseUrl,
  type WebSocketCallbacks
} from './comfyui'
import { FINAL_SAVE_NODE_ID } from './workflow'
import type { Settings, ProgressData, ComfyUIWorkflow, ModelSettings } from '$lib/types'

export function generateClientId(): string {
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID()
  }
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = cryptoObj.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const segments = [
      bytes.subarray(0, 4),
      bytes.subarray(4, 6),
      bytes.subarray(6, 8),
      bytes.subarray(8, 10),
      bytes.subarray(10, 16)
    ].map((segment) =>
      Array.from(segment)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
    )
    return `${segments[0]}-${segments[1]}-${segments[2]}-${segments[3]}-${segments[4]}`
  }
  let value = ''
  for (let index = 0; index < 36; index += 1) {
    if (index === 8 || index === 13 || index === 18 || index === 23) {
      value += '-'
    } else if (index === 14) {
      value += '4'
    } else {
      const random = Math.floor(Math.random() * 16)
      const hex = index === 19 ? (random & 0x3) | 0x8 : random
      value += hex.toString(16)
    }
  }
  return value
}

export function getEffectiveModelSettings(
  settings: Settings,
  modelName: string | null
): ModelSettings | null {
  if (settings.perModel && modelName && settings.perModel[modelName]) {
    return settings.perModel[modelName]
  }
  if (settings.perModel && settings.perModel['Default']) {
    return settings.perModel['Default']
  }
  return null
}

export function getEffectiveLoras(
  settings: Settings,
  modelName: string | null,
  fallback: { name: string; weight: number }[]
): { name: string; weight: number }[] {
  const ms = getEffectiveModelSettings(settings, modelName)
  const primary = ms && ms.loras ? ms.loras : []
  const secondary = Array.isArray(fallback) ? fallback : []
  // Merge while preserving order and avoiding duplicates by name.
  const seen = new Set<string>()
  const merged: { name: string; weight: number }[] = []
  for (const l of [...primary, ...secondary]) {
    if (!seen.has(l.name)) {
      seen.add(l.name)
      merged.push({ name: l.name, weight: l.weight })
    }
  }
  return merged
}

export function applyPerModelOverrides(settings: Settings, modelName: string | null): Settings {
  const base: Settings = { ...settings, perModel: settings.perModel }
  const ms = getEffectiveModelSettings(settings, modelName)
  let effective = ms

  if (ms?.modelType === 'qwen') {
    effective = {
      ...ms,
      cfgScale: ms.cfgScale ?? 1.5,
      steps: ms.steps ?? 8,
      sampler: ms.sampler || 'euler',
      scheduler: ms.scheduler || 'simple'
    }
  }

  if (effective) {
    base.cfgScale = effective.cfgScale
    base.steps = effective.steps
    base.sampler = effective.sampler
    base.selectedVae = effective.selectedVae
    base.clipSkip = effective.clipSkip ?? base.clipSkip ?? 2
  }

  // Ensure clipSkip has a default value (use global setting as fallback, then default to 2)
  if (base.clipSkip == null) {
    base.clipSkip = 2
  }

  return base
}

export async function submitToComfyUI(
  workflow: ComfyUIWorkflow,
  clientId: string,
  prompts: {
    all: string
    zone1: string
    zone2: string
    negative: string
    inpainting: string
  },
  settings: Settings,
  seed: number,
  callbacks: {
    onLoadingChange: (loading: boolean) => void
    onProgressUpdate: (progress: ProgressData) => void
    onImageReceived: (imageBlob: Blob, filePath: string) => void
    onError: (error: string) => void
  }
) {
  const payload = {
    prompt: workflow,
    client_id: clientId
  }

  const comfyBase = normalizeBaseUrl(settings.comfyUrl)

  // Submit prompt to ComfyUI
  const response = await fetch(buildComfyHttpUrl(comfyBase, 'prompt'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('ComfyUI API Error:', response.status, errorText)
    throw new Error(`HTTP error! status: ${response.status}, response: ${errorText}`)
  }

  const result = await response.json()

  // Connect to WebSocket for real-time updates
  const wsCallbacks: WebSocketCallbacks = {
    onLoadingChange: callbacks.onLoadingChange,
    onProgressUpdate: callbacks.onProgressUpdate,
    onImageReceived: async (imageBlob: Blob) => {
      const filePath = await saveImage(imageBlob, prompts, settings.outputDirectory, workflow, seed)
      if (filePath) {
        callbacks.onImageReceived(imageBlob, filePath)
      } else {
        // If saving returns null, use fallback path
        const fallbackPath = `unsaved_${Date.now()}.png`
        callbacks.onImageReceived(imageBlob, fallbackPath)
      }
    },
    onError: callbacks.onError
  }

  connectWebSocket(result.prompt_id, clientId, FINAL_SAVE_NODE_ID, workflow, wsCallbacks, comfyBase)
}

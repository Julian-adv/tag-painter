// ComfyUI API communication utilities
//
// This module handles direct communication with ComfyUI server:
// - Fetches available checkpoints from ComfyUI API
// - Manages WebSocket connections for real-time progress updates
// - Processes execution status and image data from ComfyUI
// - Extracts node titles from workflow metadata for user-friendly display

import { DEFAULT_COMFY_URL } from '$lib/constants'
import type { ProgressData } from '$lib/types'

const FINAL_PAYLOAD_TIMEOUT_MS = 15000

export function normalizeBaseUrl(baseUrl: string): string {
  const candidate = baseUrl ? baseUrl.trim() : ''
  if (!candidate) {
    return DEFAULT_COMFY_URL
  }
  if (/^https?:\/\//i.test(candidate)) {
    return candidate
  }
  return `http://${candidate}`
}

export function buildComfyHttpUrl(baseUrl: string, resourcePath: string): string {
  const normalized = normalizeBaseUrl(baseUrl)
  const baseWithSlash = normalized.endsWith('/') ? normalized : `${normalized}/`
  const cleanPath = resourcePath.startsWith('/') ? resourcePath.slice(1) : resourcePath
  return new URL(cleanPath, baseWithSlash).toString()
}

function buildComfyWsUrl(
  baseUrl: string,
  resourcePath: string,
  params: Record<string, string>
): string {
  const httpUrl = buildComfyHttpUrl(baseUrl, resourcePath)
  const url = new URL(httpUrl)
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })
  if (url.protocol === 'https:') {
    url.protocol = 'wss:'
  } else if (url.protocol === 'http:') {
    url.protocol = 'ws:'
  }
  return url.toString()
}

async function fetchLoaderOptions(
  baseUrl: string,
  loaderName: string,
  fieldName: string
): Promise<string[]> {
  try {
    const response = await fetch(buildComfyHttpUrl(baseUrl, `object_info/${loaderName}`))
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data = await response.json()
    const options = data?.[loaderName]?.input?.required?.[fieldName]?.[0]
    if (Array.isArray(options)) {
      return options
    }
    console.error(`Could not find ${fieldName} in API response for ${loaderName}:`, data)
    return []
  } catch (error) {
    console.error(`Error fetching options for ${loaderName}:`, error)
    return []
  }
}

export async function fetchCheckpoints(baseUrl: string): Promise<string[]> {
  const [checkpointLoader, unetLoader] = await Promise.all([
    fetchLoaderOptions(baseUrl, 'CheckpointLoaderSimple', 'ckpt_name'),
    fetchLoaderOptions(baseUrl, 'UNETLoader', 'unet_name')
  ])

  const combined = [...checkpointLoader, ...unetLoader]
  const unique = Array.from(new Set(combined))
  return unique
}

export async function fetchVaeModels(baseUrl: string): Promise<string[]> {
  try {
    const response = await fetch(buildComfyHttpUrl(baseUrl, 'object_info/VAELoader'))
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data = await response.json()
    // Structure mirrors CheckpointLoaderSimple: VAELoader.input.required.vae_name[0]
    if (
      data &&
      data.VAELoader &&
      data.VAELoader.input &&
      data.VAELoader.input.required &&
      data.VAELoader.input.required.vae_name
    ) {
      const vaes = data.VAELoader.input.required.vae_name[0]
      return vaes
    } else {
      console.error('Could not find vae list in API response:', data)
      return []
    }
  } catch (error) {
    console.error('Error fetching VAE models:', error)
    return []
  }
}

export interface WebSocketCallbacks {
  onLoadingChange: (loading: boolean) => void
  onProgressUpdate: (progress: ProgressData) => void
  onImageReceived: (imageBlob: Blob, isFinal: boolean) => void
}

export function connectWebSocket(
  promptId: string,
  generatedClientId: string,
  finalSaveNodeId: string,
  workflow: Record<string, { _meta?: { title?: string } }>,
  callbacks: WebSocketCallbacks,
  baseUrl: string,
  intermediateSaveNodeIds?: string[]
): void {
  const wsUrl = buildComfyWsUrl(baseUrl, 'ws', { clientId: generatedClientId })
  const ws = new WebSocket(wsUrl)
  ws.binaryType = 'arraybuffer'

  let lastExecutingNode: string | null = null
  let finalNodeActive = false
  let intermediateNodeActive = false
  let promptFinished = false
  let imageReceived = false
  let pendingCloseTimer: ReturnType<typeof setTimeout> | null = null

  // Function to get node title from workflow
  function getNodeTitle(nodeId: string): string {
    if (workflow[nodeId] && workflow[nodeId]._meta && workflow[nodeId]._meta.title) {
      return workflow[nodeId]._meta.title
    }
    return nodeId // Fallback to node ID if no title
  }

  const scheduleCloseIfNeeded = () => {
    if (promptFinished && imageReceived) {
      if (pendingCloseTimer) {
        clearTimeout(pendingCloseTimer)
        pendingCloseTimer = null
      }
      ws.close()
    } else if (promptFinished && !imageReceived && !pendingCloseTimer) {
      pendingCloseTimer = setTimeout(() => {
        pendingCloseTimer = null
        if (!imageReceived) {
          console.warn(
            `ComfyUI prompt finished without delivering final image payload; closing WebSocket after ${FINAL_PAYLOAD_TIMEOUT_MS}ms.`
          )
          callbacks.onLoadingChange(false)
          ws.close()
        }
      }, FINAL_PAYLOAD_TIMEOUT_MS)
    }
  }

  ws.onopen = () => {
    // WebSocket connection established
  }

  ws.onmessage = (event) => {
    if (typeof event.data === 'string') {
      const message = JSON.parse(event.data)
      if (message.type === 'executing') {
        const data = message.data
        if (data.prompt_id === promptId) {
          lastExecutingNode = data.node
          if (data.node === finalSaveNodeId) {
            finalNodeActive = true
          }
          if (intermediateSaveNodeIds && intermediateSaveNodeIds.includes(data.node)) {
            intermediateNodeActive = true
          }
          if (data.node === null) {
            promptFinished = true
            scheduleCloseIfNeeded()
          } else {
            callbacks.onProgressUpdate({
              value: 0,
              max: 100,
              currentNode: getNodeTitle(data.node)
            })
          }
        }
      } else if (message.type === 'executed') {
        const data = message.data
        if (data.prompt_id === promptId) {
          if (data.node === finalSaveNodeId) {
            finalNodeActive = false
          }
          if (intermediateSaveNodeIds && intermediateSaveNodeIds.includes(data.node)) {
            intermediateNodeActive = false
          }
        }
      } else if (message.type === 'progress') {
        callbacks.onProgressUpdate({
          value: message.data.value,
          max: message.data.max,
          currentNode: lastExecutingNode ? getNodeTitle(lastExecutingNode) : ''
        })
      }
    } else if (event.data instanceof ArrayBuffer) {
      if ((finalNodeActive || lastExecutingNode === finalSaveNodeId) && promptId) {
        const imageBlob = new Blob([event.data.slice(8)], { type: 'image/png' })
        callbacks.onImageReceived(imageBlob, true)
        callbacks.onLoadingChange(false)
        imageReceived = true
        lastExecutingNode = null
        scheduleCloseIfNeeded()
      } else if (
        intermediateSaveNodeIds &&
        (intermediateNodeActive ||
          (lastExecutingNode && intermediateSaveNodeIds.includes(lastExecutingNode))) &&
        promptId
      ) {
        const imageBlob = new Blob([event.data.slice(8)], { type: 'image/png' })
        callbacks.onImageReceived(imageBlob, false)
      }
    }
  }

  ws.onerror = (error) => {
    console.error('WebSocket error:', error)
    callbacks.onLoadingChange(false)
  }

  ws.onclose = () => {
    if (pendingCloseTimer) {
      clearTimeout(pendingCloseTimer)
      pendingCloseTimer = null
    }
    if (!imageReceived) {
      callbacks.onLoadingChange(false)
    }
  }
}

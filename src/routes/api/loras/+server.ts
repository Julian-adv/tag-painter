import { json } from '@sveltejs/kit'
import fs from 'fs/promises'
import path from 'path'
import { DEFAULT_COMFY_URL } from '$lib/constants'
import { buildComfyHttpUrl, normalizeBaseUrl } from '$lib/generation/comfyui'

const SETTINGS_FILE = path.resolve(process.cwd(), 'data', 'settings.json')

async function getComfyUrl(): Promise<string> {
  let comfyUrl = DEFAULT_COMFY_URL
  try {
    const settingsRaw = await fs.readFile(SETTINGS_FILE, 'utf-8')
    const settings = JSON.parse(settingsRaw)
    if (settings && typeof settings.comfyUrl === 'string' && settings.comfyUrl.trim().length > 0) {
      comfyUrl = settings.comfyUrl
    }
  } catch {
    // Ignore missing or invalid settings file and fall back to default
  }
  return comfyUrl
}

export async function GET() {
  let comfyUrl = DEFAULT_COMFY_URL
  let endpoint = ''
  try {
    comfyUrl = normalizeBaseUrl(await getComfyUrl())
    endpoint = buildComfyHttpUrl(comfyUrl, 'object_info')
    const response = await fetch(endpoint)

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()

    // Extract LoRA models from object_info
    const loraLoader = data.LoraLoader || data.LoraLoaderModelOnly
    const loras = loraLoader?.input?.required?.lora_name?.[0] || []

    return json({ loras })
  } catch (error) {
    // Only log if it's not a connection refused error (ComfyUI not running yet)
    const isConnectionRefused =
      error instanceof Error &&
      error.cause instanceof Error &&
      (error.cause as NodeJS.ErrnoException).code === 'ECONNREFUSED'
    if (!isConnectionRefused) {
      console.error(`Failed to fetch LoRAs from ${endpoint || comfyUrl}:`, error)
    }
    return json({ loras: [], error: 'Failed to fetch LoRA models' }, { status: 500 })
  }
}

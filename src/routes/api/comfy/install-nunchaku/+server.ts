import { json } from '@sveltejs/kit'
import type { RequestHandler } from '@sveltejs/kit'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { COMFY_SERVER_URL } from '$lib/server/comfyProcess'

const INSTALL_WORKFLOW_PATH = path.resolve(process.cwd(), 'data', 'install_wheel.api.json')
const NUNCHAKU_VERSIONS_PATH = path.resolve(process.cwd(), 'vendor', 'ComfyUI', 'custom_nodes', 'ComfyUI-nunchaku', 'nunchaku_versions.json')
const MAX_WAIT_MS = 120000
const POLL_INTERVAL_MS = 1000

function buildComfyUrl(resource: string): string {
  return new URL(resource, COMFY_SERVER_URL).toString()
}

async function loadInstallWorkflow(): Promise<Record<string, unknown>> {
  const content = await fs.readFile(INSTALL_WORKFLOW_PATH, 'utf-8')
  return JSON.parse(content) as Record<string, unknown>
}

async function getLatestNunchakuVersion(): Promise<string | null> {
  try {
    const content = await fs.readFile(NUNCHAKU_VERSIONS_PATH, 'utf-8')
    const data = JSON.parse(content) as { versions?: string[] }
    if (Array.isArray(data.versions) && data.versions.length > 0) {
      return data.versions[0]
    }
    return null
  } catch {
    // File doesn't exist or is invalid
    return null
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function extractOutputMessages(entry: any): string[] {
  if (!entry || typeof entry !== 'object') return []

  const messages: string[] = []

  // Try to get messages from outputs
  const outputs = entry.outputs
  if (outputs && typeof outputs === 'object') {
    for (const [_nodeId, value] of Object.entries(outputs)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object') {
            const obj = item as Record<string, unknown>
            // Check for 'preview' field (from PreviewAny node)
            if (typeof obj.preview === 'string') {
              messages.push(obj.preview)
            } else if (typeof obj.text === 'string') {
              messages.push(obj.text)
            } else if (typeof obj.value === 'string') {
              messages.push(obj.value)
            } else if (typeof obj.content === 'string') {
              messages.push(obj.content)
            } else if (typeof obj.string === 'string') {
              messages.push(obj.string)
            }
          } else if (typeof item === 'string') {
            messages.push(item)
          }
        }
      } else if (value && typeof value === 'object') {
        // Check if value is an object with message fields
        const obj = value as Record<string, unknown>

        // Check if any field contains an array of strings
        for (const [_key, fieldValue] of Object.entries(obj)) {
          if (Array.isArray(fieldValue)) {
            for (const arrayItem of fieldValue) {
              if (typeof arrayItem === 'string') {
                messages.push(arrayItem)
              }
            }
          }
        }

        // Also check for direct string fields
        if (typeof obj.preview === 'string') {
          messages.push(obj.preview)
        } else if (typeof obj.text === 'string') {
          messages.push(obj.text)
        } else if (typeof obj.value === 'string') {
          messages.push(obj.value)
        } else if (typeof obj.content === 'string') {
          messages.push(obj.content)
        } else if (typeof obj.string === 'string') {
          messages.push(obj.string)
        }
      }
    }
  }

  return messages
}

async function waitForCompletion(promptId: string): Promise<{ status: 'completed' | 'submitted'; messages: string[] }> {
  const historyUrl = buildComfyUrl(`history/${promptId}`)
  const start = Date.now()
  let lastMessages: string[] = []

  while (Date.now() - start < MAX_WAIT_MS) {
    await delay(POLL_INTERVAL_MS)
    let entry: any = null
    try {
      const res = await fetch(historyUrl)
      if (!res.ok) continue
      const data = await res.json()
      entry = data?.[promptId]
    } catch {
      continue
    }

    if (!entry) continue
    lastMessages = extractOutputMessages(entry)

    const statusValue =
      entry.status?.status ||
      entry.status?.completed ||
      entry.status?.state ||
      entry.status ||
      (entry.outputs ? 'completed' : null)

    if (statusValue === 'completed' || statusValue === 'success' || statusValue === true) {
      return { status: 'completed', messages: lastMessages }
    }

    if (statusValue === 'error' || statusValue === 'failed') {
      const message = entry.status?.error || entry.status?.message || 'Workflow execution failed.'
      throw new Error(message)
    }
  }

  return { status: 'submitted', messages: lastMessages }
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    // Parse request body to get mode and version
    let mode = 'install'
    let version: string | null = null
    try {
      const body = await request.json()
      if (body && typeof body.mode === 'string') {
        mode = body.mode
      }
      if (body && typeof body.version === 'string') {
        version = body.version
      }
    } catch {
      // If parsing fails, use default mode
    }

    // Check if ComfyUI is available by trying to access the prompt endpoint
    try {
      const checkRes = await fetch(buildComfyUrl('history'), {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })
      if (!checkRes.ok) {
        return json({ error: 'ComfyUI is not responding properly. Please ensure ComfyUI is running.' }, { status: 409 })
      }
    } catch (err) {
      console.error('ComfyUI availability check failed:', err)
      return json({ error: 'Cannot connect to ComfyUI. Please ensure ComfyUI is running at http://127.0.0.1:8188' }, { status: 409 })
    }

    let workflow: Record<string, unknown>
    try {
      workflow = await loadInstallWorkflow()
    } catch (err) {
      console.error('Failed to load install_wheel workflow:', err)
      return json({ error: 'install_wheel.api.json not found or invalid.' }, { status: 500 })
    }

    // If no version specified and mode is install, get latest version from nunchaku_versions.json
    if (!version && mode === 'install') {
      const latestVersion = await getLatestNunchakuVersion()
      if (latestVersion) {
        version = latestVersion
      } else {
        // Fallback to hardcoded version if file doesn't exist
        version = '1.0.2'
      }
    } else if (!version) {
      // For update mode, use 'none'
      version = 'none'
    }

    // Set the mode and version in the workflow
    const node1 = workflow['1'] as Record<string, unknown> | undefined
    if (node1 && typeof node1 === 'object' && node1.inputs && typeof node1.inputs === 'object') {
      const inputs = node1.inputs as Record<string, unknown>
      inputs.mode = mode
      inputs.version = version
    }

    const payload = {
      prompt: workflow,
      client_id: randomUUID()
    }

    const promptRes = await fetch(buildComfyUrl('prompt'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!promptRes.ok) {
      const text = await promptRes.text()
      return json({ error: text || `ComfyUI prompt submission failed (${promptRes.status})` }, { status: promptRes.status })
    }

    const promptData = await promptRes.json()
    const promptId = typeof promptData?.prompt_id === 'string' ? promptData.prompt_id : null
    if (!promptId) {
      return json({ error: 'ComfyUI response missing prompt_id.' }, { status: 500 })
    }

    let completion: { status: 'completed' | 'submitted'; messages: string[] } = {
      status: 'submitted',
      messages: []
    }
    try {
      completion = await waitForCompletion(promptId)
    } catch (err) {
      console.warn('Nunchaku install workflow error:', err)
      return json({ error: err instanceof Error ? err.message : 'Workflow execution failed.' }, { status: 500 })
    }

    return json({
      success: true,
      promptId,
      status: completion.status,
      messages: completion.messages
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to install Nunchaku.'
    return json({ error: message }, { status: 500 })
  }
}

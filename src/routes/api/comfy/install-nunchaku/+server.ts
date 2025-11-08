import { json } from '@sveltejs/kit'
import type { RequestHandler } from '@sveltejs/kit'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { COMFY_SERVER_URL } from '$lib/server/comfyProcess'

const INSTALL_WORKFLOW_PATH = path.resolve(process.cwd(), 'data', 'install_wheel.api.json')
const MAX_WAIT_MS = 120000
const POLL_INTERVAL_MS = 1000

function buildComfyUrl(resource: string): string {
  return new URL(resource, COMFY_SERVER_URL).toString()
}

async function loadInstallWorkflow(): Promise<Record<string, unknown>> {
  const content = await fs.readFile(INSTALL_WORKFLOW_PATH, 'utf-8')
  return JSON.parse(content) as Record<string, unknown>
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function extractOutputMessages(entry: any): string[] {
  if (!entry || typeof entry !== 'object') return []
  const outputs = entry.outputs
  if (!outputs || typeof outputs !== 'object') return []
  const messages: string[] = []
  for (const value of Object.values(outputs)) {
    if (!Array.isArray(value)) continue
    for (const item of value) {
      if (item && typeof item === 'object') {
        if (typeof item.text === 'string') {
          messages.push(item.text)
        } else if (typeof item.value === 'string') {
          messages.push(item.value)
        } else if (typeof item.content === 'string') {
          messages.push(item.content)
        }
      } else if (typeof item === 'string') {
        messages.push(item)
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

export const POST: RequestHandler = async () => {
  try {
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

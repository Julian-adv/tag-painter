import type { RequestHandler } from '@sveltejs/kit'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { findComfyPython, getComfyDir } from '$lib/server/comfy'

const STARTUP_WAIT_SECONDS = 45
const COMFY_URL = 'http://127.0.0.1:8188/'

function buildArgs(): string[] {
  const args: string[] = ['-s', 'main.py', '--disable-auto-launch', '--listen', '0.0.0.0', '--enable-cors-header', '*']
  if (process.platform === 'win32') {
    args.splice(2, 0, '--windows-standalone-build')
  }
  return args
}

async function isComfyAvailable(): Promise<boolean> {
  try {
    const res = await fetch(COMFY_URL, { method: 'GET', signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

async function waitForComfyToStart(): Promise<boolean> {
  for (let i = 0; i < STARTUP_WAIT_SECONDS; i += 1) {
    const alive = await isComfyAvailable()
    if (alive) {
      return true
    }
    await delay(1000)
  }
  return false
}

export const POST: RequestHandler = async () => {
  try {
    // Check if ComfyUI is already running
    const alreadyRunning = await isComfyAvailable()
    if (alreadyRunning) {
      return new Response(JSON.stringify({ success: true, message: 'ComfyUI is already running' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const python = await findComfyPython()
    if (!python) {
      return new Response(JSON.stringify({ error: 'Unable to locate ComfyUI Python interpreter.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const comfyDir = getComfyDir()
    const args = buildArgs()
    // Inherit stdout/stderr so ComfyUI logs surface in the existing console session
    const child = spawn(python, args, {
      cwd: comfyDir,
      stdio: ['ignore', 'inherit', 'inherit']
    })

    await new Promise<void>((resolve, reject) => {
      child.once('spawn', () => resolve())
      child.once('error', (err) => reject(err))
    })

    const started = await waitForComfyToStart()
    if (!started) {
      return new Response(JSON.stringify({ error: 'ComfyUI did not start within the expected time.' }), {
        status: 504,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

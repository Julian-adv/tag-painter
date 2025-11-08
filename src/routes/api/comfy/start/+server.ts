import type { RequestHandler } from '@sveltejs/kit'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { findComfyPython, getComfyDir } from '$lib/server/comfy'
import { isComfyAvailable, stopComfyProcess } from '$lib/server/comfyProcess'

const STARTUP_WAIT_SECONDS = 45

function buildArgs(): string[] {
  const args: string[] = ['-s', 'main.py', '--disable-auto-launch', '--listen', '0.0.0.0', '--enable-cors-header', '*']
  if (process.platform === 'win32') {
    args.splice(2, 0, '--windows-standalone-build')
  }
  return args
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
      await stopComfyProcess()
      const stillRunning = await isComfyAvailable()
      if (stillRunning) {
        return new Response(JSON.stringify({ error: 'Failed to stop existing ComfyUI instance.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        })
      }
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

    return new Response(JSON.stringify({ success: true, restarted: alreadyRunning }), {
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

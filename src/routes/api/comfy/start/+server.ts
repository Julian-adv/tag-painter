import type { RequestHandler } from '@sveltejs/kit'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileExists, findComfyPython, getComfyDir } from '$lib/server/comfy'
import { isComfyAvailable, stopComfyProcess } from '$lib/server/comfyProcess'

const STARTUP_WAIT_SECONDS = 60
const MAX_RETRY_ATTEMPTS = 2
const NUNCHAKU_REQUIREMENTS_RELATIVE = path.join('custom_nodes', 'ComfyUI-nunchaku', 'requirements.txt')

function buildArgs(): string[] {
  const args: string[] = [
    '-s',
    'main.py',
    '--disable-auto-launch',
    '--listen',
    '0.0.0.0',
    '--enable-cors-header',
    '*'
  ]
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

async function startComfyProcess(python: string, comfyDir: string): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    const args = buildArgs()
    const child = spawn(python, args, {
      cwd: comfyDir,
      stdio: ['ignore', 'inherit', 'inherit']
    })

    await new Promise<void>((resolve, reject) => {
      child.once('spawn', () => resolve())
      child.once('error', (err) => reject(err))
    })

    const started = await waitForComfyToStart()
    if (started) {
      return true
    }

    if (attempt < MAX_RETRY_ATTEMPTS) {
      console.log(`ComfyUI startup attempt ${attempt} timed out. Retrying...`)
      // Kill the process if it's still running
      try {
        child.kill()
      } catch {
        // Ignore errors
      }
      await delay(2000) // Wait 2 seconds before retry
    }
  }
  return false
}

async function installNunchakuDependencies(python: string, comfyDir: string): Promise<void> {
  const requirementsPath = path.join(comfyDir, NUNCHAKU_REQUIREMENTS_RELATIVE)
  const exists = await fileExists(requirementsPath)
  if (!exists) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(python, ['-m', 'pip', 'install', '-r', requirementsPath], {
      cwd: path.dirname(requirementsPath),
      stdio: ['ignore', 'inherit', 'inherit']
    })
    child.once('error', (err) => reject(err))
    child.once('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`pip install exited with code ${code}`))
      }
    })
  })
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    let restartRequested = false
    try {
      const body = await request.json()
      restartRequested = body?.restart === true
    } catch {
      restartRequested = false
    }

    // Check if ComfyUI is already running
    const alreadyRunning = await isComfyAvailable()
    if (alreadyRunning) {
      if (!restartRequested) {
        return new Response(JSON.stringify({ success: true, alreadyRunning: true }), {
          headers: { 'Content-Type': 'application/json' }
        })
      }
      await stopComfyProcess()
      const stillRunning = await isComfyAvailable()
      if (stillRunning) {
        return new Response(
          JSON.stringify({ error: 'Failed to stop existing ComfyUI instance.' }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }
    }

    const python = await findComfyPython()
    if (!python) {
      return new Response(
        JSON.stringify({ error: 'Unable to locate ComfyUI Python interpreter.' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    const comfyDir = getComfyDir()
    try {
      await installNunchakuDependencies(python, comfyDir)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return new Response(JSON.stringify({ error: `Failed to install Nunchaku dependencies: ${message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const started = await startComfyProcess(python, comfyDir)
    if (!started) {
      const runningAfterWait = await isComfyAvailable()
      if (runningAfterWait) {
        return new Response(
          JSON.stringify({ success: true, restarted: restartRequested && alreadyRunning }),
          {
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }
      return new Response(
        JSON.stringify({
          error: 'ComfyUI did not start within the expected time after multiple attempts.'
        }),
        {
          status: 504,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    return new Response(
      JSON.stringify({ success: true, restarted: restartRequested && alreadyRunning }),
      {
        headers: { 'Content-Type': 'application/json' }
      }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

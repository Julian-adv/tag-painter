import type { RequestHandler } from '@sveltejs/kit'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import path from 'node:path'
import fs from 'node:fs'
import { findComfyPython, getComfyDir } from '$lib/server/comfy'
import { isComfyAvailable, stopComfyProcess } from '$lib/server/comfyProcess'

const STARTUP_WAIT_SECONDS = 60
const MAX_RETRY_ATTEMPTS = 2

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

function getVendorGitPath(): string | undefined {
  const vendorGit = path.join(process.cwd(), 'vendor', 'git', 'cmd', 'git.exe')
  if (fs.existsSync(vendorGit)) {
    return vendorGit
  }
  return undefined
}

async function startComfyProcess(python: string, comfyDir: string): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    const args = buildArgs()

    // Set up environment with vendor git for ComfyUI Manager
    const env = { ...process.env }
    const vendorGit = getVendorGitPath()
    if (vendorGit) {
      env.GIT_PYTHON_GIT_EXECUTABLE = vendorGit
      // Also add git to PATH for any subprocess that might need it
      const gitDir = path.dirname(path.dirname(vendorGit))
      env.PATH = `${path.join(gitDir, 'cmd')};${path.join(gitDir, 'bin')};${env.PATH || ''}`
    }

    const child = spawn(python, args, {
      cwd: comfyDir,
      stdio: ['ignore', 'inherit', 'inherit'],
      env
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
    // Note: Nunchaku dependencies will be installed automatically by ComfyUI when it starts
    // No need to install them here

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

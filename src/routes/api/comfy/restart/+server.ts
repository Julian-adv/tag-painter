import type { RequestHandler } from '@sveltejs/kit'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'

const execAsync = promisify(exec)
const COMFY_URL = 'http://127.0.0.1:8188/'

async function isComfyAvailable(): Promise<boolean> {
  try {
    const res = await fetch(COMFY_URL, { method: 'GET', signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

async function stopComfyUI(): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      // Windows: Find and kill python process running ComfyUI
      const { stdout } = await execAsync(
        'powershell -Command "Get-Process -Name python -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like \'*main.py*--disable-auto-launch*\' } | ForEach-Object { Stop-Process -Id $_.Id -Force }"'
      )
    } else {
      // Linux/macOS: Use pkill
      await execAsync('pkill -f "python.*main.py.*--disable-auto-launch"')
    }
    // Wait for process to terminate
    await delay(2000)
    return true
  } catch (err) {
    // pkill returns non-zero if no process found, which is fine
    console.log('ComfyUI stop attempt:', err)
    return true
  }
}

export const POST: RequestHandler = async () => {
  try {
    // Check if ComfyUI is running
    const wasRunning = await isComfyAvailable()

    if (!wasRunning) {
      return new Response(
        JSON.stringify({ error: 'ComfyUI is not currently running' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Stop ComfyUI
    await stopComfyUI()

    // Verify it stopped
    const stillRunning = await isComfyAvailable()
    if (stillRunning) {
      return new Response(
        JSON.stringify({ error: 'Failed to stop ComfyUI' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Now start it again by calling the start endpoint
    const startResponse = await fetch('http://localhost:5173/api/comfy/start', {
      method: 'POST'
    })

    if (!startResponse.ok) {
      const errorData = await startResponse.json()
      return new Response(
        JSON.stringify({ error: `Failed to restart ComfyUI: ${errorData.error}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, message: 'ComfyUI restarted successfully' }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

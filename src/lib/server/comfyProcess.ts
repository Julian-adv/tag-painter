import { exec, type ExecException } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'

const execAsync = promisify(exec)

export const COMFY_SERVER_URL = 'http://127.0.0.1:8188/'
const STOP_WAIT_MS = 2000

export async function isComfyAvailable(): Promise<boolean> {
  try {
    const res = await fetch(COMFY_SERVER_URL, { method: 'GET', signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

export async function stopComfyProcess(): Promise<void> {
  try {
    if (process.platform === 'win32') {
      await execAsync(
        'powershell -Command "Get-Process -Name python -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like \'*main.py*--disable-auto-launch*\' } | ForEach-Object { Stop-Process -Id $_.Id -Force }"'
      )
    } else {
      await execAsync('pkill -f "python.*main.py.*--disable-auto-launch"')
    }
  } catch (err) {
    if (!isIgnorableStopError(err)) {
      console.log('ComfyUI stop attempt:', err)
    }
  } finally {
    await delay(STOP_WAIT_MS)
  }
}

function isIgnorableStopError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false
  }
  const execError = err as ExecException
  const { code, signal } = execError
  const noProcess = typeof code === 'number' && code === 1
  const codeSignalStop = typeof code === 'string' && code === 'SIGTERM'
  const signalStop = codeSignalStop || signal === 'SIGTERM'
  return Boolean(noProcess || signalStop)
}

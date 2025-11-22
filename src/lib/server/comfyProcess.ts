import { exec, type ExecException } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'

const execAsync = promisify(exec)

export const COMFY_SERVER_URL = 'http://127.0.0.1:8188/'
const HEALTH_CHECK_PATHS = ['queue/status', '']
const STOP_WAIT_MS = 2000
const STOP_RETRY_ATTEMPTS = 3

export async function isComfyAvailable(): Promise<boolean> {
  for (const path of HEALTH_CHECK_PATHS) {
    const url = path ? new URL(path, COMFY_SERVER_URL).toString() : COMFY_SERVER_URL
    try {
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(3000) })
      if (res.status < 500) {
        return true
      }
    } catch {
      // Ignore and try next path
    }
  }
  return false
}

export async function stopComfyProcess(): Promise<void> {
  for (let attempt = 1; attempt <= STOP_RETRY_ATTEMPTS; attempt += 1) {
    await issueStopCommand()
    await delay(STOP_WAIT_MS)
    const stillAlive = await isComfyAvailable()
    if (!stillAlive) {
      return
    }
  }
  console.warn('ComfyUI process still responding after stop attempts.')
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

async function issueStopCommand(): Promise<void> {
  try {
    if (process.platform === 'win32') {
      const psCommand =
        "$pids = @();" +
        "$pids += @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | " +
        "Where-Object { $_.CommandLine -like '*main.py*--disable-auto-launch*' -or $_.ExecutablePath -like '*\\\\comfy-venv\\\\*' -or $_.ExecutablePath -like '*\\\\ComfyUI\\\\*' } | " +
        "Select-Object -ExpandProperty ProcessId -ErrorAction SilentlyContinue);" +
        "$pids += @(Get-NetTCPConnection -LocalPort 8188 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique -ErrorAction SilentlyContinue);" +
        "$pids = $pids | Where-Object { $_ } | Select-Object -Unique;" +
        "if ($pids.Count -gt 0) { Stop-Process -Id $pids -Force -ErrorAction SilentlyContinue }"
      await execAsync(`powershell -Command "${psCommand}"`)
    } else {
      await execAsync('pkill -f "python.*main.py.*--disable-auto-launch"')
      try {
        await execAsync('fuser -k 8188/tcp')
      } catch {
        // Ignore if fuser is unavailable
      }
    }
  } catch (err) {
    if (!isIgnorableStopError(err)) {
      console.log('ComfyUI stop attempt:', err)
    }
  }
}

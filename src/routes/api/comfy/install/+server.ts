import type { RequestHandler } from '@sveltejs/kit'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'

type InstallOptions = {
  reinstall: boolean
  forceCpu: boolean
}

function resolveCommand(options: InstallOptions) {
  const root = process.cwd()
  if (process.platform === 'win32') {
    const scriptPath = path.resolve(root, 'scripts', 'install-comfy.ps1')
    const args = ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath]
    if (options.reinstall) args.push('-Reinstall')
    if (options.forceCpu) args.push('-ForceCPU')
    return {
      command: 'pwsh',
      args,
      fallback: [
        'powershell',
        '-NoLogo',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath
      ]
    }
  }
  const scriptPath = path.resolve(root, 'scripts', 'install-comfy.sh')
  const args = [scriptPath]
  if (options.reinstall) args.push('--reinstall')
  if (options.forceCpu) args.push('--force-cpu')
  return { command: 'bash', args, fallback: null }
}

function startInstaller(command: ReturnType<typeof resolveCommand>): {
  child: ChildProcess | null
  error: string | null
} {
  try {
    const child = spawn(command.command, command.args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe']
    })
    return { child, error: null }
  } catch (err) {
    if (process.platform === 'win32' && command.fallback) {
      try {
        const child = spawn(command.fallback[0], command.fallback.slice(1), {
          cwd: process.cwd(),
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe']
        })
        return { child, error: null }
      } catch (fallbackErr) {
        const message =
          fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
        return { child: null, error: message }
      }
    }
    const message = err instanceof Error ? err.message : String(err)
    return { child: null, error: message }
  }
}

type StreamEvent =
  | { type: 'stdout'; message: string }
  | { type: 'stderr'; message: string }
  | { type: 'error'; error: string }
  | { type: 'exit'; code: number }

function encodeLine(event: StreamEvent, encoder: TextEncoder): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`)
}

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => ({}))
  const options: InstallOptions = {
    reinstall: body?.reinstall === true,
    forceCpu: body?.forceCpu === true
  }

  const command = resolveCommand(options)
  const { child, error } = startInstaller(command)
  if (!child) {
    const message = error ?? 'Failed to start installer'
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: StreamEvent) => controller.enqueue(encodeLine(event, encoder))

      const handleStdout = (chunk: Buffer) => {
        const text = chunk.toString()
        process.stdout.write(text)
        send({ type: 'stdout', message: text })
      }

      const handleStderr = (chunk: Buffer) => {
        const text = chunk.toString()
        process.stderr.write(text)
        send({ type: 'stderr', message: text })
      }

      if (child.stdout) {
        child.stdout.on('data', handleStdout)
      }
      if (child.stderr) {
        child.stderr.on('data', handleStderr)
      }

      child.on('error', (err) => {
        const message = err instanceof Error ? err.message : String(err)
        send({ type: 'error', error: message })
        controller.close()
      })

      child.on('close', (code) => {
        const exitCode = typeof code === 'number' ? code : -1
        send({ type: 'exit', code: exitCode })
        controller.close()
      })

      const abortHandler = () => {
        if (process.platform === 'win32') {
          child.kill('SIGTERM')
        } else {
          child.kill('SIGINT')
        }
      }

      request.signal.addEventListener('abort', abortHandler, { once: true })
    }
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' }
  })
}

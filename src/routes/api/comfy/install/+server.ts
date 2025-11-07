import type { RequestHandler } from '@sveltejs/kit'
import path from 'node:path'
import { spawn } from 'node:child_process'

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
    return { command: 'pwsh', args, fallback: ['powershell', '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath] }
  }
  const scriptPath = path.resolve(root, 'scripts', 'install-comfy.sh')
  const args = [scriptPath]
  if (options.reinstall) args.push('--reinstall')
  if (options.forceCpu) args.push('--force-cpu')
  return { command: 'bash', args, fallback: null }
}

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => ({}))
  const options: InstallOptions = {
    reinstall: body?.reinstall === true,
    forceCpu: body?.forceCpu === true
  }

  const command = resolveCommand(options)

  const spawnWithFallback = () => {
    try {
      return spawn(command.command, command.args, {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['inherit', 'pipe', 'pipe']
      })
    } catch (err) {
      if (process.platform === 'win32' && command.fallback) {
        return spawn(command.fallback[0], command.fallback.slice(1), {
          cwd: process.cwd(),
          env: process.env,
          stdio: ['inherit', 'pipe', 'pipe']
        })
      }
      throw err
    }
  }

  let child: ReturnType<typeof spawn>
  try {
    child = spawnWithFallback()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const errorStream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'error', message })}\n`))
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'complete', success: false })}\n`))
        controller.close()
      }
    })
    return new Response(errorStream, { headers: { 'Content-Type': 'application/x-ndjson' } })
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`))
      }

      let needsRestart = false

      const pipeOutput = (source: NodeJS.ReadableStream, level: 'info' | 'error') => {
        let buffer = ''
        source.on('data', (chunk) => {
          buffer += chunk.toString()
          let idx = buffer.indexOf('\n')
          while (idx !== -1) {
            const line = buffer.slice(0, idx).trim()
            buffer = buffer.slice(idx + 1)
            if (line) {
              if (line === 'COMFYUI_NEEDS_RESTART') {
                needsRestart = true
              }
              send({ type: 'log', level, message: line })
            }
            idx = buffer.indexOf('\n')
          }
        })
        source.on('end', () => {
          if (buffer.trim().length > 0) {
            send({ type: 'log', level, message: buffer.trim() })
          }
        })
      }

      if (child.stdout) pipeOutput(child.stdout, 'info')
      if (child.stderr) pipeOutput(child.stderr, 'error')

      child.on('error', (err) => {
        send({ type: 'error', message: err.message })
      })

      child.on('close', (code) => {
        send({ type: 'complete', success: code === 0, needsRestart })
        controller.close()
      })

      request.signal.addEventListener(
        'abort',
        () => {
          if (process.platform === 'win32') {
            child.kill('SIGTERM')
          } else {
            child.kill('SIGINT')
          }
          controller.close()
        },
        { once: true }
      )
    },
    cancel() {
      if (process.platform === 'win32') {
        child.kill('SIGTERM')
      } else {
        child.kill('SIGINT')
      }
    }
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' }
  })
}

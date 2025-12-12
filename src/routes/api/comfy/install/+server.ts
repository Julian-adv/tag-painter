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

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => ({}))
  const options: InstallOptions = {
    reinstall: body?.reinstall === true,
    forceCpu: body?.forceCpu === true
  }

  const command = resolveCommand(options)

  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>

    const spawnInstaller = (cmd: string, args: string[]) => {
      return spawn(cmd, args, {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['ignore', 'inherit', 'inherit']
      })
    }

    try {
      child = spawnInstaller(command.command, command.args)
    } catch (err) {
      if (process.platform === 'win32' && command.fallback) {
        try {
          child = spawnInstaller(command.fallback[0], command.fallback.slice(1))
        } catch (fallbackErr) {
          const message =
            fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
          resolve(
            new Response(JSON.stringify({ success: false, error: message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            })
          )
          return
        }
      } else {
        const message = err instanceof Error ? err.message : String(err)
        resolve(
          new Response(JSON.stringify({ success: false, error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          })
        )
        return
      }
    }

    child.on('error', (err) => {
      resolve(
        new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    })

    child.on('close', (code) => {
      resolve(
        new Response(JSON.stringify({ success: code === 0 }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    })

    const abortHandler = () => {
      if (process.platform === 'win32') {
        child.kill('SIGTERM')
      } else {
        child.kill('SIGINT')
      }
    }

    request.signal.addEventListener('abort', abortHandler, { once: true })
  })
}

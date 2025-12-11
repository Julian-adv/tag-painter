<script lang="ts">
  import { m } from '$lib/paraglide/messages'
  import { sendClientLog } from '$lib/downloads/logClient'
  import type { StepController, StepStatus } from './stepInterface'

  interface Props {
    controller?: StepController
  }

  let { controller = $bindable() }: Props = $props()

  // Internal state
  let status = $state<StepStatus>('pending')
  let installed = $state(false)
  let installing = $state(false)
  let error = $state<string | null>(null)
  let userConfirmed = $state(false)
  let skipped = $state(false)
  let logOutput = $state('')

  // Logging state
  let lastError = ''

  // Controller API exposed to parent
  const controllerImpl: StepController = {
    async init() {
      status = 'pending'
      await checkComfyStatus()
    },

    async execute() {
      await installComfy(false)
    },

    skip() {
      skipped = true
      status = 'skipped'
      sendClientLog('warn', 'ComfyUI installation skipped by user.')
    },

    reset() {
      status = 'pending'
      installed = false
      installing = false
      error = null
      userConfirmed = false
      skipped = false
      lastError = ''
      logOutput = ''
    },

    getStatus() {
      return status
    },

    isComplete() {
      return status === 'completed' || status === 'skipped'
    },

    canProceed() {
      return (status === 'completed' && userConfirmed) || status === 'skipped'
    },

    getError() {
      return error
    },

    requiresUserConfirmation() {
      return true
    },

    getUserConfirmed() {
      return userConfirmed
    },

    confirmStep() {
      userConfirmed = true
    }
  }

  // Expose controller to parent via bindable prop
  $effect(() => {
    controller = controllerImpl
  })

  async function checkComfyStatus() {
    try {
      const res = await fetch('/api/comfy/status')
      if (res.ok) {
        const data = await res.json()
        installed = data.installed === true
        if (installed) {
          status = 'completed'
        }
      }
    } catch (err) {
      console.error('Failed to check ComfyUI status:', err)
    }
  }

  async function installComfy(reinstall: boolean) {
    installing = true
    status = 'in-progress'
    error = null
    logOutput = ''

    try {
      const res = await fetch('/api/comfy/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reinstall })
      })

      if (!res.ok || !res.body) {
        throw new Error('Installation failed to start')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let exitCode = -1
      let streamError: string | null = null

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let newlineIndex = buffer.indexOf('\n')
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim()
          buffer = buffer.slice(newlineIndex + 1)
          if (line.length > 0) {
            const parsed = parseStreamEvent(line)
            if (parsed) {
              if (parsed.type === 'stdout' || parsed.type === 'stderr') {
                logOutput += parsed.message
              } else if (parsed.type === 'error') {
                streamError = parsed.error
              } else if (parsed.type === 'exit') {
                exitCode = parsed.code
              }
            }
          }
          newlineIndex = buffer.indexOf('\n')
        }
      }

      const remaining = buffer.trim()
      if (remaining.length > 0) {
        const parsed = parseStreamEvent(remaining)
        if (parsed) {
          if (parsed.type === 'stdout' || parsed.type === 'stderr') {
            logOutput += parsed.message
          } else if (parsed.type === 'error') {
            streamError = parsed.error
          } else if (parsed.type === 'exit') {
            exitCode = parsed.code
          }
        }
      }

      const success = exitCode === 0 && !streamError
      if (!success) {
        const errMsg = streamError ?? `Installer exited with code ${exitCode}`
        throw new Error(errMsg)
      } else {
        installed = true
        status = 'completed'
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Installation failed'
      error = errMsg
      status = 'error'
    } finally {
      installing = false
    }
  }

  type InstallStreamEvent =
    | { type: 'stdout'; message: string }
    | { type: 'stderr'; message: string }
    | { type: 'error'; error: string }
    | { type: 'exit'; code: number }

  function parseStreamEvent(line: string): InstallStreamEvent | null {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>
      const type = parsed['type']
      if (type === 'stdout' || type === 'stderr') {
        const message = typeof parsed['message'] === 'string' ? parsed['message'] : ''
        if (message.length === 0) return null
        return { type, message }
      }
      if (type === 'error') {
        const errMsg = typeof parsed['error'] === 'string' ? parsed['error'] : ''
        if (errMsg.length === 0) return null
        return { type: 'error', error: errMsg }
      }
      if (type === 'exit') {
        const codeValue = parsed['code']
        if (typeof codeValue === 'number') {
          return { type: 'exit', code: codeValue }
        }
      }
    } catch {
      return null
    }
    return null
  }

  // Logging effects
  $effect(() => {
    if (error && error !== lastError) {
      sendClientLog('error', `[ComfyUI] Error: ${error}`)
      lastError = error
    }
  })

  $effect(() => {
    if (status === 'completed' && !skipped) {
      sendClientLog('log', '[ComfyUI] Installation completed.')
    }
  })

  const showNextButton = $derived(installed && !installing && !userConfirmed && !skipped)
</script>

<div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
  <div class="mb-2 flex items-center justify-between">
    <h3 class="text-base font-semibold text-gray-900 dark:text-white">
      {m['comfyInstall.title']()}
    </h3>
  </div>

  <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
    {m['comfyInstall.description']()}
  </p>

  {#if installing}
    <div
      class="mb-3 rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-500/40 dark:bg-blue-900/40 dark:text-blue-200"
    >
      Installing ComfyUI... Streaming output below.
    </div>
  {/if}

  {#if status === 'completed' && !skipped}
    <div
      class="mb-3 rounded border border-green-200 bg-green-50 p-3 text-xs text-green-800 dark:border-green-500/40 dark:bg-green-900/40 dark:text-green-200"
    >
      {m['comfyInstall.success']()}
    </div>
  {/if}

  {#if error}
    <div
      class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-900/40 dark:text-red-200"
    >
      {error}
    </div>
  {/if}

  {#if logOutput}
    <div class="mt-3 max-h-52 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-3 font-mono text-left text-[11px] leading-snug text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
      <pre class="whitespace-pre-wrap break-words text-left">{logOutput}</pre>
    </div>
  {/if}

  {#if showNextButton}
    <div class="mt-3">
      <p class="mb-2 text-xs text-gray-600 dark:text-gray-400">
        Installation complete. Click "Next Step" to continue.
      </p>
    </div>
  {/if}
</div>

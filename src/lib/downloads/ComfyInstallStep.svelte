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
  let logs = $state<string[]>([])
  let error = $state<string | null>(null)
  let userConfirmed = $state(false)
  let skipped = $state(false)

  // Logging state
  let logCount = 0
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
      logs = []
      error = null
      userConfirmed = false
      skipped = false
      logCount = 0
      lastError = ''
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
    logs = []
    error = null

    try {
      const res = await fetch('/api/comfy/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reinstall })
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Installation failed')
      }

      const reader = res.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let success = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        let newlineIndex = buffer.indexOf('\n')
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim()
          buffer = buffer.slice(newlineIndex + 1)
          if (line.length > 0) {
            try {
              const event = JSON.parse(line)
              if (event?.type === 'log' && typeof event.message === 'string') {
                logs = [...logs, event.message]
              } else if (event?.type === 'error' && typeof event.message === 'string') {
                error = event.message
              } else if (event?.type === 'complete') {
                success = event.success === true
              }
            } catch {
              // ignore malformed lines
            }
          }
          newlineIndex = buffer.indexOf('\n')
        }
      }

      // Process remaining buffer
      if (buffer.trim().length > 0) {
        try {
          const event = JSON.parse(buffer.trim())
          if (event?.type === 'log' && typeof event.message === 'string') {
            logs = [...logs, event.message]
          } else if (event?.type === 'error' && typeof event.message === 'string') {
            error = event.message
          } else if (event?.type === 'complete') {
            success = event.success === true
          }
        } catch {
          // ignore malformed lines
        }
      }

      if (!success && !error) {
        error = 'ComfyUI installation failed'
      }

      if (success) {
        installed = true
        status = 'completed'
      } else {
        status = 'error'
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Installation failed'
      error = errMsg
      status = 'error'
    } finally {
      installing = false
    }
  }

  // Auto-scroll logs to bottom
  let logsContainer: HTMLDivElement | undefined = $state(undefined)

  $effect(() => {
    if (logsContainer && logs.length > 0) {
      logsContainer.scrollTop = logsContainer.scrollHeight
    }
  })

  // Logging effects
  $effect(() => {
    if (logs.length < logCount) {
      logCount = logs.length
    }
    if (logs.length > logCount) {
      for (let i = logCount; i < logs.length; i += 1) {
        sendClientLog('log', logs[i])
      }
      logCount = logs.length
    }
  })

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

  {#if logs.length > 0}
    <div
      bind:this={logsContainer}
      class="mb-3 max-h-48 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2 text-left text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
    >
      <p class="mb-1 font-semibold">{m['comfyInstall.logsTitle']()}</p>
      <ul class="space-y-1">
        {#each logs as line}
          <li class="font-mono text-[11px]">{line}</li>
        {/each}
      </ul>
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

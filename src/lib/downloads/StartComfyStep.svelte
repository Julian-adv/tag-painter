<script lang="ts">
  import { sendClientLog } from '$lib/downloads/logClient'
  import type { StepController, StepStatus } from './stepInterface'

  interface Props {
    controller?: StepController
    onStatusChange?: (status: StepStatus) => void
    onComplete?: () => void
    onError?: (error: string) => void
  }

  let { controller = $bindable(), onStatusChange, onComplete, onError }: Props = $props()

  // Internal state
  let status = $state<StepStatus>('pending')
  let starting = $state(false)
  let startError = $state<string | null>(null)
  let startSuccess = $state(false)
  let userConfirmed = $state(false)

  // Logging state
  let lastError = ''
  let loggedSuccess = false

  // Controller API exposed to parent
  const controllerImpl: StepController = {
    async init() {
      status = 'pending'
      // Check if ComfyUI is already running
      await checkComfyRunning()
    },

    async execute() {
      await startComfy()
    },

    skip() {
      // Cannot skip - ComfyUI must be running for Nunchaku
      sendClientLog('warn', 'ComfyUI must be started before installing Nunchaku.')
    },

    reset() {
      status = 'pending'
      starting = false
      startError = null
      startSuccess = false
      userConfirmed = false
      lastError = ''
      loggedSuccess = false
    },

    getStatus() {
      return status
    },

    isComplete() {
      return status === 'completed'
    },

    canProceed() {
      return status === 'completed' && userConfirmed
    },

    getError() {
      return startError
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

  async function checkComfyRunning() {
    try {
      const res = await fetch('/api/comfy/status')
      if (res.ok) {
        const data = await res.json()
        if (data.running === true) {
          startSuccess = true
          status = 'completed'
          onStatusChange?.('completed')
        }
      }
    } catch (err) {
      console.error('Failed to check ComfyUI status:', err)
    }
  }

  async function startComfy() {
    starting = true
    status = 'in-progress'
    startError = null
    onStatusChange?.('in-progress')

    try {
      const res = await fetch('/api/comfy/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Failed to start ComfyUI')
      }

      const data = await res.json()
      if (data.success) {
        startSuccess = true
        status = 'completed'
        onStatusChange?.('completed')
      } else {
        throw new Error('ComfyUI did not start successfully')
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to start ComfyUI'
      startError = errMsg
      status = 'error'
      onStatusChange?.('error')
      onError?.(errMsg)
    } finally {
      starting = false
    }
  }

  // Logging effects
  $effect(() => {
    if (startError && startError !== lastError) {
      const message = `[Start ComfyUI] Error: ${startError}`
      console.error(message)
      sendClientLog('error', message)
      lastError = startError
    }
  })

  $effect(() => {
    if (startSuccess && !loggedSuccess) {
      const message = '[Start ComfyUI] ComfyUI started successfully.'
      console.log(message)
      sendClientLog('log', message)
      loggedSuccess = true
    } else if (!startSuccess && loggedSuccess) {
      loggedSuccess = false
    }
  })
</script>

<div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
  <div class="mb-2 flex items-center justify-between">
    <h3 class="text-base font-semibold text-gray-900 dark:text-white">
      Start ComfyUI
    </h3>
    {#if startSuccess}
      <span class="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-200">
        Running
      </span>
    {/if}
  </div>

  <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
    Start ComfyUI server. This is required before installing Nunchaku runtime.
  </p>

  {#if startSuccess}
    <div class="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-600/40 dark:bg-green-900/40 dark:text-green-100">
      ComfyUI is running and ready.
    </div>
  {/if}

  {#if startError}
    <div class="mt-3 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-900/30 dark:text-red-100">
      {startError}
    </div>
  {/if}

  {#if !startSuccess && !starting}
    <div class="mt-2 text-xs text-gray-600 dark:text-gray-400">
      Click "Execute" to start ComfyUI server.
    </div>
  {/if}
</div>

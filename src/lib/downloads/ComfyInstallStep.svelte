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

    try {
      const res = await fetch('/api/comfy/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reinstall })
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Installation failed')
      }

      installed = true
      status = 'completed'
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Installation failed'
      error = errMsg
      status = 'error'
    } finally {
      installing = false
    }
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
      Installing ComfyUI... Please check the terminal window for detailed progress.
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

  {#if showNextButton}
    <div class="mt-3">
      <p class="mb-2 text-xs text-gray-600 dark:text-gray-400">
        Installation complete. Click "Next Step" to continue.
      </p>
    </div>
  {/if}
</div>

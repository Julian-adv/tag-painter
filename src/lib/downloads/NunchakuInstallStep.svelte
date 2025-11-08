<script lang="ts">
  import { sendClientLog } from '$lib/downloads/logClient'
  import type { StepController, StepStatus } from './stepInterface'

  interface Props {
    controller?: StepController
    onStatusChange?: (status: StepStatus) => void
    onError?: (error: string) => void
  }

  let { controller = $bindable(), onStatusChange, onError }: Props = $props()

  // Internal state
  let status = $state<StepStatus>('pending')
  let installing = $state(false)
  let installStatus = $state('')
  let error = $state<string | null>(null)
  let success = $state(false)
  let messages = $state<string[]>([])
  let userConfirmed = $state(false)

  // Logging state
  let lastStatus = ''
  let lastError = ''
  let loggedSuccess = false

  // Controller API exposed to parent
  const controllerImpl: StepController = {
    async init() {
      status = 'pending'
      // No pre-check needed for Nunchaku
    },

    async execute() {
      await installNunchaku()
    },

    skip() {
      // Nunchaku cannot be skipped - it's required
      sendClientLog('warn', 'Nunchaku installation cannot be skipped.')
    },

    reset() {
      status = 'pending'
      installing = false
      installStatus = ''
      error = null
      success = false
      messages = []
      userConfirmed = false
      lastStatus = ''
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

  async function installNunchaku() {
    installing = true
    status = 'in-progress'
    installStatus = 'Updating version list...'
    error = null
    messages = []
    onStatusChange?.('in-progress')

    try {
      // First, update the version list
      const updateRes = await fetch('/api/comfy/install-nunchaku', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'update node', version: 'none' })
      })

      if (!updateRes.ok) {
        const errData = await updateRes.json()
        throw new Error(errData.error || 'Failed to update Nunchaku version list')
      }

      const updateData = await updateRes.json()
      if (!updateData.success) {
        throw new Error('Failed to update Nunchaku version list')
      }

      // Collect update messages
      const updateMessages = updateData.messages || []

      // Then, install Nunchaku (version will be auto-detected from nunchaku_versions.json)
      installStatus = 'Installing Nunchaku...'
      const res = await fetch('/api/comfy/install-nunchaku', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'install' })
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Nunchaku installation failed')
      }

      const data = await res.json()

      if (data.success) {
        success = true
        status = 'completed'
        installStatus = data.status === 'completed' ? 'Installation completed' : 'Installation submitted'
        // Combine update and install messages
        messages = [...updateMessages, ...(data.messages || [])]
        onStatusChange?.('completed')
      } else {
        throw new Error('Installation did not complete successfully')
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Nunchaku installation failed'
      error = errMsg
      status = 'error'
      onStatusChange?.('error')
      onError?.(errMsg)
    } finally {
      installing = false
    }
  }

  // Logging effects
  $effect(() => {
    if (installStatus && installStatus !== lastStatus) {
      const message = `[Nunchaku] Status: ${installStatus}`
      sendClientLog('log', message)
      lastStatus = installStatus
    }
  })

  $effect(() => {
    if (error && error !== lastError) {
      const message = `[Nunchaku] Error: ${error}`
      sendClientLog('error', message)
      lastError = error
    }
  })

  $effect(() => {
    if (success && !loggedSuccess) {
      const message = '[Nunchaku] Installation completed successfully.'
      sendClientLog('log', message)
      loggedSuccess = true
    } else if (!success && loggedSuccess) {
      loggedSuccess = false
    }
  })
</script>

<div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
  <div class="mb-2 flex items-center justify-between">
    <h3 class="text-base font-semibold text-gray-900 dark:text-white">
      Install Nunchaku runtime
    </h3>
  </div>

  <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
    Trigger the official Nunchaku install workflow inside ComfyUI. ComfyUI must be running before starting.
  </p>

  {#if installStatus}
    <div class="mt-3 text-xs text-gray-700 dark:text-gray-300">
      Status: {installStatus}
    </div>
  {/if}

  {#if messages.length > 0}
    <div class="mt-3 rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
      <p class="font-semibold">Installation Details:</p>
      <div class="mt-2 space-y-1">
        {#each messages as message}
          <div class="whitespace-pre-line font-mono text-[11px]">{message}</div>
        {/each}
      </div>
    </div>
  {/if}

  {#if error}
    <div class="mt-3 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-900/30 dark:text-red-100">
      {error}
    </div>
  {/if}

  {#if !success && !installing}
    <div class="mt-2 text-xs text-gray-600 dark:text-gray-400">
      Click "Execute" to install Nunchaku runtime.
    </div>
  {/if}
</div>

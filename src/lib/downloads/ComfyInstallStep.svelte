<script lang="ts">
  import { m } from '$lib/paraglide/messages'
  import { sendClientLog } from '$lib/downloads/logClient'

  interface Props {
    skipped: boolean
    stepComplete: boolean
    installing: boolean
    logs: string[]
    error: string
    onInstall: () => void
    onSkip: () => void
    installed: boolean
    showActions: boolean
  }

  let {
    skipped,
    stepComplete,
    installing,
    logs,
    error,
    onInstall,
    onSkip,
    installed,
    showActions
  }: Props = $props()
  let comfyLogCount = 0
  let lastError = ''

  const buttonLabel = $derived(
    installing
      ? m['comfyInstall.installing']()
      : installed
        ? m['comfyInstall.reinstall']()
        : m['comfyInstall.install']()
  )

  $effect(() => {
    if (logs.length < comfyLogCount) {
      comfyLogCount = logs.length
    }
    if (logs.length > comfyLogCount) {
      for (let i = comfyLogCount; i < logs.length; i += 1) {
        sendClientLog('log', logs[i])
      }
      comfyLogCount = logs.length
    }
  })

  $effect(() => {
    if (error && error !== lastError) {
      sendClientLog('error', `Error: ${error}`)
      lastError = error
    }
  })

  $effect(() => {
    if (stepComplete && !skipped) {
      sendClientLog('log', 'Installation completed.')
    }
  })

  $effect(() => {
    if (skipped) {
      sendClientLog('warn', 'Step skipped by user.')
    }
  })
</script>

<div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
  <div class="mb-2 flex items-center justify-between">
    <h3 class="text-base font-semibold text-gray-900 dark:text-white">
      {m['comfyInstall.title']()}
    </h3>
    <div class="flex items-center gap-2">
      {#if skipped}
        <span
          class="rounded bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-100"
        >
          {m['downloads.skip']()}
        </span>
      {:else if stepComplete}
        <span
          class="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-200"
        >
          {m['downloads.completed']()}
        </span>
      {/if}
    </div>
  </div>

  <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
    {m['comfyInstall.description']()}
  </p>

  {#if stepComplete && !skipped}
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
      class="mb-3 max-h-48 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2 text-left text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
    >
      <p class="mb-1 font-semibold">{m['comfyInstall.logsTitle']()}</p>
      <ul class="space-y-1">
        {#each logs as line, idx}
          <li class="font-mono text-[11px]">{line}</li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if showActions}
    <div class="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        class={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${installing ? 'cursor-not-allowed bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'}`}
        onclick={onInstall}
        disabled={installing}
      >
        {buttonLabel}
      </button>
      {#if !stepComplete}
        <button
          type="button"
          class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-600 dark:text-gray-200 dark:hover:border-gray-400 dark:hover:bg-gray-800"
          onclick={onSkip}
        >
          {m['downloads.skip']()}
        </button>
      {/if}
    </div>
  {/if}
</div>

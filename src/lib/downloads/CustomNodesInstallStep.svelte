<script lang="ts">
  import { sendClientLog } from '$lib/downloads/logClient'
  import type { StepController, StepStatus } from './stepInterface'
  import type { CustomNodeItem, DownloadSummary, DownloadResultItem, DownloadFailedItem, ProgressState } from './types'

  interface Props {
    controller?: StepController
    onStatusChange?: (status: StepStatus) => void
    onComplete?: () => void
    onError?: (error: string) => void
  }

  let { controller = $bindable(), onStatusChange, onComplete, onError }: Props = $props()

  // Internal state
  let status = $state<StepStatus>('pending')
  let loading = $state(false)
  let items = $state<CustomNodeItem[]>([])
  let installing = $state(false)
  let result = $state<DownloadSummary | null>(null)
  let progress = $state<ProgressState>({ total: 0, completed: 0, current: '' })
  let userConfirmed = $state(false)

  // Logging state
  let lastError = ''
  let loggedSuccess = false

  const progressPercent = $derived(
    progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100)
  )

  // Controller API exposed to parent
  const controllerImpl: StepController = {
    async init() {
      status = 'pending'
      await loadCustomNodes()
    },

    async execute() {
      await installCustomNodes()
    },

    skip() {
      status = 'skipped'
      onStatusChange?.('skipped')
      onComplete?.()
    },

    reset() {
      status = 'pending'
      loading = false
      items = []
      installing = false
      result = null
      progress = { total: 0, completed: 0, current: '' }
      userConfirmed = false
      lastError = ''
      loggedSuccess = false
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
      if (result && !result.success && result.failed.length > 0) {
        return result.failed.map(f => `${f.filename}: ${f.error || 'Unknown error'}`).join(', ')
      }
      return null
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

  async function loadCustomNodes() {
    loading = true
    try {
      const res = await fetch('/api/downloads?category=custom-node&onlyMissing=1')
      const data = await res.json()
      if (Array.isArray(data?.items)) {
        const parsed: CustomNodeItem[] = []
        for (const entry of data.items as unknown[]) {
          if (!entry || typeof entry !== 'object') continue
          const record = entry as Record<string, unknown>
          const urlsSource = Array.isArray(record['urls']) ? (record['urls'] as unknown[]) : []
          const cleanUrls = urlsSource.filter((url): url is string => typeof url === 'string')
          parsed.push({
            label: typeof record['label'] === 'string' ? (record['label'] as string) : '',
            filename: typeof record['filename'] === 'string' ? (record['filename'] as string) : '',
            urls: cleanUrls,
            dest: typeof record['dest'] === 'string' ? (record['dest'] as string) : '',
            branch: typeof record['branch'] === 'string' ? (record['branch'] as string) : null
          })
        }
        items = parsed

        // If no custom nodes needed, auto-complete
        if (items.length === 0) {
          status = 'completed'
          onStatusChange?.('completed')
        }
      } else {
        items = []
        // Auto-complete if no items
        status = 'completed'
        onStatusChange?.('completed')
      }
    } catch (err) {
      items = []
      // Auto-complete even on error if no items
      status = 'completed'
      onStatusChange?.('completed')
      console.error('Failed to load custom nodes:', err)
    } finally {
      loading = false
    }
  }

  async function installCustomNodes() {
    if (installing) return
    const targets = [...items]
    if (targets.length === 0) {
      result = { success: true, ok: [], failed: [] }
      status = 'completed'
      onStatusChange?.('completed')
      return
    }

    installing = true
    status = 'in-progress'
    result = null
    progress = { total: targets.length, completed: 0, current: '' }
    onStatusChange?.('in-progress')

    const ok: DownloadResultItem[] = []
    const failed: DownloadFailedItem[] = []

    for (const item of targets) {
      progress.current = item.label || item.filename
      try {
        const res = await fetch('/api/downloads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ onlyMissing: true, filenames: [item.filename], category: 'custom-node' })
        })
        let data: unknown = null
        try {
          data = await res.json()
        } catch {
          data = null
        }
        const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
        const resOk: DownloadResultItem[] = []
        if (Array.isArray(record['ok'])) {
          for (const entry of record['ok'] as unknown[]) {
            if (entry && typeof entry === 'object') {
              const value = (entry as Record<string, unknown>)['filename']
              if (typeof value === 'string' && value.length > 0) {
                const urlValue = (entry as Record<string, unknown>)['url']
                resOk.push({ filename: value, url: typeof urlValue === 'string' ? urlValue : null })
              }
            }
          }
        }
        const resFailed: DownloadFailedItem[] = []
        if (Array.isArray(record['failed'])) {
          for (const entry of record['failed'] as unknown[]) {
            if (entry && typeof entry === 'object') {
              const recordEntry = entry as Record<string, unknown>
              const nameValue = recordEntry['filename']
              if (typeof nameValue === 'string' && nameValue.length > 0) {
                const errValue = typeof recordEntry['error'] === 'string' ? recordEntry['error'] : null
                resFailed.push({ filename: nameValue, error: errValue })
              }
            }
          }
        }
        if (resOk.length > 0) ok.push(...resOk)
        if (resFailed.length > 0) {
          failed.push(...resFailed)
        } else if (!res.ok) {
          failed.push({ filename: item.filename, error: `HTTP ${res.status}` })
        } else if (resOk.length === 0) {
          ok.push({ filename: item.filename, url: null })
        }
      } catch (err: unknown) {
        failed.push({
          filename: item.filename,
          error: err instanceof Error ? err.message : String(err)
        })
      } finally {
        progress.completed += 1
      }
    }

    result = {
      success: failed.length === 0,
      ok,
      failed
    }
    progress.current = ''
    installing = false

    if (result.success) {
      status = 'completed'
      onStatusChange?.('completed')
    } else {
      status = 'error'
      const errorMsg = `Failed to install ${failed.length} custom node(s)`
      onStatusChange?.('error')
      onError?.(errorMsg)
    }

    // Reload to check if any more custom nodes are needed
    await loadCustomNodes()
  }

  // Logging effects
  $effect(() => {
    const error = controllerImpl.getError()
    if (error && error !== lastError) {
      const message = `[Custom Nodes] Error: ${error}`
      console.error(message)
      sendClientLog('error', message)
      lastError = error
    }
  })

  $effect(() => {
    if (result?.success && !loggedSuccess) {
      const message = `[Custom Nodes] Successfully installed ${result.ok.length} custom node(s).`
      console.log(message)
      sendClientLog('log', message)
      loggedSuccess = true
    } else if (!result?.success && loggedSuccess) {
      loggedSuccess = false
    }
  })
</script>

<div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
  <div class="mb-2 flex items-center justify-between">
    <h3 class="text-base font-semibold text-gray-900 dark:text-white">
      Custom Nodes Installation
    </h3>
    {#if status === 'completed'}
      <span class="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-200">
        Completed
      </span>
    {:else if status === 'skipped'}
      <span class="rounded bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-100">
        Skipped
      </span>
    {/if}
  </div>

  <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
    Install required ComfyUI custom nodes for advanced functionality.
  </p>

  {#if loading}
    <div class="text-sm text-gray-500">Checking for required custom nodes…</div>
  {:else if items.length === 0 && !installing}
    <div class="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-600/40 dark:bg-green-900/40 dark:text-green-100">
      All required custom nodes are already installed.
    </div>
  {:else if items.length > 0 && !installing}
    <div class="mb-3">
      <div class="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">
        Custom nodes to install ({items.length}):
      </div>
      <div class="max-h-64 overflow-auto rounded border border-gray-200 dark:border-gray-700">
        <table class="w-full text-left text-xs">
          <thead class="bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
            <tr>
              <th class="px-3 py-2 font-semibold">Name</th>
              <th class="px-3 py-2 font-semibold">Source URL</th>
            </tr>
          </thead>
          <tbody class="bg-white dark:bg-gray-800">
            {#each items as item}
              <tr class="border-t border-gray-200 dark:border-gray-700">
                <td class="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                  {item.label || item.filename}
                </td>
                <td class="px-3 py-2 font-mono text-[11px] text-gray-600 dark:text-gray-300">
                  {item.urls[0] || item.dest}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}

  {#if installing}
    <div class="mt-3 space-y-2">
      <div class="flex items-center justify-between text-xs">
        <span class="text-gray-600 dark:text-gray-400">
          {progress.current || 'Installing…'}
        </span>
        <span class="font-medium text-gray-900 dark:text-gray-100">
          {progress.completed} / {progress.total} ({progressPercent}%)
        </span>
      </div>
      <div class="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          class="h-full rounded-full bg-blue-600 transition-all duration-300 dark:bg-blue-500"
          style="width: {progressPercent}%"
        ></div>
      </div>
    </div>
  {/if}

  {#if result}
    {#if result.success}
      <div class="mt-3 rounded border border-green-200 bg-green-50 p-3 text-xs text-green-800 dark:border-green-500/30 dark:bg-green-900/30 dark:text-green-100">
        <div class="font-medium">Successfully installed {result.ok.length} custom node(s)</div>
        {#if result.ok.length > 0}
          <ul class="ml-4 mt-1 list-disc">
            {#each result.ok as item}
              <li>{item.filename}</li>
            {/each}
          </ul>
        {/if}
      </div>
    {:else}
      <div class="mt-3 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-900/30 dark:text-red-100">
        <div class="font-medium">Installation failed for {result.failed.length} custom node(s):</div>
        <ul class="ml-4 mt-1 list-disc">
          {#each result.failed as item}
            <li>{item.filename}: {item.error || 'Unknown error'}</li>
          {/each}
        </ul>
        {#if result.ok.length > 0}
          <div class="mt-2 font-medium">Successfully installed {result.ok.length} custom node(s):</div>
          <ul class="ml-4 mt-1 list-disc">
            {#each result.ok as item}
              <li>{item.filename}</li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  {/if}

  {#if !loading && items.length > 0 && !installing && !result}
    <div class="mt-2 text-xs text-gray-600 dark:text-gray-400">
      Click "Execute" to install required custom nodes.
    </div>
  {/if}
</div>

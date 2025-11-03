<script lang="ts">
  import { m } from '$lib/paraglide/messages'
  interface Props {
    isOpen: boolean
    onclosed?: (event: { pending: boolean; advance: boolean }) => void
  }

  type DownloadItem = {
    label: string
    filename: string
    urls: string[]
    dest: string
    branch: string | null
  }

  type DownloadResultItem = { filename: string }

  type DownloadFailedItem = { filename: string; error: string | null }

  type DownloadSummary = {
    success: boolean
    ok: DownloadResultItem[]
    failed: DownloadFailedItem[]
  }

  let { isOpen = $bindable(), onclosed }: Props = $props()
  let items = $state<DownloadItem[]>([])
  let loading = $state(false)
  let installing = $state(false)
  let lastResult: DownloadSummary | null = $state(null)
  let installProgress = $state({ total: 0, completed: 0, current: '' })
  const progressPercent = $derived(
    installProgress.total === 0
      ? 0
      : Math.round((installProgress.completed / installProgress.total) * 100)
  )
  let restarting = $state(false)
  let restartError = $state('')
  let restartSuccess = $state(false)

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      closeDialog(false)
    }
  }

  function handleClose() {
    closeDialog(false)
  }

  function closeDialog(advance: boolean) {
    if (!isOpen) {
      return
    }
    isOpen = false
    onclosed?.({ pending: items.length > 0, advance })
  }

  async function loadItems() {
    loading = true
    lastResult = null
    restartError = ''
    restartSuccess = false
    try {
      const res = await fetch('/api/downloads?category=custom-node&onlyMissing=1')
      const data = await res.json()
      if (Array.isArray(data?.items)) {
        items = data.items.map((entry: any) => ({
          label: typeof entry?.label === 'string' ? entry.label : '',
          filename: typeof entry?.filename === 'string' ? entry.filename : '',
          urls: Array.isArray(entry?.urls) ? entry.urls.filter((u: any) => typeof u === 'string') : [],
          dest: typeof entry?.dest === 'string' ? entry.dest : '',
          branch: typeof entry?.branch === 'string' ? entry.branch : null
        }))
      } else {
        items = []
      }
    } catch (err) {
      console.error('Failed to load custom nodes list', err)
      items = []
    } finally {
      loading = false
    }
  }

  async function installAll() {
    if (installing) return
    if (items.length === 0) {
      lastResult = { success: true, ok: [], failed: [] }
      return
    }

    installing = true
    lastResult = null
    restartError = ''
    restartSuccess = false
    installProgress = { total: items.length, completed: 0, current: '' }

    const ok: DownloadResultItem[] = []
    const failed: DownloadFailedItem[] = []

    for (const item of items) {
      installProgress.current = item.label || item.filename
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
                resOk.push({ filename: value })
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
          ok.push({ filename: item.filename })
        }
      } catch (err: unknown) {
        failed.push({
          filename: item.filename,
          error: err instanceof Error ? err.message : String(err)
        })
      } finally {
        installProgress.completed += 1
      }
    }

    lastResult = {
      success: failed.length === 0,
      ok,
      failed
    }
    installProgress.current = ''
    installing = false

    await loadItems()
  }

  async function restartComfy() {
    if (restarting) {
      return
    }
    restarting = true
    restartError = ''
    restartSuccess = false
    try {
      const res = await fetch('/api/comfy/restart', { method: 'POST' })
      let data: unknown = null
      try {
        data = await res.json()
      } catch {
        data = null
      }
      const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
      if (!res.ok || record['success'] !== true) {
        const msg = typeof record['error'] === 'string' ? record['error'] : `HTTP ${res.status}`
        throw new Error(msg)
      }
      restartSuccess = true
    } catch (err: unknown) {
      restartError = err instanceof Error ? err.message : String(err)
    } finally {
      restarting = false
    }
  }

  function continueToDownloads() {
    closeDialog(true)
  }

  $effect(() => {
    if (isOpen) void loadItems()
  })
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onclick={handleBackdropClick}
    onkeydown={(event) => event.key === 'Escape' && handleClose()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="custom-nodes-title"
    tabindex="-1"
  >
    <div class="mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
      <div class="mb-4 flex items-center justify-between">
        <h2 id="custom-nodes-title" class="text-xl font-semibold text-gray-900 dark:text-white">
          {m['customNodes.installRequired']()}
        </h2>
        <button
          type="button"
          class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          onclick={handleClose}
          aria-label="Close dialog"
        >
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="space-y-4">
        <div class="rounded-lg bg-gray-50 p-3 text-sm text-gray-700 dark:bg-gray-700 dark:text-gray-200">
          <p>
            Tag Painter requires the ComfyUI custom nodes listed below. Would you like to download and install them automatically?
            Restart ComfyUI after installation finishes.
          </p>
        </div>

        {#if loading}
          <div class="text-sm text-gray-500">커스텀 노드 목록을 불러오는 중...</div>
        {:else}
          {#if items.length === 0}
            <div class="space-y-3">
              <div class="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-600/40 dark:bg-green-900/40 dark:text-green-100">
                All required custom nodes are installed.
              </div>
              <div class="rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-400/40 dark:bg-blue-900/40 dark:text-blue-100">
                Restart ComfyUI to load the newly installed nodes.
              </div>
              {#if restartSuccess}
                <div class="rounded border border-green-200 bg-green-50 p-2 text-xs text-green-700 dark:border-green-500/40 dark:bg-green-900/40 dark:text-green-200">
                  ComfyUI restarted successfully.
                </div>
              {:else if restartError}
                <div class="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-900/40 dark:text-red-200">
                  {restartError}
                </div>
              {/if}
            </div>
          {:else}
            <div class="max-h-64 overflow-auto rounded border border-gray-200">
              <table class="w-full text-left text-xs">
                <thead class="bg-gray-100 text-gray-700">
                  <tr>
                    <th class="px-2 py-1">이름</th>
                    <th class="px-2 py-1">경로</th>
                  </tr>
                </thead>
                <tbody>
                  {#each items as it}
                    <tr class="border-t">
                      <td class="px-2 py-1 whitespace-nowrap">{it.label || it.filename}</td>
                      <td class="px-2 py-1 text-xs text-gray-600 dark:text-gray-300">{it.dest}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        {/if}

        {#if installing}
          <div class="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-400/40 dark:bg-blue-900/40 dark:text-blue-100">
            <div class="flex items-center justify-between">
              <span>{installProgress.current || '설치 준비 중...'}</span>
              <span>{progressPercent}%</span>
            </div>
            <div class="mt-2 h-2 rounded bg-blue-100 dark:bg-blue-800">
              <div class="h-full rounded bg-blue-600 transition-all" style={`width: ${progressPercent}%`}></div>
            </div>
            <div class="mt-1 text-right text-[11px] text-blue-700 dark:text-blue-200">
              {installProgress.completed} / {installProgress.total}
            </div>
          </div>
        {/if}

        {#if lastResult}
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <div>성공: {lastResult.ok.length}, 실패: {lastResult.failed.length}</div>
            {#if lastResult.failed.length > 0}
              <ul class="mt-1 list-disc pl-5 text-red-600">
                {#each lastResult.failed as f}
                  <li>{f.filename}{f.error ? ` - ${f.error}` : ''}</li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
      </div>

      <div class="mt-6 flex justify-end gap-2">
        {#if items.length > 0}
          <button
            type="button"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            onclick={installAll}
            disabled={installing || loading}
          >
            {installing ? '설치 중...' : '자동 설치'}
          </button>
        {:else}
          <button
            type="button"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            onclick={restartSuccess ? continueToDownloads : restartComfy}
            disabled={restarting}
          >
            {#if restartSuccess}
              Continue to downloads
            {:else if restarting}
              Restarting...
            {:else}
              Restart ComfyUI
            {/if}
          </button>
        {/if}
        <button
          type="button"
          class="rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          onclick={handleClose}
        >
          닫기
        </button>
      </div>
    </div>
  </div>
{/if}

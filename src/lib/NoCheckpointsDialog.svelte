<script lang="ts">
  import { m } from '$lib/paraglide/messages'
  type DownloadItem = { label: string; filename: string; urls: string[]; dest: string }
  type DownloadResultItem = { filename: string }
  type DownloadFailedItem = { filename: string; error: string | null }
  type DownloadSummary = { success: boolean; ok: DownloadResultItem[]; failed: DownloadFailedItem[] }

  interface Props {
    isOpen: boolean
  }

  let { isOpen = $bindable() }: Props = $props()
  let items = $state<DownloadItem[]>([])
  let loading = $state(false)
  let downloading = $state(false)
  let lastResult: DownloadSummary | null = $state(null)
  let downloadProgress = $state({ total: 0, completed: 0, current: '' })
  const progressPercent = $derived(
    downloadProgress.total === 0
      ? 0
      : Math.round((downloadProgress.completed / downloadProgress.total) * 100)
  )

  function handleBackdropClick(event: MouseEvent) {
    // Only close if clicking exactly on the backdrop (not bubbled from children)
    if (event.target === event.currentTarget) {
      isOpen = false
    }
  }

  function handleClose() {
    isOpen = false
  }

  // External links removed per simplified flow

  async function loadItems() {
    loading = true
    lastResult = null
    try {
      const res = await fetch('/api/downloads')
      const data = await res.json()
      items = Array.isArray(data?.items) ? (data.items as DownloadItem[]) : []
    } catch (e) {
      items = []
    } finally {
      loading = false
    }
  }

  async function downloadAll() {
    if (downloading) return
    if (items.length === 0) {
    lastResult = { success: true, ok: [], failed: [] }
      return
    }
    downloading = true
    lastResult = null
    downloadProgress = { total: items.length, completed: 0, current: '' }
    const ok: DownloadResultItem[] = []
    const failed: DownloadFailedItem[] = []

    for (const item of items) {
      downloadProgress.current = item.filename
      try {
        const res = await fetch('/api/downloads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ onlyMissing: true, filenames: [item.filename] })
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
              const v = entry as Record<string, unknown>
              const nameValue = v['filename']
              if (typeof nameValue === 'string' && nameValue.length > 0) {
                const errValue = typeof v['error'] === 'string' ? v['error'] : null
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
        downloadProgress.completed += 1
      }
    }

    lastResult = {
      success: failed.length === 0,
      ok,
      failed
    }

    downloadProgress.current = ''
    downloading = false
  }

  $effect(() => {
    if (isOpen) void loadItems()
  })

  // Folder open flow removed
</script>

{#if isOpen}
  <div
    class="bg-opacity-0 fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onclick={handleBackdropClick}
    onkeydown={(e) => e.key === 'Escape' && handleClose()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="no-checkpoints-title"
    tabindex="-1"
  >
    <div
      class="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800"
      role="document"
    >
      <div class="mb-4 flex items-center justify-between">
        <h2 id="no-checkpoints-title" class="text-xl font-semibold text-gray-900 dark:text-white">
          필요한 파일들을 다운로드하겠습니다.
        </h2>
        <button
          type="button"
          class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          onclick={handleClose}
          aria-label={m['noCheckpoints.closeDialogLabel']()}
        >
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div class="space-y-4">
        <div class="rounded-lg bg-gray-50 p-3 text-sm text-gray-700 dark:bg-gray-700 dark:text-gray-200">
          <p>아래 목록의 파일들을 자동으로 다운로드합니다.</p>
        </div>

        {#if loading}
          <div class="text-sm text-gray-500">Loading download list...</div>
        {:else}
          <div class="max-h-60 overflow-auto rounded border border-gray-200">
            <table class="w-full text-left text-xs">
              <thead class="bg-gray-100 text-gray-700">
                <tr>
                  <th class="px-2 py-1">File</th>
                  <th class="px-2 py-1">URL</th>
                </tr>
              </thead>
              <tbody>
                {#each items as it}
                  <tr class="border-t">
                    <td class="px-2 py-1 whitespace-nowrap">{it.filename}</td>
                    <td class="px-2 py-1 truncate text-blue-600"><a href={it.urls?.[0]} target="_blank" rel="noreferrer">{it.urls?.[0]}</a></td>
                  </tr>
                {/each}
                {#if items.length === 0}
                  <tr>
                    <td class="px-2 py-2 text-gray-500" colspan="2">No items.</td>
                  </tr>
                {/if}
              </tbody>
            </table>
          </div>
        {/if}

        {#if downloading}
          <div class="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-400/40 dark:bg-blue-900/40 dark:text-blue-100">
            <div class="flex items-center justify-between">
              <span>{downloadProgress.current || 'Preparing download...'}</span>
              <span>{progressPercent}%</span>
            </div>
            <div class="mt-2 h-2 rounded bg-blue-100 dark:bg-blue-800">
              <div class="h-full rounded bg-blue-600 transition-all" style={`width: ${progressPercent}%`}></div>
            </div>
            <div class="mt-1 text-right text-[11px] text-blue-700 dark:text-blue-200">
              {downloadProgress.completed} / {downloadProgress.total}
            </div>
          </div>
        {/if}
        <!-- Removed installation path and other guidance per simplified dialog -->

        {#if lastResult}
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <div>Downloaded: {lastResult.ok.length}, Failed: {lastResult.failed.length}</div>
            {#if lastResult.failed.length > 0}
              <ul class="mt-1 list-disc pl-5 text-red-600">
                {#each lastResult.failed as f}
                  <li>{f.filename}{f.error ? ` - ${f.error}` : ''}</li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}

        <!-- Removed next steps warning block -->
      </div>

      <div class="mt-6 flex justify-end">
        <div class="flex gap-2">
          <button
            type="button"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            onclick={downloadAll}
            disabled={downloading || loading}
          >
            {downloading ? 'Downloading...' : 'Download'}
          </button>
          <button
            type="button"
            class="rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
            onclick={handleClose}
          >
            {m['noCheckpoints.gotIt']()}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

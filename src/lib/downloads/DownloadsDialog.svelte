<script lang="ts">
  import { m } from '$lib/paraglide/messages'
  type DownloadItem = {
    label: string
    filename: string
    urls: string[]
    dest: string
    category?: string | null
  }
  type DownloadResultItem = { filename: string; url?: string | null }
type DownloadFailedItem = { filename: string; error: string | null }
type DownloadSummary = { success: boolean; ok: DownloadResultItem[]; failed: DownloadFailedItem[] }

  interface Props {
    isOpen: boolean
    onClose?: (result: { success: boolean }) => void
  }

  let { isOpen = $bindable(), onClose }: Props = $props()
  let allItems = $state<DownloadItem[]>([])
  let loading = $state(false)
  let downloading = $state(false)
  let currentStep = $state<1 | 2 | null>(null)
  let step1Result: DownloadSummary | null = $state(null)
  let step2Result: DownloadSummary | null = $state(null)
  let downloadProgress = $state({ total: 0, completed: 0, current: '', currentLabel: '' })
  let currentFile = $state({ filename: '', label: '', received: 0, total: 0 })
  let currentMessage = $state('')

  function isLargeModelFile(item: DownloadItem): boolean {
    const dest = item.dest.toLowerCase().replace(/\\/g, '/')
    return dest.includes('checkpoints/') ||
           dest.includes('diffusion_models/') ||
           dest.includes('loras/')
  }

  const step1Items = $derived(allItems.filter(item => !isLargeModelFile(item)))
  const step2Items = $derived(allItems.filter(item => isLargeModelFile(item)))

  function isDownloadSuccess(value: DownloadSummary | null): value is DownloadSummary {
    return value !== null && value.success && value.failed.length === 0
  }

  const step1Complete = $derived(isDownloadSuccess(step1Result))
  const step2Complete = $derived(isDownloadSuccess(step2Result))
  const allComplete = $derived(step1Complete && step2Complete)

  const progressPercent = $derived(
    downloadProgress.total === 0
      ? 0
      : Math.round((downloadProgress.completed / downloadProgress.total) * 100)
  )
  const currentFilePercent = $derived(
    currentFile.total > 0
      ? Math.min(100, Math.round((currentFile.received / currentFile.total) * 100))
      : currentFile.received > 0
        ? 100
        : 0
  )

  function closeDialog() {
    if (!isOpen) {
      return
    }
    isOpen = false
    if (onClose) {
      onClose({ success: allComplete })
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    const value = bytes / Math.pow(1024, exponent)
    const rounded = value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)
    return `${rounded} ${units[exponent]}`
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      closeDialog()
    }
  }

  function handleClose() {
    closeDialog()
  }

  async function loadItems() {
    loading = true
    step1Result = null
    step2Result = null
    currentStep = null
    try {
      const res = await fetch('/api/downloads')
      const data = await res.json()
      if (Array.isArray(data?.items)) {
        allItems = (data.items as DownloadItem[]).filter(
          (entry) => entry.category !== 'custom-node'
        )
      } else {
        allItems = []
      }
    } catch (e) {
      allItems = []
    } finally {
      loading = false
    }
  }

  async function downloadStep(step: 1 | 2) {
    if (downloading) return
    const items = step === 1 ? step1Items : step2Items
    if (items.length === 0) {
      if (step === 1) {
        step1Result = { success: true, ok: [], failed: [] }
      } else {
        step2Result = { success: true, ok: [], failed: [] }
      }
      return
    }

    downloading = true
    currentStep = step
    downloadProgress = { total: items.length, completed: 0, current: '', currentLabel: '' }
    currentFile = { filename: '', label: '', received: 0, total: 0 }
    currentMessage = ''
    const ok: DownloadResultItem[] = []
    const failed: DownloadFailedItem[] = []
    let summary: DownloadSummary | null = null

    try {
      const targetFilenames = items.map((item) => item.filename)
      const res = await fetch('/api/downloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onlyMissing: true, filenames: targetFilenames })
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const message = typeof (data as any)?.error === 'string' ? (data as any).error : `HTTP ${res.status}`
        const result = { success: false, ok: [], failed: [{ filename: '__request__', error: message }] }
        if (step === 1) {
          step1Result = result
        } else {
          step2Result = result
        }
        return
      }

      const contentType = res.headers.get('Content-Type') || ''
      if (!res.body || !contentType.includes('ndjson')) {
        const data = await res.json().catch(() => null)
        const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
        const resOk = Array.isArray(record['ok']) ? (record['ok'] as DownloadResultItem[]) : []
        const resFailed = Array.isArray(record['failed'])
          ? (record['failed'] as DownloadFailedItem[])
          : []
        const result = {
          success: !!record['success'],
          ok: resOk,
          failed: resFailed
        }
        if (step === 1) {
          step1Result = result
        } else {
          step2Result = result
        }
        downloadProgress.completed = resOk.length + resFailed.length
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const handleEvent = (event: any) => {
        if (!event || typeof event !== 'object') return
        switch (event.type) {
          case 'file-start': {
            const filename = typeof event.filename === 'string' ? event.filename : ''
            const label = typeof event.label === 'string' && event.label.length > 0 ? event.label : filename
            downloadProgress.current = filename
            downloadProgress.currentLabel = label
            currentFile = { filename, label, received: 0, total: 0 }
            currentMessage = ''
            break
          }
          case 'file-progress': {
            const filename = typeof event.filename === 'string' ? event.filename : currentFile.filename
            if (filename === currentFile.filename || currentFile.filename === '') {
              const received =
                typeof event.receivedBytes === 'number' && event.receivedBytes >= 0
                  ? event.receivedBytes
                  : currentFile.received
              const total =
                typeof event.totalBytes === 'number' && event.totalBytes >= 0
                  ? event.totalBytes
                  : currentFile.total
              currentFile = {
                filename,
                label: downloadProgress.currentLabel || filename,
                received,
                total
              }
              if (typeof event.message === 'string' && event.message.length > 0) {
                currentMessage = event.message
              } else if (event.totalBytes !== null) {
                currentMessage = ''
              }
            }
            break
          }
          case 'file-attempt-error': {
            if (typeof event.error === 'string') {
              currentMessage = event.error
            }
            break
          }
          case 'file-complete': {
            const filename = typeof event.filename === 'string' ? event.filename : currentFile.filename
            ok.push({ filename, url: (event.url as string) ?? null })
            currentFile = { filename: '', label: '', received: 0, total: 0 }
            currentMessage = ''
            downloadProgress.completed = Math.min(
              downloadProgress.total,
              downloadProgress.completed + 1
            )
            break
          }
          case 'file-error': {
            const filename = typeof event.filename === 'string' ? event.filename : currentFile.filename
            const error = typeof event.error === 'string' ? event.error : 'Download failed'
            failed.push({ filename, error })
            currentFile = { filename: '', label: '', received: 0, total: 0 }
            currentMessage = error
            downloadProgress.completed = Math.min(
              downloadProgress.total,
              downloadProgress.completed + 1
            )
            break
          }
          case 'overall': {
            if (typeof event.completed === 'number') {
              downloadProgress.completed = event.completed
            }
            break
          }
          case 'all-complete': {
            const resOk = Array.isArray(event.ok) ? (event.ok as DownloadResultItem[]) : []
            const resFailed = Array.isArray(event.failed)
              ? (event.failed as DownloadFailedItem[])
              : []
            summary = {
              success: !!event.success,
              ok: resOk,
              failed: resFailed
            }
            downloadProgress.completed = resOk.length + resFailed.length
            currentFile = { filename: '', label: '', received: 0, total: 0 }
            currentMessage = ''
            break
          }
          case 'error': {
            const error = typeof event.error === 'string' ? event.error : 'Download failed'
            failed.push({ filename: '__request__', error })
            currentMessage = error
            break
          }
        }
      }

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let newlineIndex = buffer.indexOf('\n')
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim()
          buffer = buffer.slice(newlineIndex + 1)
          if (line.length > 0) {
            try {
              handleEvent(JSON.parse(line))
            } catch {
              // ignore malformed chunks
            }
          }
          newlineIndex = buffer.indexOf('\n')
        }
      }
      const trailing = buffer.trim()
      if (trailing.length > 0) {
        try {
          handleEvent(JSON.parse(trailing))
        } catch {
          // ignore
        }
      }

      const result = summary ? summary : { success: failed.length === 0, ok, failed }
      if (step === 1) {
        step1Result = result
      } else {
        step2Result = result
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      if (failed.length === 0) {
        failed.push({ filename: '__request__', error: message })
      }
      const result = { success: false, ok, failed }
      if (step === 1) {
        step1Result = result
      } else {
        step2Result = result
      }
    } finally {
      downloading = false
      currentStep = null
      downloadProgress.current = ''
      downloadProgress.currentLabel = ''
      currentFile = { filename: '', label: '', received: 0, total: 0 }
      currentMessage = ''
    }
  }

  $effect(() => {
    if (isOpen) void loadItems()
  })
</script>

{#if isOpen}
  <div
    class="bg-opacity-0 fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onclick={handleBackdropClick}
    onkeydown={(e) => e.key === 'Escape' && handleClose()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="downloads-title"
    tabindex="-1"
  >
    <div
      class="mx-4 w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800"
      role="document"
    >
      <div class="mb-4 flex items-center justify-between">
        <h2 id="downloads-title" class="text-xl font-semibold text-gray-900 dark:text-white">
          {allComplete ? m['downloads.titleCompleted']() : m['downloads.title']()}
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
        {#if loading}
          <div class="text-sm text-gray-500">{m['downloads.loading']()}</div>
        {:else}
          <!-- Step 1: Essential Files -->
          {#if !step1Complete || step1Items.length > 0}
          {#if !step1Complete}
          <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="text-base font-semibold text-gray-900 dark:text-white">
                {m['downloads.step1Title']()}
              </h3>
              {#if step1Complete}
                <span class="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-200">
                  {m['downloads.completed']()}
                </span>
              {:else}
                <span class="text-xs text-gray-500">
                  {m['downloads.filesCount']({ count: step1Items.length })}
                </span>
              {/if}
            </div>
            <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
              {m['downloads.step1Description']()}
            </p>

            {#if step1Items.length > 0}
              <div class="mb-3 max-h-40 overflow-auto rounded border border-gray-200">
                <table class="w-full text-left text-xs">
                  <thead class="bg-gray-100 text-gray-700">
                    <tr>
                      <th class="px-2 py-1">{m['downloads.fileHeader']()}</th>
                      <th class="px-2 py-1">{m['downloads.urlHeader']()}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each step1Items as it}
                      <tr class="border-t">
                        <td class="px-2 py-1 whitespace-nowrap">{it.filename}</td>
                        <td class="px-2 py-1 truncate text-blue-600"><a href={it.urls?.[0]} target="_blank" rel="noreferrer">{it.urls?.[0]}</a></td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}

            {#if currentStep === 1 && downloading}
              <div class="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-400/40 dark:bg-blue-900/40 dark:text-blue-100">
                <div class="flex items-center justify-between gap-3">
                  <span class="truncate">
                    {downloadProgress.currentLabel || 'Preparing download...'}
                  </span>
                  <span class="text-right text-[11px] text-blue-700 dark:text-blue-200">
                    {#if currentFile.total > 0}
                      {formatBytes(currentFile.received)} / {formatBytes(currentFile.total)} ({currentFilePercent}%)
                    {:else if currentFile.received > 0}
                      {formatBytes(currentFile.received)}
                    {:else}
                      {progressPercent}%
                    {/if}
                  </span>
                </div>
                <div class="mt-2 h-2 rounded bg-blue-100 dark:bg-blue-800">
                  <div
                    class={`h-full rounded bg-blue-600 transition-all ${currentFile.total === 0 ? 'animate-pulse opacity-60' : ''}`}
                    style={`width: ${currentFile.total > 0 ? currentFilePercent : 100}%`}
                  ></div>
                </div>
                {#if currentMessage}
                  <div class="mt-2 text-[11px] text-blue-700 dark:text-blue-200">
                    {currentMessage}
                  </div>
                {/if}
                <div class="mt-1 text-right text-[11px] text-blue-700 dark:text-blue-200">
                  {downloadProgress.completed} / {downloadProgress.total}
                </div>
              </div>
            {/if}

            {#if step1Result}
              <div class="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                <div>{m['downloads.successCount']({ ok: step1Result.ok.length, failed: step1Result.failed.length })}</div>
                {#if step1Result.failed.length > 0}
                  <ul class="mt-1 list-disc pl-5 text-red-600">
                    {#each step1Result.failed as f}
                      <li>{f.filename}{f.error ? ` - ${f.error}` : ''}</li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/if}

            <button
              type="button"
              class={`w-full rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                step1Complete
                  ? 'bg-green-200 text-green-700 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              } disabled:opacity-50`}
              onclick={() => downloadStep(1)}
              disabled={downloading || loading || step1Complete}
            >
              {step1Complete ? m['downloads.completed']() : currentStep === 1 ? m['downloads.downloading']() : m['downloads.downloadStep1']()}
            </button>
          </div>
          {/if}
          {/if}

          <!-- Step 2: Model Files -->
          {#if step1Complete}
          <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="text-base font-semibold text-gray-900 dark:text-white">
                {m['downloads.step2Title']()}
              </h3>
              {#if step2Complete}
                <span class="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-200">
                  {m['downloads.completed']()}
                </span>
              {:else}
                <span class="text-xs text-gray-500">
                  {m['downloads.filesCount']({ count: step2Items.length })}
                </span>
              {/if}
            </div>
            <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
              {m['downloads.step2Description']()}
            </p>

            {#if step2Items.length > 0}
              <div class="mb-3 max-h-40 overflow-auto rounded border border-gray-200">
                <table class="w-full text-left text-xs">
                  <thead class="bg-gray-100 text-gray-700">
                    <tr>
                      <th class="px-2 py-1">{m['downloads.fileHeader']()}</th>
                      <th class="px-2 py-1">{m['downloads.urlHeader']()}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each step2Items as it}
                      <tr class="border-t">
                        <td class="px-2 py-1 whitespace-nowrap">{it.filename}</td>
                        <td class="px-2 py-1 truncate text-blue-600"><a href={it.urls?.[0]} target="_blank" rel="noreferrer">{it.urls?.[0]}</a></td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}

            {#if currentStep === 2 && downloading}
              <div class="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-400/40 dark:bg-blue-900/40 dark:text-blue-100">
                <div class="flex items-center justify-between gap-3">
                  <span class="truncate">
                    {downloadProgress.currentLabel || 'Preparing download...'}
                  </span>
                  <span class="text-right text-[11px] text-blue-700 dark:text-blue-200">
                    {#if currentFile.total > 0}
                      {formatBytes(currentFile.received)} / {formatBytes(currentFile.total)} ({currentFilePercent}%)
                    {:else if currentFile.received > 0}
                      {formatBytes(currentFile.received)}
                    {:else}
                      {progressPercent}%
                    {/if}
                  </span>
                </div>
                <div class="mt-2 h-2 rounded bg-blue-100 dark:bg-blue-800">
                  <div
                    class={`h-full rounded bg-blue-600 transition-all ${currentFile.total === 0 ? 'animate-pulse opacity-60' : ''}`}
                    style={`width: ${currentFile.total > 0 ? currentFilePercent : 100}%`}
                  ></div>
                </div>
                {#if currentMessage}
                  <div class="mt-2 text-[11px] text-blue-700 dark:text-blue-200">
                    {currentMessage}
                  </div>
                {/if}
                <div class="mt-1 text-right text-[11px] text-blue-700 dark:text-blue-200">
                  {downloadProgress.completed} / {downloadProgress.total}
                </div>
              </div>
            {/if}

            {#if step2Result}
              <div class="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                <div>{m['downloads.successCount']({ ok: step2Result.ok.length, failed: step2Result.failed.length })}</div>
                {#if step2Result.failed.length > 0}
                  <ul class="mt-1 list-disc pl-5 text-red-600">
                    {#each step2Result.failed as f}
                      <li>{f.filename}{f.error ? ` - ${f.error}` : ''}</li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/if}

            <button
              type="button"
              class={`w-full rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                step2Complete
                  ? 'bg-green-200 text-green-700 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              } disabled:opacity-50`}
              onclick={() => downloadStep(2)}
              disabled={downloading || loading || step2Complete}
            >
              {step2Complete ? m['downloads.completed']() : currentStep === 2 ? m['downloads.downloading']() : m['downloads.downloadStep2']()}
            </button>
          </div>
          {/if}
        {/if}
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          onclick={handleClose}
        >
          {m['downloads.close']()}
        </button>
      </div>
    </div>
  </div>
{/if}

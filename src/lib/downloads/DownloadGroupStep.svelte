<script lang="ts">
  import { m } from '$lib/paraglide/messages'
  import DownloadFilesStep from './DownloadFilesStep.svelte'
  import { sendClientLog } from '$lib/downloads/logClient'
  import type { StepController, StepStatus } from './stepInterface'
  import type {
    DownloadItem,
    DownloadSummary,
    DownloadResultItem,
    DownloadFailedItem,
    DownloadProgressState,
    FileProgressState
  } from './types'

  type DownloadMode = 'essential' | 'models'

  interface Props {
    controller?: StepController
    mode: DownloadMode
    title: string
    description: string
    emptyMessage?: string
  }

  let {
    controller = $bindable(),
    mode,
    title,
    description,
    emptyMessage = 'All required files are already downloaded.'
  }: Props = $props()

  const isModelMode = $derived(mode === 'models')

  let status = $state<StepStatus>('pending')
  let loading = $state(false)
  let items = $state<DownloadItem[]>([])
  let downloading = $state(false)
  let result = $state<DownloadSummary | null>(null)
  let downloadProgress = $state<DownloadProgressState>({ total: 0, completed: 0, current: '', currentLabel: '' })
  let currentFile = $state<FileProgressState>({ filename: '', label: '', received: 0, total: 0 })
  let currentMessage = $state('')
  let progressTransition = $state(true)
  let downloadError = $state<string | null>(null)
  let skipped = $state(false)
  let userConfirmed = $state(false)

  let lastLoggedError = ''
  let loggedSuccess = false

  const progressPercent = $derived(
    downloadProgress.total === 0
      ? 0
      : Math.round((downloadProgress.completed / Math.max(downloadProgress.total, 1)) * 100)
  )

  const currentFilePercent = $derived(
    currentFile.total > 0
      ? Math.min(100, Math.round((currentFile.received / currentFile.total) * 100))
      : currentFile.received > 0
        ? 100
        : 0
  )

  const filesCountText = $derived(
    items.length === 1 ? '1 file required' : `${items.length} files required`
  )

  const complete = $derived(status === 'completed')
  const showFilesCount = $derived(!complete && !skipped)
  const currentStepActive = $derived(downloading)

  const controllerImpl: StepController = {
    async init() {
      if (status === 'pending') {
        await loadItems()
      }
    },
    async execute() {
      await downloadMissingFiles()
    },
    skip() {
      skipped = true
      status = 'skipped'
    },
    reset() {
      status = 'pending'
      loading = false
      items = []
      downloading = false
      result = null
      downloadProgress = { total: 0, completed: 0, current: '', currentLabel: '' }
      currentFile = { filename: '', label: '', received: 0, total: 0 }
      currentMessage = ''
      progressTransition = true
      downloadError = null
      skipped = false
      userConfirmed = false
      loggedSuccess = false
      lastLoggedError = ''
      void loadItems()
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
      return downloadError
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

  $effect(() => {
    controller = controllerImpl
  })

  $effect(() => {
    const err = downloadError
    if (err && err !== lastLoggedError) {
      sendClientLog('error', `[${title}] ${err}`)
      lastLoggedError = err
    }
  })

  $effect(() => {
    if (result?.success && !loggedSuccess) {
      sendClientLog('log', `[${title}] Downloaded ${result.ok.length} file(s).`)
      loggedSuccess = true
    } else if (!result?.success && loggedSuccess) {
      loggedSuccess = false
    }
  })

  async function loadItems(): Promise<void> {
    loading = true
    try {
      const res = await fetch('/api/downloads?onlyMissing=1')
      const data = await res.json()
      if (!Array.isArray(data?.items)) {
        items = []
      } else {
        const parsed: DownloadItem[] = []
        for (const entry of data.items as unknown[]) {
          if (!entry || typeof entry !== 'object') continue
          const record = entry as Record<string, unknown>
          if (record['category'] === 'custom-node') continue
          const destValue = record['dest']
          if (typeof destValue !== 'string') continue
          const isModelFile = isModelPath(destValue)
          if (isModelMode && !isModelFile) continue
          if (!isModelMode && isModelFile) continue
          const filename = typeof record['filename'] === 'string' ? (record['filename'] as string) : ''
          if (!filename) continue
          const urlsSource = Array.isArray(record['urls']) ? (record['urls'] as unknown[]) : []
          const cleanUrls = urlsSource.filter((url): url is string => typeof url === 'string')
          if (cleanUrls.length === 0) continue
          parsed.push({
            label: typeof record['label'] === 'string' ? (record['label'] as string) : '',
            filename,
            urls: cleanUrls,
            dest: destValue,
            category: typeof record['category'] === 'string' ? (record['category'] as string) : null
          })
        }
        items = parsed
      }
      if (items.length === 0 && status === 'pending' && !skipped) {
        status = 'completed'
      }
    } catch (err) {
      console.error('Failed to load download items:', err)
      items = []
    } finally {
      loading = false
    }
  }

  async function downloadMissingFiles(): Promise<void> {
    if (downloading || loading) return
    if (items.length === 0) {
      result = { success: true, ok: [], failed: [] }
      if (status !== 'completed') {
        status = 'completed'
      }
      return
    }

    downloading = true
    status = 'in-progress'
    downloadError = null
    downloadProgress = { total: items.length, completed: 0, current: '', currentLabel: '' }
    currentFile = { filename: '', label: '', received: 0, total: 0 }
    currentMessage = ''

    const ok: DownloadResultItem[] = []
    const failed: DownloadFailedItem[] = []
    let summary: DownloadSummary | null = null

    try {
      const filenames = items.map((item) => item.filename)
      const res = await fetch('/api/downloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onlyMissing: true, filenames })
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const message = typeof data?.error === 'string' ? data.error : `HTTP ${res.status}`
        downloadError = message
        result = { success: false, ok: [], failed: [{ filename: '__request__', error: message }] }
        status = 'error'
        return
      }

      const contentType = res.headers.get('Content-Type') || ''
      if (!res.body || !contentType.includes('ndjson')) {
        const data = await res.json().catch(() => null)
        const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
        const resOk = extractResultEntries(record['ok'])
        const resFailed = extractFailedEntries(record['failed'])
        summary = {
          success: !!record['success'],
          ok: resOk,
          failed: resFailed
        }
      } else {
        await readStream(res.body, ok, failed, (value) => {
          summary = value
        })
      }

      const finalResult = summary ?? { success: failed.length === 0, ok, failed }
      result = finalResult
      if (finalResult.success) {
        status = 'completed'
        await loadItems()
      } else {
        status = 'error'
        const message = `Failed to download ${finalResult.failed.length} file(s)`
        downloadError = message
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download failed'
      downloadError = message
      failed.push({ filename: '__request__', error: message })
      result = { success: false, ok, failed }
      status = 'error'
    } finally {
      downloading = false
      downloadProgress.current = ''
      downloadProgress.currentLabel = ''
      currentFile = { filename: '', label: '', received: 0, total: 0 }
      currentMessage = ''
    }
  }

  async function readStream(
    stream: ReadableStream<Uint8Array>,
    ok: DownloadResultItem[],
    failed: DownloadFailedItem[],
    onSummary: (summary: DownloadSummary) => void
  ): Promise<void> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const processLine = (line: string) => {
      if (!line) return
      try {
        handleStreamEvent(JSON.parse(line), ok, failed, onSummary)
      } catch {
        // ignore malformed lines
      }
    }

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim()
        processLine(line)
        buffer = buffer.slice(newlineIndex + 1)
        newlineIndex = buffer.indexOf('\n')
      }
    }
    const trailing = buffer.trim()
    if (trailing.length > 0) {
      processLine(trailing)
    }
  }

  function handleStreamEvent(
    event: any,
    ok: DownloadResultItem[],
    failed: DownloadFailedItem[],
    onSummary: (summary: DownloadSummary) => void
  ): void {
    if (!event || typeof event !== 'object') return
    switch (event.type) {
      case 'file-start': {
        const filename = typeof event.filename === 'string' ? event.filename : ''
        const label = typeof event.label === 'string' && event.label.length > 0 ? event.label : filename
        downloadProgress.current = filename
        downloadProgress.currentLabel = label
        progressTransition = false
        currentFile = { filename, label, received: 0, total: 0 }
        currentMessage = ''
        setTimeout(() => {
          progressTransition = true
        }, 50)
        break
      }
      case 'file-progress': {
        const filename = typeof event.filename === 'string' ? event.filename : currentFile.filename
        if (filename === currentFile.filename || currentFile.filename === '') {
          const received = typeof event.receivedBytes === 'number' && event.receivedBytes >= 0 ? event.receivedBytes : currentFile.received
          const total = typeof event.totalBytes === 'number' && event.totalBytes >= 0 ? event.totalBytes : currentFile.total
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
        const url = typeof event.url === 'string' ? event.url : null
        ok.push({ filename, url })
        currentFile = { filename: '', label: '', received: 0, total: 0 }
        currentMessage = ''
        downloadProgress.completed = Math.min(downloadProgress.total, downloadProgress.completed + 1)
        break
      }
      case 'file-error': {
        const filename = typeof event.filename === 'string' ? event.filename : currentFile.filename
        const error = typeof event.error === 'string' ? event.error : 'Download failed'
        failed.push({ filename, error })
        currentFile = { filename: '', label: '', received: 0, total: 0 }
        currentMessage = error
        downloadProgress.completed = Math.min(downloadProgress.total, downloadProgress.completed + 1)
        break
      }
      case 'overall': {
        if (typeof event.completed === 'number') {
          downloadProgress.completed = event.completed
        }
        break
      }
      case 'all-complete': {
        const summary: DownloadSummary = {
          success: !!event.success,
          ok: extractResultEntries(event.ok),
          failed: extractFailedEntries(event.failed)
        }
        onSummary(summary)
        downloadProgress.completed = summary.ok.length + summary.failed.length
        currentFile = { filename: '', label: '', received: 0, total: 0 }
        currentMessage = ''
        break
      }
      case 'error': {
        const error = typeof event.error === 'string' ? event.error : 'Download failed'
        failed.push({ filename: '__request__', error })
        downloadError = error
        break
      }
    }
  }

  function extractResultEntries(value: unknown): DownloadResultItem[] {
    if (!Array.isArray(value)) return []
    const entries: DownloadResultItem[] = []
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') continue
      const record = entry as Record<string, unknown>
      const filename = record['filename']
      if (typeof filename !== 'string' || filename.length === 0) continue
      const urlValue = record['url']
      entries.push({ filename, url: typeof urlValue === 'string' ? urlValue : null })
    }
    return entries
  }

  function extractFailedEntries(value: unknown): DownloadFailedItem[] {
    if (!Array.isArray(value)) return []
    const entries: DownloadFailedItem[] = []
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') continue
      const record = entry as Record<string, unknown>
      const filename = record['filename']
      if (typeof filename !== 'string' || filename.length === 0) continue
      const errorValue = record['error']
      entries.push({ filename, error: typeof errorValue === 'string' ? errorValue : null })
    }
    return entries
  }

  function isModelPath(dest: string): boolean {
    const normalized = dest.toLowerCase().replace(/\\/g, '/')
    return (
      normalized.includes('/loras/') ||
      normalized.endsWith('/loras') ||
      normalized.includes('/diffusion_models/') ||
      normalized.endsWith('/diffusion_models') ||
      normalized.includes('/checkpoints/') ||
      normalized.endsWith('/checkpoints')
    )
  }

  function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    const value = bytes / Math.pow(1024, exponent)
    const rounded = value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)
    return `${rounded} ${units[exponent]}`
  }
</script>

<DownloadFilesStep
  {title}
  {description}
  filesCount={filesCountText}
  showFilesCount={showFilesCount}
  {items}
  {loading}
  {downloading}
  currentStepActive={currentStepActive}
  {downloadProgress}
  {currentFile}
  {currentMessage}
  {progressPercent}
  {currentFilePercent}
  {progressTransition}
  {result}
  {formatBytes}
/>

{#if !loading && items.length === 0}
  <div class="mt-2 rounded border border-green-200 bg-green-50 p-3 text-xs text-green-700 dark:border-green-500/30 dark:bg-green-900/30 dark:text-green-100">
    {emptyMessage}
  </div>
{:else if !downloading && items.length > 0}
  <div class="mt-2 text-xs text-gray-600 dark:text-gray-400">
    {m['downloads.executeHint']()}
  </div>
{/if}

<script lang="ts">
  import { m } from '$lib/paraglide/messages'
  import CustomNodesStep from '$lib/downloads/CustomNodesStep.svelte'
  import DownloadFilesStep from '$lib/downloads/DownloadFilesStep.svelte'
  import type {
    CustomNodeItem,
    DownloadItem,
    DownloadResultItem,
    DownloadFailedItem,
    DownloadSummary,
    ProgressState,
    DownloadProgressState,
    FileProgressState,
    SkipState
  } from '$lib/downloads/types'

  type SetupStep = 'customNodes' | 'downloadsCore' | 'downloadsModels'

  interface Props {
    isOpen: boolean
    onClose: ((result: { success: boolean }) => void) | undefined
    missingStep1Filenames: string[] | undefined
  }

  let { isOpen = $bindable(), onClose, missingStep1Filenames = [] }: Props = $props()

  let customNodeItems = $state<CustomNodeItem[]>([])
  let customNodesLoading = $state(false)
  let customNodesInstalling = $state(false)
  let customNodesResult: DownloadSummary | null = $state(null)
  let customInstallProgress: ProgressState = $state({ total: 0, completed: 0, current: '' })
  const customProgressPercent = $derived(
    customInstallProgress.total === 0
      ? 0
      : Math.round((customInstallProgress.completed / customInstallProgress.total) * 100)
  )
  let customStarting = $state(false)
  let customStartError = $state('')
  let customStartSuccess = $state(false)
  let customInitialSet = $state(false)
  let customInitiallyRequired = $state(false)

  let downloadsLoading = $state(false)
  let downloadsLoaded = $state(false)
  let allItems = $state<DownloadItem[]>([])
  let downloading = $state(false)
  let currentStep = $state<1 | 2 | null>(null)
  let step1Result: DownloadSummary | null = $state(null)
  let step2Result: DownloadSummary | null = $state(null)
  let downloadProgress: DownloadProgressState = $state({ total: 0, completed: 0, current: '', currentLabel: '' })
  let currentFile: FileProgressState = $state({ filename: '', label: '', received: 0, total: 0 })
  let currentMessage = $state('')
  let progressTransition = $state(true)
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

  let skippedSteps: SkipState = $state({
    customNodes: false,
    downloadsCore: false,
    downloadsModels: false
  })

  function isLargeModelFile(item: DownloadItem): boolean {
    const dest = item.dest.toLowerCase().replace(/\\/g, '/')
    return dest.includes('checkpoints/') || dest.includes('diffusion_models/') || dest.includes('loras/')
  }

  const step1Items = $derived(
    allItems.filter((item) => {
      if (isLargeModelFile(item)) return false
      if (missingStep1Filenames.length > 0) {
        return missingStep1Filenames.includes(item.filename)
      }
      return true
    })
  )
  const step2Items = $derived(allItems.filter((item) => isLargeModelFile(item)))

  function isDownloadSuccess(value: DownloadSummary | null): value is DownloadSummary {
    return value !== null && value.success && value.failed.length === 0
  }

  const customNodesStepComplete = $derived(
    skippedSteps.customNodes || (customInitialSet && (customInitiallyRequired ? customStartSuccess : true))
  )

  const step1Complete = $derived(
    skippedSteps.downloadsCore ||
      isDownloadSuccess(step1Result) ||
      (!downloadsLoading && downloadsLoaded && step1Items.length === 0)
  )

  const step2Complete = $derived(
    skippedSteps.downloadsModels ||
      isDownloadSuccess(step2Result) ||
      (!downloadsLoading && downloadsLoaded && step2Items.length === 0)
  )

  const allComplete = $derived(customNodesStepComplete && step1Complete && step2Complete)

  function skipStep(step: SetupStep) {
    switch (step) {
      case 'customNodes':
        if (!skippedSteps.customNodes) {
          skippedSteps = { ...skippedSteps, customNodes: true }
        }
        break
      case 'downloadsCore':
        if (!skippedSteps.downloadsCore) {
          skippedSteps = { ...skippedSteps, downloadsCore: true }
        }
        break
      case 'downloadsModels':
        if (!skippedSteps.downloadsModels) {
          skippedSteps = { ...skippedSteps, downloadsModels: true }
        }
        break
    }
  }

  function closeDialog() {
    if (!isOpen) {
      return
    }
    isOpen = false
    onClose?.({ success: allComplete })
  }

  function formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    const value = bytes / Math.pow(1024, exponent)
    const rounded = value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)
    return `${rounded} ${units[exponent]}`
  }

  function parseDownloadResult(entry: unknown): DownloadResultItem | null {
    if (!entry || typeof entry !== 'object') return null
    const record = entry as Record<string, unknown>
    const filename = record['filename']
    if (typeof filename !== 'string' || filename.length === 0) {
      return null
    }
    const urlValue = record['url']
    return { filename, url: typeof urlValue === 'string' ? urlValue : null }
  }

  function parseFailedResult(entry: unknown): DownloadFailedItem | null {
    if (!entry || typeof entry !== 'object') return null
    const record = entry as Record<string, unknown>
    const filename = record['filename']
    if (typeof filename !== 'string' || filename.length === 0) {
      return null
    }
    const errorValue = record['error']
    return { filename, error: typeof errorValue === 'string' ? errorValue : null }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      closeDialog()
    }
  }

  function handleClose() {
    closeDialog()
  }

  function resetState() {
    customNodeItems = []
    customNodesLoading = false
    customNodesInstalling = false
    customNodesResult = null
    customInstallProgress = { total: 0, completed: 0, current: '' }
    customStarting = false
    customStartError = ''
    customStartSuccess = false
    customInitialSet = false
    customInitiallyRequired = false

    allItems = []
    downloadsLoading = false
    downloadsLoaded = false
    downloading = false
    currentStep = null
    step1Result = null
    step2Result = null
    downloadProgress = { total: 0, completed: 0, current: '', currentLabel: '' }
    currentFile = { filename: '', label: '', received: 0, total: 0 }
    currentMessage = ''
    progressTransition = true
    skippedSteps = { customNodes: false, downloadsCore: false, downloadsModels: false }
  }

  async function loadCustomNodes() {
    customNodesLoading = true
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
        customNodeItems = parsed
        if (!customInitialSet) {
          customInitiallyRequired = parsed.length > 0
          customInitialSet = true
        }
      } else {
        customNodeItems = []
        if (!customInitialSet) {
          customInitiallyRequired = false
          customInitialSet = true
        }
      }
    } catch {
      customNodeItems = []
      if (!customInitialSet) {
        customInitiallyRequired = false
        customInitialSet = true
      }
    } finally {
      customNodesLoading = false
      if (!customInitialSet) {
        customInitiallyRequired = customNodeItems.length > 0
        customInitialSet = true
      }
    }
  }

  async function installCustomNodes() {
    if (customNodesInstalling) return
    if (skippedSteps.customNodes) {
      skippedSteps = { ...skippedSteps, customNodes: false }
    }
    const targets = [...customNodeItems]
    if (targets.length === 0) {
      customNodesResult = { success: true, ok: [], failed: [] }
      return
    }

    customNodesInstalling = true
    customNodesResult = null
    customStartError = ''
    customStartSuccess = false
    customInstallProgress = { total: targets.length, completed: 0, current: '' }

    const ok: DownloadResultItem[] = []
    const failed: DownloadFailedItem[] = []

    for (const item of targets) {
      customInstallProgress.current = item.label || item.filename
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
        customInstallProgress.completed += 1
      }
    }

    customNodesResult = {
      success: failed.length === 0,
      ok,
      failed
    }
    customInstallProgress.current = ''
    customNodesInstalling = false

    await loadCustomNodes()
  }

  async function startComfy() {
    if (customStarting) {
      return
    }
    if (skippedSteps.customNodes) {
      skippedSteps = { ...skippedSteps, customNodes: false }
    }
    customStarting = true
    customStartError = ''
    customStartSuccess = false
    try {
      const res = await fetch('/api/comfy/start', { method: 'POST' })
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
      customStartSuccess = true
    } catch (err: unknown) {
      customStartError = err instanceof Error ? err.message : String(err)
    } finally {
      customStarting = false
    }
  }

  async function loadDownloadItems() {
    downloadsLoading = true
    downloadsLoaded = false
    downloading = false
    currentStep = null
    step1Result = null
    step2Result = null
    try {
      const res = await fetch('/api/downloads')
      const data = await res.json()
      if (Array.isArray(data?.items)) {
        const parsed: DownloadItem[] = []
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
            category: typeof record['category'] === 'string' ? (record['category'] as string) : null
          })
        }
        allItems = parsed.filter((entry) => entry.category !== 'custom-node')
      } else {
        allItems = []
      }
    } catch {
      allItems = []
    } finally {
      downloadsLoading = false
      downloadsLoaded = true
    }
  }

  async function downloadStep(step: 1 | 2) {
    if (downloading) return
    if (step === 1 && skippedSteps.downloadsCore) {
      skippedSteps = { ...skippedSteps, downloadsCore: false }
    }
    if (step === 2 && skippedSteps.downloadsModels) {
      skippedSteps = { ...skippedSteps, downloadsModels: false }
    }
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
        const resOk: DownloadResultItem[] = []
        if (Array.isArray(record['ok'])) {
          for (const entry of record['ok'] as unknown[]) {
            const parsed = parseDownloadResult(entry)
            if (parsed) resOk.push(parsed)
          }
        }
        const resFailed: DownloadFailedItem[] = []
        if (Array.isArray(record['failed'])) {
          for (const entry of record['failed'] as unknown[]) {
            const parsedFailed = parseFailedResult(entry)
            if (parsedFailed) resFailed.push(parsedFailed)
          }
        }
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
              const received =
                typeof event.receivedBytes === 'number' && event.receivedBytes >= 0
                  ? event.receivedBytes
                  : currentFile.received
              const total =
                typeof event.totalBytes === 'number' && event.totalBytes >= 0 ? event.totalBytes : currentFile.total
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
            const resOk: DownloadResultItem[] = []
            if (Array.isArray(event.ok)) {
              for (const entry of event.ok as unknown[]) {
                const parsed = parseDownloadResult(entry)
                if (parsed) resOk.push(parsed)
              }
            }
            const resFailed: DownloadFailedItem[] = []
            if (Array.isArray(event.failed)) {
              for (const entry of event.failed as unknown[]) {
                const parsedFailed = parseFailedResult(entry)
                if (parsedFailed) resFailed.push(parsedFailed)
              }
            }
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
    if (isOpen) {
      resetState()
      void loadCustomNodes()
      void loadDownloadItems()
    }
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
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="space-y-4">
        <CustomNodesStep
          skipped={skippedSteps.customNodes}
          stepComplete={customNodesStepComplete}
          loading={customNodesLoading}
          items={customNodeItems}
          installing={customNodesInstalling}
          installProgress={customInstallProgress}
          progressPercent={customProgressPercent}
          result={customNodesResult}
          startSuccess={customStartSuccess}
          startError={customStartError}
          starting={customStarting}
          onSkip={() => skipStep('customNodes')}
          onInstall={installCustomNodes}
          onStart={startComfy}
        />

        <DownloadFilesStep
          title={m['downloads.step1Title']()}
          description={m['downloads.step1Description']()}
          filesCount={m['downloads.filesCount']({ count: step1Items.length })}
          showFilesCount={!step1Complete}
          skipped={skippedSteps.downloadsCore}
          complete={step1Complete}
          items={step1Items}
          loading={downloadsLoading}
          downloading={downloading}
          currentStepActive={currentStep === 1}
          downloadProgress={downloadProgress}
          currentFile={currentFile}
          currentMessage={currentMessage}
          progressPercent={progressPercent}
          currentFilePercent={currentFilePercent}
          progressTransition={progressTransition}
          result={step1Result}
          disableButton={downloading || downloadsLoading || step1Complete}
          buttonIdleLabel={m['downloads.downloadStep1']()}
          buttonDownloadingLabel={m['downloads.downloading']()}
          onDownload={() => downloadStep(1)}
          onSkip={() => skipStep('downloadsCore')}
          formatBytes={formatBytes}
        />

        {#if step1Complete}
          <DownloadFilesStep
            title={m['downloads.step2Title']()}
            description={m['downloads.step2Description']()}
            filesCount={m['downloads.filesCount']({ count: step2Items.length })}
            showFilesCount={!step2Complete}
            skipped={skippedSteps.downloadsModels}
            complete={step2Complete}
            items={step2Items}
            loading={downloadsLoading}
            downloading={downloading}
            currentStepActive={currentStep === 2}
            downloadProgress={downloadProgress}
            currentFile={currentFile}
            currentMessage={currentMessage}
            progressPercent={progressPercent}
            currentFilePercent={currentFilePercent}
            progressTransition={progressTransition}
            result={step2Result}
            disableButton={downloading || downloadsLoading || step2Complete}
            buttonIdleLabel={m['downloads.downloadStep2']()}
            buttonDownloadingLabel={m['downloads.downloading']()}
            onDownload={() => downloadStep(2)}
            onSkip={() => skipStep('downloadsModels')}
            formatBytes={formatBytes}
          />
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

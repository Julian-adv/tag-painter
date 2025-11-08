<script lang="ts">
  import { m } from '$lib/paraglide/messages'
  import type {
    DownloadItem,
    DownloadSummary,
    DownloadProgressState,
    FileProgressState
  } from '$lib/downloads/types'

  interface Props {
    title: string
    description: string
    filesCount: string
    showFilesCount: boolean
    items: DownloadItem[]
    loading: boolean
    downloading: boolean
    currentStepActive: boolean
    downloadProgress: DownloadProgressState
    currentFile: FileProgressState
    currentMessage: string
    progressPercent: number
    currentFilePercent: number
    progressTransition: boolean
    result: DownloadSummary | null
    formatBytes: (value: number) => string
  }

  let {
    title,
    description,
    filesCount,
    showFilesCount,
    items,
    loading,
    downloading,
    currentStepActive,
    downloadProgress,
    currentFile,
    currentMessage,
    progressPercent,
    currentFilePercent,
    progressTransition,
    result,
    formatBytes
  }: Props = $props()
</script>

<div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
  <div class="mb-2 flex items-center justify-between">
    <div>
      <h3 class="text-base font-semibold text-gray-900 dark:text-white">
        {title}
      </h3>
      {#if showFilesCount}
        <span class="text-xs text-gray-500">
          {filesCount}
        </span>
      {/if}
    </div>
  </div>
  <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
    {description}
  </p>

  {#if loading}
    <div class="text-sm text-gray-500">{m['downloads.loading']()}</div>
  {:else if items.length > 0}
    <div class="mb-3 max-h-40 overflow-auto rounded border border-gray-200">
      <table class="w-full text-left text-xs">
        <thead class="bg-gray-100 text-gray-700">
          <tr>
            <th class="px-2 py-1">{m['downloads.fileHeader']()}</th>
            <th class="px-2 py-1">{m['downloads.urlHeader']()}</th>
          </tr>
        </thead>
        <tbody>
          {#each items as it}
            <tr class="border-t">
              <td class="px-2 py-1 whitespace-nowrap">{it.filename}</td>
              <td class="px-2 py-1 truncate text-blue-600">
                <a href={it.urls[0] || ''} target="_blank" rel="noreferrer">{it.urls[0] || ''}</a>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if currentStepActive && downloading}
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
          class={`h-full rounded bg-blue-600 ${progressTransition ? 'transition-all' : ''} ${currentFile.total === 0 ? 'animate-pulse opacity-60' : ''}`}
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

  {#if result}
    <div class="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
      <div>{m['downloads.successCount']({ ok: result.ok.length, failed: result.failed.length })}</div>
      {#if result.failed.length > 0}
        <ul class="mt-1 list-disc pl-5 text-red-600">
          {#each result.failed as f}
            <li>{f.filename}{f.error ? ` - ${f.error}` : ''}</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

</div>

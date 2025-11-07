<script lang="ts">
  import { m } from '$lib/paraglide/messages'
  import type { CustomNodeItem, DownloadSummary, ProgressState } from '$lib/downloads/types'

  interface Props {
    skipped: boolean
    stepComplete: boolean
    loading: boolean
    items: CustomNodeItem[]
    installing: boolean
    installProgress: ProgressState
    progressPercent: number
    result: DownloadSummary | null
    startSuccess: boolean
    startError: string
    starting: boolean
    onSkip: () => void
    onInstall: () => void
    onStart: () => void
  }

  let {
    skipped,
    stepComplete,
    loading,
    items,
    installing,
    installProgress,
    progressPercent,
    result,
    startSuccess,
    startError,
    starting,
    onSkip,
    onInstall,
    onStart
  }: Props = $props()
</script>

<div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
  <div class="mb-2 flex items-center justify-between">
    <h3 class="text-base font-semibold text-gray-900 dark:text-white">
      {m['customNodes.installRequired']()}
    </h3>
    <div class="flex items-center gap-2">
      {#if skipped}
        <span class="rounded bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-100">
          {m['downloads.skip']()}
        </span>
      {:else if stepComplete}
        <span class="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-200">
          {m['downloads.completed']()}
        </span>
      {/if}
      {#if !stepComplete}
        <button
          type="button"
          class="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 transition hover:border-gray-400 hover:text-gray-800 dark:border-gray-600 dark:text-gray-200 dark:hover:border-gray-400"
          onclick={onSkip}
        >
          {m['downloads.skip']()}
        </button>
      {/if}
    </div>
  </div>
  <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
    {m['customNodes.description']()}
  </p>

  {#if loading}
    <div class="text-sm text-gray-500">{m['customNodes.loading']()}</div>
  {:else}
    {#if items.length === 0}
      <div class="space-y-3">
        <div class="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-600/40 dark:bg-green-900/40 dark:text-green-100">
          {m['customNodes.allInstalled']()}
        </div>
        <div class="rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-400/40 dark:bg-blue-900/40 dark:text-blue-100">
          {m['customNodes.startPrompt']()}
        </div>
        {#if startSuccess}
          <div class="space-y-2">
            <div class="rounded border border-green-200 bg-green-50 p-2 text-xs text-green-700 dark:border-green-500/40 dark:bg-green-900/40 dark:text-green-200">
              {m['customNodes.startSuccess']()}
            </div>
            <div class="rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900 dark:border-blue-400/40 dark:bg-blue-900/40 dark:text-blue-100">
              {m['customNodes.downloadPrompt']()}
            </div>
          </div>
        {:else if startError}
          <div class="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-900/40 dark:text-red-200">
            {startError}
          </div>
        {/if}
      </div>
    {:else}
      <div class="max-h-64 overflow-auto rounded border border-gray-200">
        <table class="w-full text-left text-xs">
          <thead class="bg-gray-100 text-gray-700">
            <tr>
              <th class="px-2 py-1">{m['customNodes.nameHeader']()}</th>
              <th class="px-2 py-1">{m['customNodes.pathHeader']()}</th>
            </tr>
          </thead>
          <tbody>
            {#each items as it}
              <tr class="border-t">
                <td class="px-2 py-1 whitespace-nowrap">{it.label || it.filename}</td>
                <td class="px-2 py-1 text-xs text-gray-600 dark:text-gray-300">{it.urls[0] || it.dest}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}

  {#if installing}
    <div class="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-400/40 dark:bg-blue-900/40 dark:text-blue-100">
      <div class="flex items-center justify-between">
        <span>{installProgress.current || m['customNodes.installing']()}</span>
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

  {#if result}
    <div class="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
      <div>{m['customNodes.successCount']({ ok: result.ok.length, failed: result.failed.length })}</div>
      {#if result.failed.length > 0}
        <ul class="mt-1 list-disc pl-5 text-red-600">
          {#each result.failed as f}
            <li>{f.filename}{f.error ? ` - ${f.error}` : ''}</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  <div class="mt-4 flex flex-wrap gap-2">
    {#if items.length > 0}
      <button
        type="button"
        class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        onclick={onInstall}
        disabled={installing || loading}
      >
        {installing ? m['customNodes.installing']() : m['customNodes.autoInstall']()}
      </button>
    {:else}
      <button
        type="button"
        class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        onclick={onStart}
        disabled={starting}
      >
        {#if starting}
          {m['customNodes.starting']()}
        {:else}
          {m['customNodes.start']()}
        {/if}
      </button>
    {/if}
  </div>
</div>

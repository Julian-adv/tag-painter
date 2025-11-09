<!-- Component for displaying PNG metadata information -->
<script lang="ts">
  import ClipboardDocument from 'svelte-heros-v2/ClipboardDocument.svelte'

  interface Props {
    metadata: Record<string, unknown> | null
  }

  let { metadata }: Props = $props()

  interface ParsedParameters {
    prompt: string
    all?: string
    firstZone?: string
    secondZone?: string
    negativePrompt?: string
    steps?: string
    sampler?: string
    scheduleType?: string
    cfgScale?: string
    seed?: string
    size?: string
    model?: string
  }

  function parseParameters(parametersText: string): ParsedParameters {
    const lines = parametersText.split('\n')
    const result: ParsedParameters = { prompt: '' }

    let promptLines: string[] = []
    let foundNegativePrompt = false

    for (const line of lines) {
      if (line.startsWith('All: ')) {
        result.all = line.substring(5).trim()
      } else if (line.startsWith('First Zone: ')) {
        result.firstZone = line.substring(12).trim()
      } else if (line.startsWith('Second Zone: ')) {
        result.secondZone = line.substring(13).trim()
      } else if (line.startsWith('Negative prompt: ')) {
        result.negativePrompt = line.substring(17).trim()
        foundNegativePrompt = true
      } else if (line.startsWith('Steps: ')) {
        // Parse the settings line
        const settingsLine = line
        const stepsMatch = settingsLine.match(/Steps: (\d+)/)
        const samplerMatch = settingsLine.match(/Sampler: ([^,]+)/)
        const scheduleMatch = settingsLine.match(/Schedule type: ([^,]+)/)
        const cfgMatch = settingsLine.match(/CFG scale: ([^,]+)/)
        const seedMatch = settingsLine.match(/Seed: ([^,]+)/)
        const sizeMatch = settingsLine.match(/Size: ([^,]+)/)
        const modelMatch = settingsLine.match(/Model: (.+)$/)

        if (stepsMatch) result.steps = stepsMatch[1]
        if (samplerMatch) result.sampler = samplerMatch[1].trim()
        if (scheduleMatch) result.scheduleType = scheduleMatch[1].trim()
        if (cfgMatch) result.cfgScale = cfgMatch[1].trim()
        if (seedMatch) result.seed = seedMatch[1].trim()
        if (sizeMatch) result.size = sizeMatch[1].trim()
        if (modelMatch) result.model = modelMatch[1].trim()
      } else if (!foundNegativePrompt && line.trim()) {
        promptLines.push(line)
      }
    }

    result.prompt = promptLines.join('\n').trim()
    return result
  }

  function formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '-'
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2)
      } catch {
        return String(value)
      }
    }
    return String(value)
  }

  function getMetadataEntries(data: Record<string, unknown> | null): [string, unknown][] {
    if (!data) {
      return []
    }
    return Object.entries(data)
  }

  let copiedField = $state<string | null>(null)

  async function copyToClipboard(text: string, fieldName: string) {
    try {
      // Try using the modern clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
        copiedField = fieldName
        setTimeout(() => {
          copiedField = null
        }, 300)
      } else {
        // Fallback for older browsers or insecure contexts
        const textArea = document.createElement('textarea')
        textArea.value = text
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        document.body.appendChild(textArea)
        textArea.select()
        try {
          document.execCommand('copy')
          copiedField = fieldName
          setTimeout(() => {
            copiedField = null
          }, 300)
        } catch (fallbackErr) {
          console.error('Fallback copy failed:', fallbackErr)
          alert('Failed to copy to clipboard')
        }
        document.body.removeChild(textArea)
      }
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
      alert('Failed to copy to clipboard')
    }
  }
</script>

<div class="flex h-full flex-col border-gray-300 bg-white p-0 shadow-sm">
  <div class="flex-1 overflow-auto">
    {#if !metadata}
      <p class="text-sm text-gray-500">No metadata available</p>
    {:else}
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr class="border-b border-gray-300 bg-gray-50">
            <th class="px-3 py-2 text-left font-semibold text-gray-700">Key</th>
            <th class="px-3 py-2 text-left font-semibold text-gray-700">Value</th>
          </tr>
        </thead>
        <tbody>
          {#each getMetadataEntries(metadata) as [key, value]}
            {#if key === 'parameters'}
              {@const parsed = parseParameters(String(value))}
              <tr class="border-b-0 hover:bg-gray-50">
                <td class="px-3 py-2 text-left font-medium text-gray-800">{key}</td>
                <td class="px-3 py-2"></td>
              </tr>
              {#if parsed.prompt}
                <tr class="border-b-0 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-medium text-gray-800">Prompt</td>
                  <td class="px-3 py-2 text-right">
                    <button
                      onclick={() => copyToClipboard(parsed.prompt, 'prompt')}
                      class="rounded p-1 {copiedField === 'prompt'
                        ? 'bg-green-500 text-white'
                        : 'text-gray-600 hover:bg-gray-200 hover:text-gray-800'}"
                      title={copiedField === 'prompt' ? 'Copied!' : 'Copy to clipboard'}
                    >
                      <ClipboardDocument class="h-4 w-4" />
                    </button>
                  </td>
                </tr>
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td
                    colspan="2"
                    class="px-3 py-2 text-left break-words whitespace-pre-wrap text-gray-600"
                  >
                    {parsed.prompt}
                  </td>
                </tr>
              {/if}
              {#if parsed.all}
                <tr class="border-b-0 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-medium text-gray-800">All</td>
                  <td class="px-3 py-2 text-right">
                    <button
                      onclick={() => copyToClipboard(parsed.all ?? '', 'all')}
                      class="rounded p-1 {copiedField === 'all'
                        ? 'bg-green-500 text-white'
                        : 'text-gray-600 hover:bg-gray-200 hover:text-gray-800'}"
                      title={copiedField === 'all' ? 'Copied!' : 'Copy to clipboard'}
                    >
                      <ClipboardDocument class="h-4 w-4" />
                    </button>
                  </td>
                </tr>
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td
                    colspan="2"
                    class="px-3 py-2 text-left break-words whitespace-pre-wrap text-gray-600"
                  >
                    {parsed.all}
                  </td>
                </tr>
              {/if}
              {#if parsed.firstZone}
                <tr class="border-b-0 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-medium text-gray-800">First Zone</td>
                  <td class="px-3 py-2 text-right">
                    <button
                      onclick={() => copyToClipboard(parsed.firstZone ?? '', 'firstZone')}
                      class="rounded p-1 {copiedField === 'firstZone'
                        ? 'bg-green-500 text-white'
                        : 'text-gray-600 hover:bg-gray-200 hover:text-gray-800'}"
                      title={copiedField === 'firstZone' ? 'Copied!' : 'Copy to clipboard'}
                    >
                      <ClipboardDocument class="h-4 w-4" />
                    </button>
                  </td>
                </tr>
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td
                    colspan="2"
                    class="px-3 py-2 text-left break-words whitespace-pre-wrap text-gray-600"
                  >
                    {parsed.firstZone}
                  </td>
                </tr>
              {/if}
              {#if parsed.secondZone}
                <tr class="border-b-0 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-medium text-gray-800">Second Zone</td>
                  <td class="px-3 py-2 text-right">
                    <button
                      onclick={() => copyToClipboard(parsed.secondZone ?? '', 'secondZone')}
                      class="rounded p-1 {copiedField === 'secondZone'
                        ? 'bg-green-500 text-white'
                        : 'text-gray-600 hover:bg-gray-200 hover:text-gray-800'}"
                      title={copiedField === 'secondZone' ? 'Copied!' : 'Copy to clipboard'}
                    >
                      <ClipboardDocument class="h-4 w-4" />
                    </button>
                  </td>
                </tr>
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td
                    colspan="2"
                    class="px-3 py-2 text-left break-words whitespace-pre-wrap text-gray-600"
                  >
                    {parsed.secondZone}
                  </td>
                </tr>
              {/if}
              {#if parsed.negativePrompt}
                <tr class="border-b-0 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-medium text-gray-800">Negative Prompt</td>
                  <td class="px-3 py-2 text-right">
                    <button
                      onclick={() => copyToClipboard(parsed.negativePrompt ?? '', 'negativePrompt')}
                      class="rounded p-1 {copiedField === 'negativePrompt'
                        ? 'bg-green-500 text-white'
                        : 'text-gray-600 hover:bg-gray-200 hover:text-gray-800'}"
                      title={copiedField === 'negativePrompt' ? 'Copied!' : 'Copy to clipboard'}
                    >
                      <ClipboardDocument class="h-4 w-4" />
                    </button>
                  </td>
                </tr>
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td
                    colspan="2"
                    class="px-3 py-2 text-left break-words whitespace-pre-wrap text-gray-600"
                  >
                    {parsed.negativePrompt}
                  </td>
                </tr>
              {/if}
              {#if parsed.steps}
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-medium text-gray-800">Steps</td>
                  <td class="px-3 py-2 text-left text-gray-600">{parsed.steps}</td>
                </tr>
              {/if}
              {#if parsed.sampler}
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-medium text-gray-800">Sampler</td>
                  <td class="px-3 py-2 text-left text-gray-600">{parsed.sampler}</td>
                </tr>
              {/if}
              {#if parsed.scheduleType}
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-medium text-gray-800">Schedule Type</td>
                  <td class="px-3 py-2 text-left text-gray-600">{parsed.scheduleType}</td>
                </tr>
              {/if}
              {#if parsed.cfgScale}
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-medium text-gray-800">CFG Scale</td>
                  <td class="px-3 py-2 text-left text-gray-600">{parsed.cfgScale}</td>
                </tr>
              {/if}
              {#if parsed.seed}
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-medium text-gray-800">Seed</td>
                  <td class="px-3 py-2 text-left text-gray-600">{parsed.seed}</td>
                </tr>
              {/if}
              {#if parsed.size}
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-medium text-gray-800">Size</td>
                  <td class="px-3 py-2 text-left text-gray-600">{parsed.size}</td>
                </tr>
              {/if}
              {#if parsed.model}
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-medium text-gray-800">Model</td>
                  <td class="px-3 py-2 text-left text-gray-600">{parsed.model}</td>
                </tr>
              {/if}
            {:else}
              <tr class="border-b border-gray-200 hover:bg-gray-50">
                <td class="px-3 py-2 text-left font-medium text-gray-800">{key}</td>
                <td class="px-3 py-2 text-left break-words whitespace-pre-wrap text-gray-600">
                  {formatValue(value)}
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

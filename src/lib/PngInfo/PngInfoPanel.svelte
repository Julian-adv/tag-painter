<!-- Component for displaying PNG metadata information -->
<script lang="ts">
  import CopyButton from './CopyButton.svelte'

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
    loras?: { name: string; weight: number }[]
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
        const modelMatch = settingsLine.match(/Model: ([^,]+?)(?:, Lora:|$)/)
        const loraMatch = settingsLine.match(/Lora: (.+)$/)

        if (stepsMatch) result.steps = stepsMatch[1]
        if (samplerMatch) result.sampler = samplerMatch[1].trim()
        if (scheduleMatch) result.scheduleType = scheduleMatch[1].trim()
        if (cfgMatch) result.cfgScale = cfgMatch[1].trim()
        if (seedMatch) result.seed = seedMatch[1].trim()
        if (sizeMatch) result.size = sizeMatch[1].trim()
        if (modelMatch) result.model = modelMatch[1].trim()

        // Parse LoRA information
        if (loraMatch) {
          const loraString = loraMatch[1].trim()
          const loraItems = loraString.split(', ')
          result.loras = loraItems
            .map((item) => {
              const parts = item.split(':')
              if (parts.length === 2) {
                return {
                  name: parts[0].trim(),
                  weight: parseFloat(parts[1].trim())
                }
              }
              return null
            })
            .filter((lora): lora is { name: string; weight: number } => lora !== null)
        }
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
</script>

<div class="flex h-full flex-col border-gray-300 bg-white p-0 shadow-sm">
  <div class="flex-1 overflow-auto">
    {#if !metadata}
      <p class="text-sm text-gray-500">No metadata available</p>
    {:else}
      <table class="w-full border-collapse text-sm max-w-full" style="table-layout: fixed;">
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
                    <CopyButton text={parsed.prompt} />
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
                    <CopyButton text={parsed.all ?? ''} />
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
                    <CopyButton text={parsed.firstZone ?? ''} />
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
                    <CopyButton text={parsed.secondZone ?? ''} />
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
                    <CopyButton text={parsed.negativePrompt ?? ''} />
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
              {#if parsed.loras && parsed.loras.length > 0}
                <tr class="border-b-0 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-medium text-gray-800">LoRAs</td>
                  <td class="px-3 py-2 text-right">
                    <CopyButton
                      text={parsed.loras?.map((l) => `${l.name}:${l.weight}`).join(', ') ?? ''}
                    />
                  </td>
                </tr>
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td colspan="2" class="px-3 py-2">
                    <div class="flex flex-col gap-1">
                      {#each parsed.loras as lora}
                        <div class="flex items-center gap-4 text-sm min-w-0">
                          <span class="text-gray-700 truncate flex-1 text-left" title={lora.name}
                            >{lora.name}</span
                          >
                          <span class="text-gray-500 flex-shrink-0">{lora.weight}</span>
                        </div>
                      {/each}
                    </div>
                  </td>
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

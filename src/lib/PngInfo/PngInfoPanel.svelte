<!-- Component for displaying PNG metadata information -->
<script lang="ts">
  import CopyButton from './CopyButton.svelte'

  interface Props {
    metadata: Record<string, unknown> | null
  }

  let { metadata }: Props = $props()

  interface ParameterSet {
    steps: string | null
    sampler: string | null
    scheduleType: string | null
    cfgScale: string | null
    seed: string | null
    size: string | null
    model: string | null
    clipSkip: string | null
    scale: string | null
    denoise: string | null
  }

  interface ParsedParameters {
    prompt: string
    all: string | null
    firstZone: string | null
    secondZone: string | null
    negativePrompt: string | null
    base: ParameterSet
    upscale: ParameterSet | null
    faceDetailer: ParameterSet | null
    loras: { name: string; weight: number }[]
  }

  function createEmptyParameterSet(): ParameterSet {
    return {
      steps: null,
      sampler: null,
      scheduleType: null,
      cfgScale: null,
      seed: null,
      size: null,
      model: null,
      clipSkip: null,
      scale: null,
      denoise: null
    }
  }

  function parseParameterSection(parametersLine: string): {
    values: ParameterSet
    loras: { name: string; weight: number }[]
  } {
    const values = createEmptyParameterSet()
    const loras: { name: string; weight: number }[] = []

    const stepsMatch = parametersLine.match(/Steps: ([^,]+)/)
    const samplerMatch = parametersLine.match(/Sampler: ([^,]+)/)
    const scheduleMatch = parametersLine.match(/Schedule type: ([^,]+)/)
    const cfgMatch = parametersLine.match(/CFG scale: ([^,]+)/)
    const seedMatch = parametersLine.match(/Seed: ([^,]+)/)
    const sizeMatch = parametersLine.match(/Size: ([^,]+)/)
    const modelMatch = parametersLine.match(/Model: ([^,]+?)(?:, Lora:|$)/)
    const loraMatch = parametersLine.match(/Lora: (.+?)(?:, Lora hashes:|, Hires |$)/)
    const clipSkipMatch = parametersLine.match(/CLIP skip: ([^,]+)/)
    const scaleMatch = parametersLine.match(/Scale: ([^,]+)/)
    const denoiseMatch = parametersLine.match(/Denoise: ([^,]+)/)

    if (stepsMatch) values.steps = stepsMatch[1].trim()
    if (samplerMatch) values.sampler = samplerMatch[1].trim()
    if (scheduleMatch) values.scheduleType = scheduleMatch[1].trim()
    if (cfgMatch) values.cfgScale = cfgMatch[1].trim()
    if (seedMatch) values.seed = seedMatch[1].trim()
    if (sizeMatch) values.size = sizeMatch[1].trim()
    if (modelMatch) values.model = modelMatch[1].trim()
    if (clipSkipMatch) values.clipSkip = clipSkipMatch[1].trim()
    if (scaleMatch) values.scale = scaleMatch[1].trim()
    if (denoiseMatch) values.denoise = denoiseMatch[1].trim()

    if (loraMatch) {
      const loraString = loraMatch[1].trim()
      const loraItems = loraString.split(', ')
      loraItems.forEach((item) => {
        const parts = item.split(':')
        if (parts.length === 2) {
          const weight = parseFloat(parts[1].trim())
          loras.push({
            name: parts[0].trim(),
            weight
          })
        }
      })
    }

    return { values, loras }
  }

  function parseParameters(parametersText: string): ParsedParameters {
    const lines = parametersText.split('\n')
    const result: ParsedParameters = {
      prompt: '',
      all: null,
      firstZone: null,
      secondZone: null,
      negativePrompt: null,
      base: createEmptyParameterSet(),
      upscale: null,
      faceDetailer: null,
      loras: []
    }

    let promptLines: string[] = []
    let foundNegativePrompt = false

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('All: ')) {
        result.all = trimmed.substring(5).trim()
      } else if (trimmed.startsWith('First Zone: ')) {
        result.firstZone = trimmed.substring(12).trim()
      } else if (trimmed.startsWith('Second Zone: ')) {
        result.secondZone = trimmed.substring(13).trim()
      } else if (trimmed.startsWith('Negative prompt: ')) {
        result.negativePrompt = trimmed.substring(17).trim()
        foundNegativePrompt = true
      } else if (trimmed.startsWith('Steps: ')) {
        const parsed = parseParameterSection(trimmed)
        result.base = parsed.values
        if (parsed.loras.length > 0) {
          result.loras = parsed.loras
        }
      } else if (trimmed.startsWith('Upscale:')) {
        const parsed = parseParameterSection(trimmed.replace(/^Upscale:\s*/, ''))
        result.upscale = parsed.values
      } else if (trimmed.startsWith('Face detailer:')) {
        const parsed = parseParameterSection(trimmed.replace(/^Face detailer:\s*/, ''))
        result.faceDetailer = parsed.values
      } else if (!foundNegativePrompt && trimmed) {
        promptLines.push(line)
      }
    }

    result.prompt = promptLines.join('\n').trim()
    return result
  }

  function hasParameterData(params: ParameterSet | null): boolean {
    if (!params) {
      return false
    }
    return Boolean(
      params.steps ||
        params.sampler ||
        params.scheduleType ||
        params.cfgScale ||
        params.seed ||
        params.size ||
        params.model ||
        params.clipSkip ||
        params.scale ||
        params.denoise
    )
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
      <table class="w-full max-w-full border-collapse text-sm" style="table-layout: fixed;">
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
              {#if parsed.base.model}
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-medium text-gray-800">Model</td>
                  <td class="px-3 py-2 text-left text-gray-600">{parsed.base.model}</td>
                </tr>
              {/if}
              {#if parsed.base.cfgScale}
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-medium text-gray-800">CFG Scale</td>
                  <td class="px-3 py-2 text-left text-gray-600">{parsed.base.cfgScale}</td>
                </tr>
              {/if}
              {#if parsed.base.steps}
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-medium text-gray-800">Steps</td>
                  <td class="px-3 py-2 text-left text-gray-600">{parsed.base.steps}</td>
                </tr>
              {/if}
              {#if parsed.base.sampler}
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-medium text-gray-800">Sampler</td>
                  <td class="px-3 py-2 text-left text-gray-600">{parsed.base.sampler}</td>
                </tr>
              {/if}
              {#if parsed.base.scheduleType}
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-medium text-gray-800">Schedule Type</td>
                  <td class="px-3 py-2 text-left text-gray-600">{parsed.base.scheduleType}</td>
                </tr>
              {/if}
              {#if parsed.base.seed}
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-medium text-gray-800">Seed</td>
                  <td class="px-3 py-2 text-left text-gray-600">{parsed.base.seed}</td>
                </tr>
              {/if}
              {#if parsed.base.clipSkip}
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-medium text-gray-800">CLIP Skip</td>
                  <td class="px-3 py-2 text-left text-gray-600">{parsed.base.clipSkip}</td>
                </tr>
              {/if}
              {#if parsed.base.size}
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-medium text-gray-800">Size</td>
                  <td class="px-3 py-2 text-left text-gray-600">{parsed.base.size}</td>
                </tr>
              {/if}
              {#if parsed.loras.length > 0}
                <tr class="border-b-0 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-medium text-gray-800">LoRAs</td>
                  <td class="px-3 py-2 text-right">
                    <CopyButton
                      text={parsed.loras.map((l) => `${l.name}:${l.weight}`).join(', ')}
                    />
                  </td>
                </tr>
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td colspan="2" class="px-3 py-2">
                    <div class="flex flex-col gap-1">
                      {#each parsed.loras as lora}
                        <div class="flex min-w-0 items-center gap-4 text-sm">
                          <span class="flex-1 truncate text-left text-gray-700" title={lora.name}
                            >{lora.name}</span
                          >
                          <span class="flex-shrink-0 text-gray-500">{lora.weight}</span>
                        </div>
                      {/each}
                    </div>
                  </td>
                </tr>
              {/if}
              {#if hasParameterData(parsed.upscale)}
                <tr class="border-b-0 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-semibold text-gray-800">Upscale</td>
                  <td class="px-3 py-2"></td>
                </tr>
                {#if parsed.upscale?.model}
                  <tr class="border-b border-gray-200 hover:bg-gray-50">
                    <td class="px-3 py-2 text-left font-medium text-gray-800">Model</td>
                    <td class="px-3 py-2 text-left text-gray-600">{parsed.upscale.model}</td>
                  </tr>
                {/if}
                {#if parsed.upscale?.scale}
                  <tr class="border-b border-gray-200 hover:bg-gray-50">
                    <td class="px-3 py-2 text-left font-medium text-gray-800">Scale</td>
                    <td class="px-3 py-2 text-left text-gray-600">{parsed.upscale.scale}</td>
                  </tr>
                {/if}
                {#if parsed.upscale?.steps}
                  <tr class="border-b border-gray-200 hover:bg-gray-50">
                    <td class="px-3 py-2 text-left font-medium text-gray-800">Steps</td>
                    <td class="px-3 py-2 text-left text-gray-600">{parsed.upscale.steps}</td>
                  </tr>
                {/if}
                {#if parsed.upscale?.cfgScale}
                  <tr class="border-b border-gray-200 hover:bg-gray-50">
                    <td class="px-3 py-2 text-left font-medium text-gray-800">CFG Scale</td>
                    <td class="px-3 py-2 text-left text-gray-600">{parsed.upscale.cfgScale}</td>
                  </tr>
                {/if}
                {#if parsed.upscale?.sampler}
                  <tr class="border-b border-gray-200 hover:bg-gray-50">
                    <td class="px-3 py-2 text-left font-medium text-gray-800">Sampler</td>
                    <td class="px-3 py-2 text-left text-gray-600">{parsed.upscale.sampler}</td>
                  </tr>
                {/if}
                {#if parsed.upscale?.scheduleType}
                  <tr class="border-b border-gray-200 hover:bg-gray-50">
                    <td class="px-3 py-2 text-left font-medium text-gray-800">Schedule Type</td>
                    <td class="px-3 py-2 text-left text-gray-600">{parsed.upscale.scheduleType}</td>
                  </tr>
                {/if}
                {#if parsed.upscale?.denoise}
                  <tr class="border-b border-gray-200 hover:bg-gray-50">
                    <td class="px-3 py-2 text-left font-medium text-gray-800">Denoise</td>
                    <td class="px-3 py-2 text-left text-gray-600">{parsed.upscale.denoise}</td>
                  </tr>
                {/if}
              {/if}
              {#if hasParameterData(parsed.faceDetailer)}
                <tr class="border-b-0 hover:bg-gray-50">
                  <td class="px-3 py-2 text-left font-semibold text-gray-800">Face Detailer</td>
                  <td class="px-3 py-2"></td>
                </tr>
                {#if parsed.faceDetailer?.model}
                  <tr class="border-b border-gray-200 hover:bg-gray-50">
                    <td class="px-3 py-2 text-left font-medium text-gray-800">Model</td>
                    <td class="px-3 py-2 text-left text-gray-600">{parsed.faceDetailer.model}</td>
                  </tr>
                {/if}
                {#if parsed.faceDetailer?.steps}
                  <tr class="border-b border-gray-200 hover:bg-gray-50">
                    <td class="px-3 py-2 text-left font-medium text-gray-800">Steps</td>
                    <td class="px-3 py-2 text-left text-gray-600">{parsed.faceDetailer.steps}</td>
                  </tr>
                {/if}
                {#if parsed.faceDetailer?.cfgScale}
                  <tr class="border-b border-gray-200 hover:bg-gray-50">
                    <td class="px-3 py-2 text-left font-medium text-gray-800">CFG Scale</td>
                    <td class="px-3 py-2 text-left text-gray-600">{parsed.faceDetailer.cfgScale}</td
                    >
                  </tr>
                {/if}
                {#if parsed.faceDetailer?.sampler}
                  <tr class="border-b border-gray-200 hover:bg-gray-50">
                    <td class="px-3 py-2 text-left font-medium text-gray-800">Sampler</td>
                    <td class="px-3 py-2 text-left text-gray-600">{parsed.faceDetailer.sampler}</td>
                  </tr>
                {/if}
                {#if parsed.faceDetailer?.scheduleType}
                  <tr class="border-b border-gray-200 hover:bg-gray-50">
                    <td class="px-3 py-2 text-left font-medium text-gray-800">Schedule Type</td>
                    <td class="px-3 py-2 text-left text-gray-600">
                      {parsed.faceDetailer.scheduleType}
                    </td>
                  </tr>
                {/if}
                {#if parsed.faceDetailer?.denoise}
                  <tr class="border-b border-gray-200 hover:bg-gray-50">
                    <td class="px-3 py-2 text-left font-medium text-gray-800">Denoise</td>
                    <td class="px-3 py-2 text-left text-gray-600">{parsed.faceDetailer.denoise}</td>
                  </tr>
                {/if}
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

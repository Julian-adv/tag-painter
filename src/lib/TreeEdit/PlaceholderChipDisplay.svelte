<script lang="ts">
  import type { TreeModel } from './model'
  import { isConsistentRandomArray, findNodeByName } from './utils'
  import { createPlaceholderRegex } from '$lib/constants'

  interface Props {
    value: string
    placeholder: string
    model: TreeModel | null
    onChipDoubleClick?: (tagName: string) => void
  }

  let { value, placeholder, model, onChipDoubleClick }: Props = $props()

  // Split text into text segments and placeholder chips
  type Seg =
    | { kind: 'text'; text: string }
    | { kind: 'chip'; name: string; type: 'random' | 'consistent-random' | 'unknown' }

  type ChoiceSeg = { kind: 'text'; text: string } | { kind: 'choice'; options: string[] }

  // Use shared regex factory to avoid state sharing across matches
  const placeholderRe = createPlaceholderRegex()

  function getTagType(tagName: string): 'random' | 'consistent-random' | 'unknown' {
    if (!model) return 'unknown'
    const node = findNodeByName(model, tagName)
    if (!node) return 'unknown'
    if (node.kind === 'array') {
      return isConsistentRandomArray(model, node.id) ? 'consistent-random' : 'random'
    }
    if (node.kind === 'object') return 'random'
    return 'unknown'
  }

  let displaySegments = $derived.by<Seg[]>(() => {
    const text = value || ''
    const segs: Seg[] = []
    let last = 0
    placeholderRe.lastIndex = 0
    for (const match of text.matchAll(placeholderRe)) {
      const idx = match.index ?? 0
      if (idx > last) {
        segs.push({ kind: 'text', text: text.slice(last, idx) })
      }
      const name = match[1]
      const t = getTagType(name)
      segs.push({ kind: 'chip', name, type: t })
      last = idx + match[0].length
    }
    if (last < text.length) {
      segs.push({ kind: 'text', text: text.slice(last) })
    }
    return segs
  })

  function splitChoiceSegments(text: string): ChoiceSeg[] {
    const result: ChoiceSeg[] = []
    const choiceRe = /\{([^{}]*\|[^{}]*)\}/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = choiceRe.exec(text)) !== null) {
      const index = match.index ?? 0
      if (index > lastIndex) {
        result.push({ kind: 'text', text: text.slice(lastIndex, index) })
      }

      const rawOptions = match[1]?.split('|') ?? []
      const options = rawOptions.map((option) => option.trim())

      if (options.length > 0) {
        result.push({ kind: 'choice', options })
      } else {
        result.push({ kind: 'text', text: match[0] })
      }

      lastIndex = choiceRe.lastIndex
    }

    if (lastIndex < text.length) {
      result.push({ kind: 'text', text: text.slice(lastIndex) })
    }

    return result
  }
</script>

{#if value}
  <span class="chip-flow">
    {#if displaySegments.length === 0}
      <span class="text-segment">{value}</span>
    {:else}
      {#each displaySegments as seg, i (i)}
        {#if seg.kind === 'text'}
          {@const choiceSegments = splitChoiceSegments(seg.text)}
          {#each choiceSegments as choice, j (`text-${i}-${j}`)}
            {#if choice.kind === 'text'}
              <span class="text-segment">{choice.text}</span>
            {:else}
              {@const accessibleLabel = choice.options
                .map((option) => (option === '' ? 'empty choice' : option))
                .join(' or ')}
              <span class="chip choice" tabindex="-1" aria-label={accessibleLabel}>
                {#each choice.options as option, k ('choice-' + i + '-' + j + '-' + k)}
                  {#if k > 0}
                    <span class="choice-separator" aria-hidden="true"></span>
                  {/if}
                  <span class="choice-option">
                    {option === '' ? String.fromCharCode(160) : option}
                  </span>
                {/each}
              </span>
            {/if}
          {/each}
        {:else}
          <span
            class="chip {seg.type === 'random'
              ? 'random'
              : seg.type === 'consistent-random'
                ? 'consistent'
                : 'unknown'}"
            title={seg.type}
            ondblclick={(e) => {
              e.stopPropagation()
              onChipDoubleClick?.(seg.name)
            }}
            role="button"
            tabindex="-1"
          >
            {seg.name}
          </span>
        {/if}
      {/each}
    {/if}
  </span>
{:else}
  {placeholder}
{/if}

<style>
  .chip-flow {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    row-gap: 2px;
  }
  .text-segment {
    display: inline;
    white-space: pre-wrap;
    min-width: 0;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0 0.35rem 0.0625rem 0.35rem;
    margin: 0.0625rem 0.125rem;
    border-radius: 0.375rem;
    border: 1px dashed #d1d5db;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }
  .chip.random {
    background-color: #f3e8ff;
    color: #6b21a8;
    border-color: #c084fc;
  }
  .chip.random:hover {
    background-color: #e9d5ff;
  }
  .chip.consistent {
    background-color: #ffedd5;
    color: #9a3412;
    border-color: #fb923c;
  }
  .chip.consistent:hover {
    background-color: #fed7aa;
  }
  .chip.unknown {
    background-color: #e5e7eb;
    color: #374151;
    border-color: #d1d5db;
  }
  .chip.unknown:hover {
    background-color: #d1d5db;
  }
  .chip.choice {
    background-color: #ecfccb;
    color: #1f3c08;
    border-color: #166534;
  }
  .chip.choice:hover {
    background-color: #d9f99d;
  }
  .choice-separator {
    display: inline-flex;
    align-self: stretch;
    width: 0;
    border-left: 1px dashed #166534;
    box-sizing: border-box;
  }
  .choice-option {
    display: inline-flex;
    align-items: center;
    white-space: pre;
  }
</style>

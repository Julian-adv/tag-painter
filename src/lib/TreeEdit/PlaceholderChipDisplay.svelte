<script lang="ts">
  import type { TreeModel } from './model'
  import { isConsistentRandomArray, findNodeByName } from './utils'

  interface Props {
    value: string
    placeholder: string
    model: TreeModel | null
  }

  let { value, placeholder, model }: Props = $props()

  // Split text into text segments and placeholder chips
  type Seg =
    | { kind: 'text'; text: string }
    | { kind: 'chip'; name: string; type: 'random' | 'consistent-random' | 'unknown' }

  const placeholderRe = /__([\p{L}\p{N}_\- ]+)__/gu

  function getTagType(tagName: string): 'random' | 'consistent-random' | 'unknown' {
    if (!model) return 'unknown'
    const node = findNodeByName(model, tagName)
    if (!node || node.kind !== 'array') return 'unknown'
    return isConsistentRandomArray(model, node.id) ? 'consistent-random' : 'random'
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
</script>

{#if value}
  {#if displaySegments.length === 0}
    {value}
  {:else}
    {#each displaySegments as seg, i (i)}
      {#if seg.kind === 'text'}
        <span>{seg.text}</span>
      {:else}
        <span
          class="chip {seg.type === 'random'
            ? 'random'
            : seg.type === 'consistent-random'
              ? 'consistent'
              : 'unknown'}"
          title={seg.type}
        >
          {seg.name}
        </span>
      {/if}
    {/each}
  {/if}
{:else}
  {placeholder}
{/if}

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.25rem;
    margin: 0 0.15rem;
    border-radius: 0.375rem;
    border: 1px dashed #d1d5db;
    white-space: nowrap;
  }
  .chip.random {
    background-color: #f3e8ff;
    color: #6b21a8;
    border-color: #c084fc;
  }
  .chip.consistent {
    background-color: #ffedd5;
    color: #9a3412;
    border-color: #fb923c;
  }
  .chip.unknown {
    background-color: #e5e7eb;
    color: #374151;
    border-color: #d1d5db;
  }
</style>

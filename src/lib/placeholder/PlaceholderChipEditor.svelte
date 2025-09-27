<script lang="ts">
  import { onMount } from 'svelte'
  import { createPlaceholderRegex } from '$lib/constants'
  import { findNodeByName, isConsistentRandomArray } from '../TreeEdit/utils'
  import type { TreeModel } from '../TreeEdit/model'

  interface Props {
    id: string
    value: string
    placeholder: string
    model: TreeModel | null
    currentRandomTagResolutions: Record<string, string>
    disabled: boolean
    onValueChange: (value: string) => void
    onChipDoubleClick: (tagName: string) => void
    refreshToken?: number
  }

  let {
    id,
    value = $bindable(),
    placeholder,
    model = null,
    currentRandomTagResolutions = {},
    disabled = false,
    onValueChange = () => {},
    onChipDoubleClick = () => {},
    refreshToken = 0
  }: Props = $props()

  type Seg =
    | { kind: 'text'; text: string }
    | {
        kind: 'chip'
        name: string
        type: 'random' | 'consistent-random' | 'unknown'
        resolution: string | null
      }
    | { kind: 'choice'; options: string[] }

  const placeholderRe = createPlaceholderRegex()
  const hasDocument = typeof document !== 'undefined'

  function scheduleFrame(cb: FrameRequestCallback) {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(cb)
      return
    }
    setTimeout(() => cb(Date.now()), 0)
  }

  function serializeNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent ?? '').replace(/\u200B/g, '')
    }

    if (!(node instanceof HTMLElement)) {
      return ''
    }

    if (node.dataset.anchor === 'true') {
      return ''
    }

    const placeholderName = node.dataset.placeholderName
    if (placeholderName) {
      return `__${placeholderName}__`
    }

    if (node.tagName === 'BR') {
      return '\n'
    }

    if (node.tagName === 'DIV') {
      return serializeChildren(node) + '\n'
    }

    return serializeChildren(node)
  }

  function serializeChildren(node: Node): string {
    let result = ''
    node.childNodes.forEach((child) => {
      result += serializeNode(child)
    })
    return result
  }

  let editableEl: HTMLDivElement | null = null
  let skipDomSync = false

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

  function getResolutionSignature(map: Record<string, string>): string {
    const keys = Object.keys(map).sort()
    if (keys.length === 0) return ''
    return keys.map((key) => `${key}=>${map[key]}`).join('|')
  }

  function getSegments(text: string, resolutions: Record<string, string>): Seg[] {
    const segs: Seg[] = []
    let last = 0
    placeholderRe.lastIndex = 0
    for (const match of text.matchAll(placeholderRe)) {
      const idx = match.index ?? 0
      if (idx > last) {
        const textSegment = text.slice(last, idx)
        // Split text segments by choice patterns and add them
        const choiceParts = splitChoiceSegments(textSegment)
        segs.push(...choiceParts)
      }
      const name = match[1]
      const t = getTagType(name)
      const hasResolution = Object.prototype.hasOwnProperty.call(resolutions, name)
      const resolvedValue = hasResolution ? resolutions[name] : null
      segs.push({ kind: 'chip', name, type: t, resolution: resolvedValue })
      last = idx + match[0].length
    }
    if (last < text.length) {
      const textSegment = text.slice(last)
      // Split text segments by choice patterns and add them
      const choiceParts = splitChoiceSegments(textSegment)
      segs.push(...choiceParts)
    }
    return segs
  }

  function splitChoiceSegments(text: string): Seg[] {
    const result: Seg[] = []
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

  function extractValueFromDom(root: HTMLElement): string {
    return serializeChildren(root)
  }

  function getSelectionOffsets(root: HTMLElement): { start: number; end: number } | null {
    if (!hasDocument) return null
    const selection = document.getSelection()
    if (!selection || selection.rangeCount === 0) return null
    const range = selection.getRangeAt(0)
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
      return null
    }

    const startRange = range.cloneRange()
    startRange.selectNodeContents(root)
    startRange.setEnd(range.startContainer, range.startOffset)
    const startText = serializeChildren(startRange.cloneContents())

    const endRange = range.cloneRange()
    endRange.selectNodeContents(root)
    endRange.setEnd(range.endContainer, range.endOffset)
    const endText = serializeChildren(endRange.cloneContents())

    return {
      start: startText.length,
      end: endText.length
    }
  }

  function getSanitizedLength(text: string): number {
    return text.replace(/\u200B/g, '').length
  }

  function mapSanitizedOffsetToDomOffset(text: string, sanitizedOffset: number): number {
    if (sanitizedOffset <= 0) return 0
    let count = 0
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i]
      if (char === '\u200B') continue
      count += 1
      if (count === sanitizedOffset) {
        return i + 1
      }
    }
    return text.length
  }

  type Parent = Node & ParentNode

  type ResolvedPosition =
    | { kind: 'text'; node: Text; offset: number }
    | { kind: 'after'; node: ChildNode }
    | { kind: 'before'; parent: Parent; index: number }
    | { kind: 'root-end' }

  function resolveOffset(root: HTMLElement, targetOffset: number): ResolvedPosition {
    let remaining = Math.max(0, targetOffset)

    function visit(node: Node): ResolvedPosition | null {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? ''
        const length = getSanitizedLength(text)
        if (remaining <= length) {
          const domOffset = mapSanitizedOffsetToDomOffset(text, remaining)
          return { kind: 'text', node: node as Text, offset: domOffset }
        }
        remaining -= length
        return null
      }

      if (!(node instanceof HTMLElement)) {
        return null
      }

      if (node.dataset.anchor === 'true') {
        return null
      }

      const placeholderName = node.dataset.placeholderName
      if (placeholderName) {
        if (remaining === 0) {
          const parent = (node.parentNode as Parent | null) ?? root
          const siblings = Array.from(parent.childNodes) as ChildNode[]
          const index = Math.max(0, siblings.indexOf(node as ChildNode))
          return { kind: 'before', parent, index }
        }
        const length = placeholderName.length + 4
        if (remaining <= length) {
          return { kind: 'after', node }
        }
        remaining -= length
        return null
      }

      if (node.tagName === 'BR') {
        if (remaining === 0) {
          const parent = (node.parentNode as Parent | null) ?? root
          const siblings = Array.from(parent.childNodes) as ChildNode[]
          const index = Math.max(0, siblings.indexOf(node as ChildNode))
          return { kind: 'before', parent, index }
        }
        if (remaining <= 1) {
          return { kind: 'after', node }
        }
        remaining -= 1
        return null
      }

      const children = Array.from(node.childNodes)
      for (const child of children) {
        const result = visit(child)
        if (result) return result
      }

      if (node.tagName === 'DIV') {
        if (remaining <= 1) {
          if (remaining === 0) {
            const parent = (node.parentNode as Parent | null) ?? root
            const siblings = Array.from(parent.childNodes) as ChildNode[]
            const index = Math.max(0, siblings.indexOf(node as ChildNode))
            return { kind: 'before', parent, index }
          }
          return { kind: 'after', node }
        }
        remaining -= 1
      }

      return null
    }

    const children = Array.from(root.childNodes)
    for (const child of children) {
      const result = visit(child)
      if (result) return result
    }

    return { kind: 'root-end' }
  }

  function restoreSelectionFromOffsets(root: HTMLElement, offsets: { start: number; end: number }) {
    if (!hasDocument) return
    const selection = document.getSelection()
    if (!selection) return

    const startPos = resolveOffset(root, offsets.start)
    const endPos = resolveOffset(root, offsets.end)

    const range = document.createRange()

    function applyPosition(position: ResolvedPosition, which: 'start' | 'end') {
      if (position.kind === 'text') {
        if (which === 'start') {
          range.setStart(position.node, position.offset)
        } else {
          range.setEnd(position.node, position.offset)
        }
        return
      }

      if (position.kind === 'before') {
        const parent = position.parent
        const index = Math.max(0, Math.min(parent.childNodes.length, position.index))
        if (which === 'start') {
          range.setStart(parent, index)
        } else {
          range.setEnd(parent, index)
        }
        return
      }

      if (position.kind === 'root-end') {
        const parent = root as Parent
        const index = parent.childNodes.length
        if (which === 'start') {
          range.setStart(parent, index)
        } else {
          range.setEnd(parent, index)
        }
        return
      }

      const targetNode = position.node
      const parent = (targetNode.parentNode as Parent | null) ?? root
      const siblings = Array.from(parent.childNodes) as ChildNode[]
      let index = siblings.indexOf(targetNode)
      if (index < 0) {
        index = siblings.length - 1
      }
      const offsetIndex = Math.max(0, index) + 1

      if (which === 'start') {
        range.setStart(parent, offsetIndex)
      } else {
        range.setEnd(parent, offsetIndex)
      }
    }

    applyPosition(startPos, 'start')
    applyPosition(endPos, 'end')

    selection.removeAllRanges()
    selection.addRange(range)
  }

  let renderedSegments: Seg[] = $state([])
  let renderVersion = $state(0)
  let isEmpty = $state(true)
  let lastSyncedValueSignature: string | null = null
  let lastSyncedRefreshToken: number | null = null
  let lastSyncedRandomTagSignature: string | null = null
  let lastSyncedModelSignature: string | null = null

  function getValueText(v: unknown): string {
    if (typeof v === 'string') return v
    if (v == null) return ''
    return String(v)
  }

  function getModelSignature(m: TreeModel | null): string {
    if (!m) return ''
    const nodeIds = Object.keys(m.nodes).sort()
    return `${m.rootId}:${nodeIds.length}:${nodeIds.join(',')}`
  }

  function syncDomFromValue() {
    if (!editableEl) return
    if (skipDomSync) return

    const textValue = getValueText(value)
    const hasValue = textValue.length > 0
    isEmpty = !hasValue

    if (!hasValue) {
      renderedSegments = []
      renderVersion += 1
      lastSyncedValueSignature = textValue
      lastSyncedRefreshToken = refreshToken ?? null
      lastSyncedRandomTagSignature = getResolutionSignature(currentRandomTagResolutions)
      lastSyncedModelSignature = getModelSignature(model)
      return
    }

    renderedSegments = getSegments(textValue, currentRandomTagResolutions)
    renderVersion += 1
    lastSyncedValueSignature = textValue
    lastSyncedRefreshToken = refreshToken ?? null
    lastSyncedRandomTagSignature = getResolutionSignature(currentRandomTagResolutions)
    lastSyncedModelSignature = getModelSignature(model)
  }

  function handleBeforeInput(event: InputEvent) {
    if (!editableEl || disabled) return
  }

  function handleInput() {
    if (!editableEl) return

    skipDomSync = true
    const selectionOffsets = getSelectionOffsets(editableEl)
    const newValue = extractValueFromDom(editableEl)
    if (newValue !== value) {
      value = newValue
      onValueChange(newValue)
    }

    scheduleFrame(() => {
      skipDomSync = false
      if (!editableEl) return
      if (!hasDocument) {
        syncDomFromValue()
        return
      }

      syncDomFromValue()
      if (selectionOffsets && document.activeElement === editableEl) {
        const offsetsCopy = { start: selectionOffsets.start, end: selectionOffsets.end }
        scheduleFrame(() => {
          if (!editableEl) return
          restoreSelectionFromOffsets(editableEl, offsetsCopy)
        })
      }
    })
  }

  function handleBlur() {
    skipDomSync = false
    syncDomFromValue()
  }

  function handleChipDoubleClick(event: MouseEvent, name: string) {
    event.preventDefault()
    event.stopPropagation()
    onChipDoubleClick(name)
  }

  onMount(() => {
    syncDomFromValue()
    return () => {}
  })

  $effect(() => {
    if (!editableEl) return
    editableEl.dataset.placeholder = placeholder
  })

  $effect(() => {
    if (!editableEl) return
    if (skipDomSync) return

    const token = refreshToken ?? null
    const currentValueSignature = getValueText(value)
    const randomTagSignature = getResolutionSignature(currentRandomTagResolutions)
    const currentModelSignature = getModelSignature(model)

    if (
      currentValueSignature === lastSyncedValueSignature &&
      token === lastSyncedRefreshToken &&
      randomTagSignature === lastSyncedRandomTagSignature &&
      currentModelSignature === lastSyncedModelSignature
    ) {
      return
    }
    syncDomFromValue()
  })
</script>

<div
  {id}
  class={`chip-editor ${disabled ? 'is-disabled' : ''} ${isEmpty ? 'is-empty' : ''}`}
  contenteditable={!disabled}
  bind:this={editableEl}
  onbeforeinput={handleBeforeInput}
  oninput={handleInput}
  onblur={handleBlur}
  data-placeholder={placeholder}
  spellcheck="false"
>
  {#key renderVersion}
    {#each renderedSegments as segment, segIndex (segIndex)}
      {#if segment.kind === 'text'}
        <span class="text-segment">{segment.text}</span>
      {:else if segment.kind === 'choice'}
        <span class="chip choice" data-choice="true">
          {#each segment.options as option, index}
            {#if index > 0}<span class="choice-separator" aria-hidden="true"></span>{/if}
            <span class="choice-option">{option === '' ? '\u00A0' : option}</span>
          {/each}
        </span>
      {:else if segment.kind === 'chip'}
        <span
          class={`chip placeholder-chip ${segment.type === 'random' ? 'random' : segment.type === 'consistent-random' ? 'consistent' : 'unknown'}`}
          data-placeholder-name={segment.name}
          contenteditable="false"
          role="button"
          tabindex="0"
          ondblclick={(event) => handleChipDoubleClick(event, segment.name)}
        >
          <span class="chip-label chip-label-visible">{segment.name}</span>
          <span class="chip-body">
            <span class="chip-label chip-label-placeholder" aria-hidden="true">{segment.name}</span>
            {#if segment.resolution !== null}
              <span class="chip-value">{segment.resolution}</span>
            {/if}
          </span>
        </span>
      {/if}
    {/each}
  {/key}
  <span data-anchor="true">&#8203;</span>
</div>

<style>
  .chip-editor {
    min-height: 3rem;
    padding: 0.5rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    background-color: #f9fafb;
    cursor: text;
    text-align: left;
    font-size: 0.875rem;
    white-space: pre-wrap;
    word-break: break-word;
    outline: none;
  }

  .chip-editor:focus {
    border-color: #38bdf8;
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.35);
    background-color: #ffffff;
  }

  .chip-editor.is-disabled {
    cursor: default;
    background-color: #f3f4f6;
  }

  .chip-editor.is-empty::before {
    content: attr(data-placeholder);
    color: #9ca3af;
  }

  :global(.text-segment) {
    display: inline;
    white-space: pre-wrap;
  }

  :global(.chip) {
    display: inline-block;
    align-items: center;
    gap: 0.25rem;
    padding: 0 0.35rem 0.0625rem 0.35rem;
    margin: 0 0.1rem 0.2rem;
    border-radius: 0.375rem;
    border: 1px dashed #d1d5db;
    white-space: nowrap;
    user-select: none;
  }

  :global(.placeholder-chip) {
    position: relative;
    display: inline-block;
    padding: 0 0.35rem 0.075rem 0.25rem;
    white-space: normal;
  }

  :global(.chip-body) {
    display: inline-block;
    max-width: 100%;
    min-width: 0;
  }

  :global(.chip-label) {
    font-weight: 600;
    color: inherit;
  }

  :global(.chip-label-visible) {
    position: absolute;
    top: 0;
    left: 0;
    padding: 0 0.25rem 0.1rem 0.25rem;
    background-color: #e5e7eb;
    pointer-events: none;
    border-radius: 0.375rem 0 0 0.375rem;
  }

  :global(.chip.random .chip-label-visible) {
    background-color: #e9d5ff;
  }

  :global(.chip.consistent .chip-label-visible) {
    background-color: #fed7aa;
  }

  :global(.chip.unknown .chip-label-visible) {
    background-color: #bae6fd;
  }

  :global(.chip-label-placeholder) {
    visibility: hidden;
    display: inline-block;
    padding-right: 0.2rem;
  }

  :global(.chip-value) {
    display: inline;
    vertical-align: top;
    min-width: 0;
    color: inherit;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
    max-width: 100%;
  }

  :global(.chip.random) {
    background-color: #f3e8ff;
    color: #6b21a8;
    border-color: #c084fc;
  }

  :global(.chip.consistent) {
    background-color: #ffedd5;
    color: #9a3412;
    border-color: #fb923c;
  }

  :global(.chip.unknown) {
    background-color: #e5e7eb;
    color: #374151;
    border-color: #d1d5db;
  }

  :global(.chip.choice) {
    background-color: #ecfccb;
    color: #1f3c08;
    border-color: #166534;
    white-space: pre;
  }

  :global(.choice-separator) {
    display: inline-flex;
    align-self: stretch;
    width: 0;
    border-left: 1px dashed #166534;
    box-sizing: border-box;
    margin: 0 0.2rem;
  }

  :global(.choice-option) {
    display: inline-flex;
    align-items: center;
    white-space: pre;
  }
</style>

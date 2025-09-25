<script lang="ts">
  import { onMount } from 'svelte'
  import { createPlaceholderRegex } from '$lib/constants'
  import { findNodeByName, isConsistentRandomArray } from './TreeEdit/utils'
  import type { TreeModel } from './TreeEdit/model'

  interface Props {
    id: string
    value: string
    placeholder: string
    model: TreeModel | null
    disabled: boolean
    onValueChange: (value: string) => void
    onChipDoubleClick: (tagName: string) => void
  }

  let {
    id,
    value = $bindable(),
    placeholder,
    model = null,
    disabled = false,
    onValueChange = () => {},
    onChipDoubleClick = () => {}
  }: Props = $props()

  type Seg =
    | { kind: 'text'; text: string }
    | { kind: 'chip'; name: string; type: 'random' | 'consistent-random' | 'unknown' }

  type ChoiceSeg = { kind: 'text'; text: string } | { kind: 'choice'; options: string[] }

  const placeholderRe = createPlaceholderRegex()
  const hasDocument = typeof document !== 'undefined'
  function scheduleFrame(cb: FrameRequestCallback) {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(cb)
      return
    }
    setTimeout(() => cb(Date.now()), 0)
  }

  function createChipElement(name: string): HTMLSpanElement {
    const span = document.createElement('span')
    span.classList.add('chip')
    const tagType = getTagType(name)
    if (tagType === 'random') {
      span.classList.add('random')
    } else if (tagType === 'consistent-random') {
      span.classList.add('consistent')
    } else {
      span.classList.add('unknown')
    }
    span.dataset.placeholderName = name
    span.setAttribute('contenteditable', 'false')
    span.textContent = name
    return span
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

  function getSegments(text: string): Seg[] {
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
  }

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

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\n/g, '<br>')
  }

  function escapeAttr(text: string): string {
    return text.replace(/"/g, '&quot;')
  }

  function renderTextSegments(text: string): string {
    const parts = splitChoiceSegments(text)
    return parts
      .map((part) => {
        if (part.kind === 'text') {
          if (!part.text) return ''
          return `<span class="text-segment">${escapeHtml(part.text)}</span>`
        }
        const optionsHtml = part.options
          .map((option, index) => {
            const optionHtml = `<span class="choice-option">${
              option === '' ? '&nbsp;' : escapeHtml(option)
            }</span>`
            if (index === 0) return optionHtml
            return `<span class="choice-separator" aria-hidden="true"></span>${optionHtml}`
          })
          .join('')
        return `<span class="chip choice" data-choice="true">${optionsHtml}</span>`
      })
      .join('')
  }

  function renderSegmentsToHtml(segs: Seg[]): string {
    let html = ''
    for (const seg of segs) {
      if (seg.kind === 'text') {
        html += renderTextSegments(seg.text)
        continue
      }
      const cls =
        seg.type === 'random'
          ? 'random'
          : seg.type === 'consistent-random'
            ? 'consistent'
            : 'unknown'
      html += `<span class="chip ${cls}" data-placeholder-name="${escapeAttr(seg.name)}" contenteditable="false">${escapeHtml(seg.name)}</span>`
    }
    return html
  }

  function extractValueFromDom(root: HTMLElement): string {
    const pieces: string[] = []

    root.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        pieces.push(node.textContent ?? '')
        return
      }

      if (!(node instanceof HTMLElement)) {
        return
      }

      if (node.dataset.anchor === 'true') {
        return
      }

      const placeholderName = node.dataset.placeholderName
      if (placeholderName) {
        pieces.push(`__${placeholderName}__`)
        return
      }

      if (node.tagName === 'BR') {
        pieces.push('\n')
        return
      }

      if (node.tagName === 'DIV') {
        pieces.push(extractValueFromDom(node))
        pieces.push('\n')
        return
      }

      pieces.push(extractValueFromDom(node))
    })

    return pieces.join('').replace(/\u200B/g, '')
  }

  function convertTypedPlaceholders(root: HTMLElement) {
    if (!hasDocument) return
    const selection = document.getSelection()
    const anchorNode = selection?.anchorNode ?? null
    const anchorOffset = selection?.anchorOffset ?? 0

    const nodeFilter: NodeFilter = {
      acceptNode(node) {
        if (!(node instanceof Text)) return NodeFilter.FILTER_REJECT
        const parent = node.parentElement
        if (!parent) return NodeFilter.FILTER_REJECT
        if (parent.dataset.placeholderName) return NodeFilter.FILTER_REJECT
        if (parent.dataset.choice === 'true') return NodeFilter.FILTER_REJECT
        if (parent.dataset.anchor === 'true') return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      }
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, nodeFilter)
    const textNodes: Text[] = []
    while (walker.nextNode()) {
      const current = walker.currentNode
      if (current instanceof Text) textNodes.push(current)
    }

    let caretHost: HTMLElement | null = null

    for (const textNode of textNodes) {
      const text = textNode.nodeValue ?? ''
      if (!text.includes('__')) continue
      const localRe = createPlaceholderRegex()
      const matches = [...text.matchAll(localRe)]
      if (matches.length === 0) continue

      const fragment = document.createDocumentFragment()
      let lastIndex = 0

      for (const match of matches) {
        const matchIndex = match.index ?? 0
        if (matchIndex > lastIndex) {
          fragment.append(text.slice(lastIndex, matchIndex))
        }
        const name = match[1]
        const chip = createChipElement(name)
        fragment.append(chip)
        const endIndex = matchIndex + match[0].length
        if (!caretHost && anchorNode === textNode && anchorOffset >= matchIndex && anchorOffset <= endIndex) {
          caretHost = chip
        }
        lastIndex = endIndex
      }

      if (lastIndex < text.length) {
        fragment.append(text.slice(lastIndex))
      }

      const parent = textNode.parentNode
      if (parent) {
        parent.replaceChild(fragment, textNode)
      }
    }

    if (caretHost && selection) {
      const range = document.createRange()
      range.setStartAfter(caretHost)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    }
  }

  function syncDomFromValue() {
    if (!editableEl) return
    if (skipDomSync) return

    const hasValue = value && value.length > 0
    if (!hasValue) {
      editableEl.innerHTML = ''
      editableEl.classList.add('is-empty')
      return
    }

    editableEl.classList.remove('is-empty')
    const segs = getSegments(value)
    const html = renderSegmentsToHtml(segs)
    const anchor = '<span data-anchor="true">\u200B</span>'
    const nextHtml = `${html}${anchor}`

    if (editableEl.innerHTML !== nextHtml) {
      editableEl.innerHTML = nextHtml
    }
  }

  function handleInput() {
    if (!editableEl) return
    skipDomSync = true
    const newValue = extractValueFromDom(editableEl)
    if (newValue !== value) {
      value = newValue
      onValueChange(newValue)
    }
    if (!disabled) {
      convertTypedPlaceholders(editableEl)
    }

    scheduleFrame(() => {
      skipDomSync = false
      if (!editableEl) return
      if (!hasDocument || document.activeElement !== editableEl) {
        syncDomFromValue()
      }
    })
  }

  function handleBlur() {
    skipDomSync = false
    syncDomFromValue()
  }

  function handleDoubleClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null
    if (!target) return
    const name = target.dataset?.placeholderName
    if (!name) return
    event.stopPropagation()
    onChipDoubleClick(name)
  }

  onMount(() => {
    syncDomFromValue()
    if (editableEl) {
      editableEl.addEventListener('dblclick', handleDoubleClick)
    }
    return () => {
      editableEl?.removeEventListener('dblclick', handleDoubleClick)
    }
  })

  $effect(() => {
    if (!editableEl) return
    editableEl.dataset.placeholder = placeholder
  })

  $effect(() => {
    syncDomFromValue()
  })
</script>

<div
  id={id}
  class={`chip-editor ${disabled ? 'is-disabled' : ''}`}
  contenteditable={!disabled}
  bind:this={editableEl}
  oninput={handleInput}
  onblur={handleBlur}
  data-placeholder={placeholder}
  spellcheck="false"
></div>

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
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0 0.35rem 0.0625rem 0.35rem;
    margin: 0 0.1rem 0.2rem;
    border-radius: 0.375rem;
    border: 1px dashed #d1d5db;
    white-space: nowrap;
    user-select: none;
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

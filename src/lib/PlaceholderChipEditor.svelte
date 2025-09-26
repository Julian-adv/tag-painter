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
  let saveCursorForDeletion: {
    startContainer: Node
    startOffset: number
    endContainer: Node
    endOffset: number
    isCollapsed: boolean
  } | null = null

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
        const textSegment = text.slice(last, idx)
        // Split text segments by choice patterns and add them
        const choiceParts = splitChoiceSegments(textSegment)
        segs.push(...choiceParts)
      }
      const name = match[1]
      const t = getTagType(name)
      segs.push({ kind: 'chip', name, type: t })
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

  function convertSinglePlaceholder(
    root: HTMLElement,
    textNode: Text,
    match: RegExpMatchArray,
    cursorOffset: number
  ) {
    if (!hasDocument) return

    const text = textNode.textContent || ''
    const name = match[1]
    const matchStart = cursorOffset - match[0].length
    const matchEnd = cursorOffset

    // Create fragments for before, chip, and after
    const fragment = document.createDocumentFragment()

    // Add text before the placeholder
    if (matchStart > 0) {
      fragment.appendChild(document.createTextNode(text.substring(0, matchStart)))
    }

    // Create and add the chip
    const chip = createChipElement(name)
    fragment.appendChild(chip)

    // Add text after the placeholder
    if (matchEnd < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(matchEnd)))
    }

    // Replace the text node with the fragment
    const parent = textNode.parentNode
    if (parent) {
      parent.replaceChild(fragment, textNode)

      // Position cursor right after the chip BEFORE updating the value
      const selection = document.getSelection()
      if (selection) {
        const range = document.createRange()
        range.setStartAfter(chip)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
      }

      // Set skipDomSync to prevent syncDomFromValue from overwriting our DOM changes
      skipDomSync = true

      // Update the value to reflect the change
      const newValue = extractValueFromDom(root)
      if (newValue !== value) {
        value = newValue
        onValueChange(newValue)
      }

      // Reset skipDomSync after a timeout to allow future sync operations
      setTimeout(() => {
        skipDomSync = false
      }, 10)
    }
  }

  function convertTypedPlaceholdersWithSavedCursor(root: HTMLElement) {
    if (!hasDocument || !saveCursorForDeletion) return

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

    let hasConversions = false
    let cursorTarget: Node | null = null

    for (const textNode of textNodes) {
      const text = textNode.nodeValue ?? ''
      if (!text.includes('__')) continue
      const localRe = createPlaceholderRegex()
      const matches = [...text.matchAll(localRe)]
      if (matches.length === 0) continue

      hasConversions = true
      const fragment = document.createDocumentFragment()
      let lastIndex = 0

      for (const match of matches) {
        const matchIndex = match.index ?? 0
        if (matchIndex > lastIndex) {
          const beforeText = document.createTextNode(text.slice(lastIndex, matchIndex))
          fragment.append(beforeText)
        }
        const name = match[1]
        const chip = createChipElement(name)
        fragment.append(chip)

        // If this was near where the cursor was, target this chip
        if (!cursorTarget && saveCursorForDeletion?.startContainer === textNode) {
          const matchEnd = matchIndex + match[0].length
          if (
            saveCursorForDeletion.startOffset >= matchIndex &&
            saveCursorForDeletion.startOffset <= matchEnd
          ) {
            cursorTarget = chip
          }
        }

        lastIndex = matchIndex + match[0].length
      }

      if (lastIndex < text.length) {
        const remainingText = document.createTextNode(text.slice(lastIndex))
        fragment.append(remainingText)
        if (
          !cursorTarget &&
          saveCursorForDeletion?.startContainer === textNode &&
          saveCursorForDeletion.startOffset > lastIndex
        ) {
          cursorTarget = remainingText
        }
      }

      const parent = textNode.parentNode
      if (parent) {
        parent.replaceChild(fragment, textNode)
      }
    }

    // Restore cursor position if we made conversions
    if (hasConversions) {
      const selection = document.getSelection()
      if (selection && cursorTarget) {
        const range = document.createRange()
        if (cursorTarget instanceof Text) {
          // Position within text node
          range.setStart(
            cursorTarget,
            Math.min(saveCursorForDeletion?.startOffset || 0, cursorTarget.textContent?.length || 0)
          )
        } else {
          // Position after chip
          range.setStartAfter(cursorTarget)
        }
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
      }
    }
  }

  let renderedSegments: Seg[] = $state([])
  let isEmpty = $state(true)

  function syncDomFromValue() {
    if (!editableEl) return
    if (skipDomSync) return

    const hasValue = value && value.length > 0
    isEmpty = !hasValue

    if (!hasValue) {
      renderedSegments = []
      return
    }

    renderedSegments = getSegments(value)
  }

  function handleBeforeInput(event: InputEvent) {
    if (!editableEl || disabled) return

    // Handle deletion operations (deleteContentBackward, deleteContentForward, etc.)
    if (event.inputType.startsWith('delete')) {
      const selection = document.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)

        // Save cursor position for restoration after potential chip conversion
        saveCursorForDeletion = {
          startContainer: range.startContainer,
          startOffset: range.startOffset,
          endContainer: range.endContainer,
          endOffset: range.endOffset,
          isCollapsed: range.collapsed
        }
      }
      return // Let deletion proceed normally, we'll handle conversion in handleInput
    }

    // Check if this input would complete a placeholder pattern
    if (event.data === '_') {
      const selection = document.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        const anchorNode = range.startContainer

        if (anchorNode instanceof Text) {
          const text = anchorNode.textContent || ''
          const offset = range.startOffset
          const beforeCursor = text.substring(0, offset)

          // Check if adding this '_' would complete a placeholder pattern
          const willComplete = (beforeCursor + '_').match(/__([^_]+)__$/)

          if (willComplete) {
            // Prevent the default input
            event.preventDefault()

            // Add the underscore manually and then convert
            const newText = text.substring(0, offset) + '_' + text.substring(offset)
            anchorNode.textContent = newText

            // Create a match object for the completed pattern
            const match = willComplete
            convertSinglePlaceholder(editableEl, anchorNode, match, offset + 1)
            return
          }
        }
      }
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

    // Check if we need to convert any placeholder patterns (e.g., after deletion)
    if (!disabled && saveCursorForDeletion) {
      convertTypedPlaceholdersWithSavedCursor(editableEl)
      saveCursorForDeletion = null
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
    // Reference value/model so Svelte reruns when either changes and chip styles stay in sync
    void value
    void model
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
  {#each renderedSegments as segment}
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
        class={`chip ${segment.type === 'random' ? 'random' : segment.type === 'consistent-random' ? 'consistent' : 'unknown'}`}
        data-placeholder-name={segment.name}
        contenteditable="false"
      >
        {segment.name}
      </span>
    {/if}
  {/each}
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

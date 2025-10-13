<script lang="ts">
  // Using standard Svelte syntax compatible with Svelte 5
  import { onMount } from 'svelte'
  import { getWildcardModel } from '../stores/tagsStore'
  import { findNodeByName, isConsistentRandomArray } from '../TreeEdit/utils'
  import ChipEditorAutocomplete from '../ChipEditorAutocomplete.svelte'
  import { createPlaceholderRegex } from '$lib/constants'

  interface Props {
    id?: string
    label: string
    value: string
    disabled?: boolean
    currentRandomTagResolutions?: Record<string, string>
    onTagDoubleClick?: (tagName: string) => void
    specialSuggestions?: string[]
    specialTrigger?: string
    showLabel?: boolean
    autocompleteActive?: boolean
  }

  let {
    id = '',
    label = '',
    value = '',
    disabled = false,
    currentRandomTagResolutions,
    onTagDoubleClick,
    specialSuggestions = [],
    specialTrigger = '__',
    showLabel = true,
    autocompleteActive = true
  }: Props = $props()

  let editor = $state<HTMLDivElement | null>(null)
  let autocompleteController: {
    handleKeydown: (event: KeyboardEvent) => boolean
    close: () => void
  } | null = null

  // === Pattern Regular Expressions ===
  const placeholderRe = createPlaceholderRegex()
  // {aaa|bbb|ccc} → Green choice tag
  const choiceRe = /\{([^{}]+)\}/g

  // === API: Serialize internal text ===
  // Example: "abc __def__ {x|y}"
  export function getText(): string {
    return serializeEditor()
  }

  // === API: Load external text ===
  // Example: readText("xxx, yyy, __aaa__, {b|c|d}")
  export function readText(input: string) {
    clearEditor()
    parseAndInsert(input)
    placeCaretAtEnd()
  }

  onMount(() => {
    // Ensure at least one empty text node if initial content is empty (facilitates boundary handling)
    if (editor && !editorHasContent()) {
      editor.appendChild(document.createTextNode(''))
    }
  })

  // Update editor content when value prop or currentRandomTagResolutions changes
  $effect(() => {
    if (editor && value !== undefined) {
      const currentText = serializeEditor()
      // Update if value changed or only resolutions changed
      if (currentText !== value || currentRandomTagResolutions) {
        readText(value)
      }
    }
  })

  // === Util: Clear editor ===
  function clearEditor() {
    if (!editor) return
    editor.innerHTML = ''
  }

  function editorHasContent() {
    return !!editor && editor.childNodes.length > 0
  }

  // === Util: HTML escaping unnecessary (inserted as text nodes only) ===

  // === Tag type detection ===
  function getTagType(tagName: string): 'random' | 'consistent-random' | 'unknown' {
    const model = getWildcardModel()
    if (!model) return 'unknown'
    const node = findNodeByName(model, tagName)
    if (!node) return 'unknown'
    if (node.kind === 'array') {
      return isConsistentRandomArray(model, node.id) ? 'consistent-random' : 'random'
    }
    if (node.kind === 'object') {
      return 'random'
    }
    return 'unknown'
  }

  // === Tag DOM creation ===
  function createEntityTag(name: string): HTMLSpanElement {
    const tagType = getTagType(name)
    const span = document.createElement('span')
    span.className = `tag ${tagType}`
    span.contentEditable = 'false'
    span.dataset.type = 'entity'
    span.dataset.value = name

    // Create chip-name (editable display name)
    const chipName = document.createElement('span')
    chipName.className = 'chip-name'
    chipName.contentEditable = 'true'
    chipName.textContent = name
    chipName.dataset.originalName = name

    // Create chip-body (contains hidden name + resolution)
    const chipBody = document.createElement('span')
    chipBody.className = 'chip-body'

    // Hidden name for layout
    const chipNameHidden = document.createElement('span')
    chipNameHidden.className = 'chip-name-hidden'
    chipNameHidden.setAttribute('aria-hidden', 'true')
    chipNameHidden.textContent = name
    chipBody.appendChild(chipNameHidden)

    // Resolution text (if available)
    const resolution = currentRandomTagResolutions?.[name]
    if (resolution) {
      const chipResolution = document.createElement('span')
      chipResolution.className = 'chip-resolution'
      chipResolution.textContent = resolution
      chipBody.appendChild(chipResolution)
    }

    chipName.addEventListener('input', (event) => {
      event.stopPropagation()
      const raw = chipName.textContent ?? ''
      const trimmed = raw.trim()
      span.dataset.value = trimmed
      chipNameHidden.textContent = trimmed || '\u00a0'
    })

    span.appendChild(chipName)
    span.appendChild(chipBody)

    return span
  }

  function createChoiceTag(raw: string): HTMLSpanElement {
    const parts = raw.split('|')
    const normalizedParts = parts.map((s) => s.trim())
    const outer = document.createElement('span')
    outer.className = 'tag tag-green'
    outer.contentEditable = 'false'
    outer.dataset.type = 'choice'
    outer.dataset.values = normalizedParts.join('|')

    // Render choice cells directly in outer
    for (let i = 0; i < normalizedParts.length; i++) {
      const cell = document.createElement('span')
      cell.className = 'choice-cell'
      cell.contentEditable = 'true'
      cell.spellcheck = false
      cell.textContent = normalizedParts[i]
      cell.addEventListener('input', (event) => {
        event.stopPropagation()
        normalizedParts[i] = cell.textContent ? cell.textContent.trim() : ''
        outer.dataset.values = normalizedParts.join('|')
      })
      outer.appendChild(cell)
    }
    return outer
  }

  // === Parsing & Insertion: Plain text → Mixed (text/tag) nodes ===
  function parseAndInsert(text: string, range?: Range) {
    const host = editor
    if (!host) return
    const frag = document.createDocumentFragment()
    let cursor = 0
    placeholderRe.lastIndex = 0
    choiceRe.lastIndex = 0

    while (cursor < text.length) {
      placeholderRe.lastIndex = cursor
      choiceRe.lastIndex = cursor

      const placeholderMatch = placeholderRe.exec(text)
      const choiceMatch = choiceRe.exec(text)

      let nextMatch: RegExpExecArray | null = null
      let matchType: 'placeholder' | 'choice' | null = null
      let nextIndex = text.length

      if (placeholderMatch && placeholderMatch.index !== undefined && placeholderMatch.index >= 0) {
        nextMatch = placeholderMatch
        matchType = 'placeholder'
        nextIndex = placeholderMatch.index
      }

      if (choiceMatch && choiceMatch.index !== undefined && choiceMatch.index >= 0) {
        if (!nextMatch || choiceMatch.index < nextIndex) {
          nextMatch = choiceMatch
          matchType = 'choice'
          nextIndex = choiceMatch.index
        }
      }

      if (!nextMatch || matchType === null) {
        if (cursor < text.length) {
          frag.appendChild(document.createTextNode(text.slice(cursor)))
        }
        break
      }

      if (nextIndex > cursor) {
        frag.appendChild(document.createTextNode(text.slice(cursor, nextIndex)))
      }

      if (matchType === 'placeholder') {
        const value = (nextMatch[1] ?? '').trim()
        if (value.length > 0) {
          frag.appendChild(createEntityTag(value))
        } else {
          frag.appendChild(document.createTextNode(nextMatch[0]))
        }
      } else {
        const raw = nextMatch[1] ?? ''
        frag.appendChild(createChoiceTag(raw))
      }

      cursor = nextMatch.index + nextMatch[0].length
    }

    if (range) {
      range.deleteContents()
      range.insertNode(frag)
    } else {
      host.appendChild(frag)
    }

    // Ensure trailing text node for boundary deletion/input convenience between tags
    ensureTrailingTextNode()
  }

  function ensureTrailingTextNode() {
    const host = editor
    if (!host) return
    const last = host.lastChild
    if (!(last && last.nodeType === Node.TEXT_NODE)) {
      host.appendChild(document.createTextNode(''))
    }
  }

  // === Serialization: DOM → Original string with patterns ===
  function serializeEditor(): string {
    const host = editor
    if (!host) return ''
    let out = ''
    host.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += (node as Text).data
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement
        if (el.matches('.tag')) {
          const type = el.dataset.type
          if (type === 'entity') {
            const val = el.dataset.value ?? ''
            out += `__${val}__`
          } else if (type === 'choice') {
            const vals = el.dataset.values ?? ''
            out += `{${vals}}`
          }
        }
      }
    })
    return out
  }

  // === Cursor/Selection ===
  function getCurrentRange(): Range | null {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    return sel.getRangeAt(0)
  }

  function placeCaretAtEnd() {
    const sel = window.getSelection()
    if (!sel) return
    const range = document.createRange()
    const host = editor
    if (!host) return
    const last = host.lastChild
    if (!last) return
    if (last.nodeType === Node.TEXT_NODE) {
      range.setStart(last, (last as Text).data.length)
    } else {
      const txt = document.createTextNode('')
      host.appendChild(txt)
      range.setStart(txt, 0)
    }
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  // Text index ↔ node position mapping (simple version)
  function getCaretPrefix(): string {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return ''
    const host = editor
    if (!host) return ''
    const r = sel.getRangeAt(0).cloneRange()
    r.selectNodeContents(host)
    r.setEnd(sel.anchorNode!, sel.anchorOffset)
    // Tags are represented as pattern strings in the text
    return serializeSlice(r)
  }

  function serializeSlice(range: Range): string {
    // Serialize content within range (tag → pattern)
    const div = document.createElement('div')
    div.appendChild(range.cloneContents())
    // Traverse div's childNodes and reuse serialization logic
    let out = ''
    div.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += (node as Text).data
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement
        if (el.matches('.tag')) {
          const type = el.dataset.type
          if (type === 'entity') {
            const val = el.dataset.value ?? ''
            out += `__${val}__`
          } else if (type === 'choice') {
            const vals = el.dataset.values ?? ''
            out += `{${vals}}`
          }
        } else {
          out += el.textContent ?? ''
        }
      }
    })
    return out
  }

  function restoreCaret(prefix: string) {
    const host = editor
    if (!host) return
    const target = prefix.length
    let acc = 0

    // Traverse only "direct" children of editor (text nodes, .tag elements)
    const children = Array.from(host.childNodes)

    for (const node of children) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node as Text).data
        if (acc + text.length >= target) {
          setCaret(node as Text, target - acc)
          host.focus() // Ensure focus
          return
        }
        acc += text.length
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement
        if (el.classList.contains('tag')) {
          // Calculate tag length based on serialized string
          let rep = ''
          if (el.dataset.type === 'entity') rep = `__${el.dataset.value ?? ''}__`
          else if (el.dataset.type === 'choice') rep = `{${el.dataset.values ?? ''}}`

          if (acc + rep.length >= target) {
            // Don't place cursor inside tag, place it in text node "after" tag
            const next = el.nextSibling ?? insertEmptyTextAfter(el)
            // Adjust in case next is not a text node
            let anchor = next
            if (!anchor || anchor.nodeType !== Node.TEXT_NODE) {
              anchor = document.createTextNode('')
              if (el.nextSibling) host.insertBefore(anchor, el.nextSibling)
              else host.appendChild(anchor)
            }
            setCaret(anchor as Text, 0)
            host.focus()
            return
          }
          acc += rep.length
        }
      }
    }

    // If not found, place at the end
    placeCaretAtEnd()
    host.focus()
  }

  function insertEmptyTextAfter(el: Node) {
    const txt = document.createTextNode('')
    if (el.nextSibling) el.parentNode!.insertBefore(txt, el.nextSibling)
    else el.parentNode!.appendChild(txt)
    return txt
  }

  function setCaret(textNode: Text, offset: number) {
    const sel = window.getSelection()
    if (!sel) return
    const range = document.createRange()
    range.setStart(textNode, Math.max(0, Math.min(offset, textNode.data.length)))
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  function reparseAllPreserveCaret() {
    const before = getCaretPrefix() // Serialized text before caret
    const all = serializeEditor()

    clearEditor()
    parseAndInsert(all)

    restoreCaret(before)
    editor?.focus() // ← Added
  }

  // === Boundary deletion handling ===
  function handleBoundaryDelete(ev: KeyboardEvent) {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const { anchorNode, anchorOffset } = sel

    // Handle only when caret is in a text node
    if (!anchorNode) return

    // Backspace: Remove tag if it's before the cursor
    if (ev.key === 'Backspace') {
      // At text node start (0), delete previous sibling if it's a tag
      const container = anchorNode.nodeType === Node.TEXT_NODE ? anchorNode : anchorNode.parentNode
      if (!container) return

      // Caret at text node start
      if (anchorNode.nodeType === Node.TEXT_NODE && anchorOffset === 0) {
        const prev = (container as Node).previousSibling
        if (prev && (prev as HTMLElement).classList?.contains('tag')) {
          ev.preventDefault()
          prev.remove()
          ensureTrailingTextNode()
          return
        }
      }
    }

    // Delete: Remove tag if it's after the cursor
    if (ev.key === 'Delete') {
      const container = anchorNode.nodeType === Node.TEXT_NODE ? anchorNode : anchorNode.parentNode
      if (!container) return

      if (anchorNode.nodeType === Node.TEXT_NODE) {
        const text = (anchorNode as Text).data
        if (anchorOffset === text.length) {
          const next = (container as Node).nextSibling
          if (next && (next as HTMLElement).classList?.contains('tag')) {
            ev.preventDefault()
            next.remove()
            ensureTrailingTextNode()
            return
          }
        }
      }
    }
  }

  function handleEditorKeydown(event: KeyboardEvent) {
    if (autocompleteController?.handleKeydown(event)) {
      return
    }

    handleBoundaryDelete(event)
  }

  // === Double-click tag callback ===
  function onDblClick(e: MouseEvent) {
    const target = e.target as HTMLElement
    const tag = target.closest('.tag') as HTMLElement | null
    if (!tag) return
    const type = tag.dataset.type
    if (type === 'entity') {
      onTagDoubleClick?.(tag.dataset.value ?? '')
    } else if (type === 'choice') {
      onTagDoubleClick?.(tag.dataset.values ?? '')
    }
  }

  // === Paste: Always plain text, parse immediately ===
  function onPaste(e: ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData?.getData('text/plain') ?? ''
    const range = getCurrentRange()
    if (!range) return
    parseAndInsert(text, range)
    // After paste, full reparse (safe) + restore caret
    reparseAllPreserveCaret()
  }

  // === Input event: Immediate reparse (simple/stable approach) ===
  function onInput() {
    // Don't touch during composition
    if (isComposing) return
    reparseAllPreserveCaret()
  }

  let isComposing = false
  function onCompStart() {
    isComposing = true
  }
  function onCompEnd() {
    isComposing = false
    reparseAllPreserveCaret()
  }

  export { getCaretPrefix }

  export { restoreCaret }

  export function focusEditor(mode: 'selectAll' | 'caretEnd' = 'selectAll') {
    if (!editor) return
    editor.focus()
    if (mode === 'selectAll') {
      const range = document.createRange()
      range.selectNodeContents(editor)
      const sel = window.getSelection()
      if (sel) {
        sel.removeAllRanges()
        sel.addRange(range)
      }
    } else {
      placeCaretAtEnd()
    }
  }
</script>

<div class={disabled ? 'pointer-events-none opacity-50' : ''}>
  {#if showLabel}
    <div class="mb-1 flex items-center justify-between">
      <label
        for={id}
        class="text-xs font-medium {disabled ? 'text-gray-400' : 'text-gray-700'} text-left"
        >{label}</label
      >
    </div>
  {/if}
  <div
    class="editor"
    bind:this={editor}
    contenteditable="true"
    spellcheck="false"
    role="textbox"
    tabindex="0"
    onpaste={onPaste}
    oninput={onInput}
    onkeydown={handleEditorKeydown}
    ondblclick={onDblClick}
    oncompositionstart={onCompStart}
    oncompositionend={onCompEnd}
    aria-label="Tag-enabled text editor"
  ></div>

  <ChipEditorAutocomplete
    bind:this={autocompleteController}
    {disabled}
    target={editor}
    active={!disabled && autocompleteActive}
    specialTriggerPrefix={specialTrigger}
    {specialSuggestions}
  />
</div>

<style>
  .editor {
    min-height: 1.25rem;
    padding: 0.125rem 0.25rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.25rem;
    background-color: #f9fafb;
    cursor: text;
    text-align: left;
    font-size: 0.875rem;
    white-space: pre-wrap;
    word-break: break-word;
    outline: none;
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    row-gap: 2px;
  }
  .editor:focus {
    background-color: #ffffff;
  }

  :global(.tag) {
    display: inline-flex;
    align-items: center;
    border-radius: 0.375rem;
    border: 1px dashed;
    padding: 0 0.35rem 0 0.35rem;
    margin: 1px 0.125rem;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    user-select: none;
    position: relative;
    max-width: calc(100% - 0.5rem);
  }

  :global(.tag.random) {
    background-color: #f3e8ff;
    color: #6b21a8;
    border-color: #c084fc;
    padding-bottom: 0.0625rem;
  }

  :global(.tag.random:hover) {
    background-color: #e9d5ff;
  }

  :global(.tag.random .chip-name) {
    background-color: #e9d5ff;
  }

  :global(.tag.consistent-random) {
    background-color: #ffedd5;
    color: #9a3412;
    border-color: #fb923c;
  }

  :global(.tag.consistent-random:hover) {
    background-color: #fed7aa;
  }

  :global(.tag.consistent-random .chip-name) {
    background-color: #fed7aa;
  }

  :global(.tag.unknown) {
    background-color: #e5e7eb;
    color: #374151;
    border-color: #d1d5db;
  }

  :global(.tag.unknown:hover) {
    background-color: #d1d5db;
  }

  :global(.tag.unknown .chip-name) {
    background-color: #d1d5db;
  }

  :global(.chip-name) {
    position: absolute;
    top: 0;
    left: 0;
    padding: 0 0.35rem 0.0625rem 0.35rem;
    font-size: 0.875rem;
    border-radius: 0.375rem 0 0 0.375rem;
    cursor: text;
    background-color: #e9d5ff;
    outline: none;
  }

  :global(.chip-name:focus) {
    outline: 2px solid rgba(56, 189, 248, 0.5);
    outline-offset: 1px;
  }

  :global(.chip-body) {
    display: inline;
    align-items: baseline;
    max-width: 100%;
    min-width: 0;
  }

  :global(.chip-name-hidden) {
    visibility: hidden;
    display: inline;
    font-size: 0.875rem;
  }

  :global(.chip-resolution) {
    display: inline;
    padding-left: 0.4rem;
    font-weight: 400;
    opacity: 0.8;
    font-style: italic;
    vertical-align: top;
    min-width: 0;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
    max-width: 100%;
  }

  :global(.tag-green) {
    font-size: 0.875rem;
    background-color: #ecfccb;
    color: #1f3c08;
    border-color: #166534;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding-left: 0.1rem;
    padding-bottom: 0.0625rem;
  }

  /* Choice cell division */
  :global(.choice-cell) {
    padding: 0 0 0 0.25rem;
    border-left: 1px dashed #166534;
    min-width: 0.5rem;
    outline: none;
    display: inline-flex;
    align-items: center;
    white-space: pre;
  }
  :global(.choice-cell:empty::after) {
    content: '\00a0';
  }
  :global(.choice-cell):first-child {
    border-left: none;
  }

  /* Prevent tags from being focusable */
  :global(.tag):focus {
    outline: none;
  }
</style>

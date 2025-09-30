<script lang="ts">
  import { tick } from 'svelte'
  import { createPlaceholderRegex } from '$lib/constants'
  import { findNodeByName, isConsistentRandomArray } from '../TreeEdit/utils'
  import type { TreeModel } from '../TreeEdit/model'
  import PlaceholderChipEditorAutocomplete from './PlaceholderChipEditorAutocomplete.svelte'

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

  type Segment =
    | { kind: 'text'; text: string }
    | {
        kind: 'placeholder'
        name: string
        type: 'random' | 'consistent-random' | 'unknown'
        resolution: string | null
        weight: number
        weightText: string | null
        start: number
        end: number
      }
    | { kind: 'choice'; options: string[] }

  const placeholderRe = createPlaceholderRegex()
  let editorElement: HTMLDivElement | null = $state(null)
  let autocompleteController: PlaceholderChipEditorAutocomplete | null = null
  let isEditing = $state(false)
  // no module-level caret state; pass caret info directly when needed

  type PlaceholderSegment = Extract<Segment, { kind: 'placeholder' }>

  const MIN_WEIGHT = 0.1
  const MAX_WEIGHT = 2.0
  const WEIGHT_STEP = 0.1

  function clampWeight(weight: number): number {
    return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, weight))
  }

  function roundToStep(weight: number): number {
    const steps = Math.round(weight / WEIGHT_STEP)
    return steps * WEIGHT_STEP
  }

  function formatWeightValue(weight: number): string {
    return weight.toFixed(1)
  }

  function getWeightDisplayText(weight: number, weightText: string | null): string {
    return weightText ?? formatWeightValue(weight)
  }

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

  const WEIGHT_SUFFIX_RE = /^:(\d+(?:\.\d+)?)\)/

  function isDefaultWeight(weight: number): boolean {
    return Math.abs(weight - 1) < 0.0001
  }

  function parseTextIntoSegments(text: string): Segment[] {
    const segments: Segment[] = []
    let lastIndex = 0

    // First pass: handle placeholders
    placeholderRe.lastIndex = 0
    const matches = Array.from(text.matchAll(placeholderRe))

    for (const match of matches) {
      const matchIndex = match.index ?? 0

      let textBefore = text.slice(lastIndex, matchIndex)
      let weight = 1
      let weightText: string | null = null
      let suffixLength = 0
      let extraPrefixLength = 0

      if (textBefore.endsWith('(')) {
        const remainingText = text.slice(matchIndex + match[0].length)
        const weightMatch = remainingText.match(WEIGHT_SUFFIX_RE)
        if (weightMatch) {
          textBefore = textBefore.slice(0, -1)
          weightText = weightMatch[1]
          weight = parseFloat(weightText)
          suffixLength = weightMatch[0].length
          extraPrefixLength = 1
        }
      }

      if (textBefore) {
        segments.push(...parseChoiceSegments(textBefore))
      }

      // Add placeholder segment
      const name = match[1]
      const type = getTagType(name)
      const resolution = currentRandomTagResolutions[name] || null
      const placeholderStart = matchIndex - extraPrefixLength
      const placeholderEnd = placeholderStart + match[0].length + suffixLength + extraPrefixLength
      segments.push({
        kind: 'placeholder',
        name,
        type,
        resolution,
        weight,
        weightText,
        start: placeholderStart,
        end: placeholderEnd
      })

      lastIndex = matchIndex + match[0].length + suffixLength
    }

    // Add remaining text
    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex)
      segments.push(...parseChoiceSegments(remainingText))
    }

    return segments
  }

  function parseChoiceSegments(text: string): Segment[] {
    const choiceRegex = /\{([^{}]*\|[^{}]*)\}/g
    const segments: Segment[] = []
    let lastIndex = 0

    let match: RegExpExecArray | null
    while ((match = choiceRegex.exec(text)) !== null) {
      const matchIndex = match.index ?? 0

      // Add text before choice
      if (matchIndex > lastIndex) {
        const textBefore = text.slice(lastIndex, matchIndex)
        if (textBefore) {
          segments.push({ kind: 'text', text: textBefore })
        }
      }

      // Add choice segment
      const optionsText = match[1] || ''
      const options = optionsText.split('|').map((opt) => opt.trim())
      segments.push({ kind: 'choice', options })

      lastIndex = choiceRegex.lastIndex
    }

    // Add remaining text
    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex)
      if (remainingText) {
        segments.push({ kind: 'text', text: remainingText })
      }
    }

    return segments
  }

  let segments = $derived(parseTextIntoSegments(value))

  function handleClick(event: MouseEvent) {
    if (disabled) return

    // If clicking on a chip-name, don't interfere
    const target = event.target as HTMLElement
    if (target.classList.contains('chip-name')) {
      return
    }

    // If already editing, don't interfere with natural cursor positioning
    if (isEditing) return

    startEditing()
  }

  function handlePlaceholderDoubleClick(event: MouseEvent, placeholderName: string) {
    event.preventDefault()
    event.stopPropagation()
    onChipDoubleClick(placeholderName)
  }

  async function startEditing() {
    if (disabled) return

    isEditing = true
    await tick()

    if (editorElement) {
      editorElement.contentEditable = 'true'
      editorElement.focus()
    }
  }

  function finishEditing() {
    if (!editorElement) return

    isEditing = false
    editorElement.contentEditable = 'false'
    autocompleteController?.close()

    // Extract and reconstruct text from the contenteditable div
    const newValue = extractTextFromEditor(editorElement)

    if (newValue !== value) {
      value = newValue
      onValueChange(newValue)
    }
  }

  function extractTextFromEditor(element: HTMLElement): string {
    let result = ''

    function processNode(node: Node): void {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent || ''
      } else if (node instanceof HTMLElement) {
        if (node.classList.contains('placeholder-chip')) {
          const chipName = node.dataset.placeholderName
          if (chipName) {
            const weightAttr = node.dataset.placeholderWeight
            const weightValue = weightAttr ? parseFloat(weightAttr) : 1
            const weightString = node.dataset.placeholderWeightText || weightAttr || ''

            if (weightAttr && !Number.isNaN(weightValue) && !isDefaultWeight(weightValue)) {
              const formattedWeight = weightString || formatWeightValue(weightValue)
              result += `(__${chipName}__:${formattedWeight})`
            } else {
              result += `__${chipName}__`
            }
          }
        } else if (node.classList.contains('choice-chip')) {
          const options: string[] = []
          const optionElements = node.querySelectorAll('.choice-option')
          optionElements.forEach((el) => {
            const text = el.textContent?.trim() || ''
            if (text !== '\u00A0') options.push(text)
          })
          if (options.length > 0) {
            result += `{${options.join('|')}}`
          }
        } else {
          node.childNodes.forEach(processNode)
        }
      }
    }

    element.childNodes.forEach(processNode)
    return result
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!isEditing) return

    // Deletion is handled in beforeinput for reliability (direction + prevention)

    if (autocompleteController?.handleKeydown(event)) {
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      finishEditing()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      // Restore original value
      if (editorElement) {
        editorElement.textContent = value
      }
      finishEditing()
    }
  }

  function previousSiblingDeep(node: Node, root: HTMLElement): Node | null {
    let n: Node | null = node
    while (n && n !== root) {
      if (n.previousSibling) return n.previousSibling
      n = n.parentNode
    }
    return null
  }

  function nextSiblingDeep(node: Node, root: HTMLElement): Node | null {
    let n: Node | null = node
    while (n && n !== root) {
      if (n.nextSibling) return n.nextSibling
      n = n.parentNode as Node | null
    }
    return null
  }

  function findLastTextInElement(el: HTMLElement): Text | null {
    for (let i = el.childNodes.length - 1; i >= 0; i--) {
      const c = el.childNodes[i]
      if (c.nodeType === Node.COMMENT_NODE) {
        continue
      }
      if (c.nodeType === Node.TEXT_NODE) {
        const t = c as Text
        if ((t.textContent || '').trim().length > 0) return t
        continue
      }
      if (c instanceof HTMLElement) {
        const t = findLastTextInElement(c)
        if (t) return t
      }
    }
    return null
  }

  function getPrecedingTextPositionForChip(
    chipEl: HTMLElement,
    root: HTMLElement
  ): { node: Text; offset: number } | null {
    let cur: Node | null = previousSiblingDeep(chipEl, root)
    while (cur) {
      if (cur.nodeType === Node.COMMENT_NODE) {
        cur = previousSiblingDeep(cur, root)
        continue
      }
      if (cur.nodeType === Node.TEXT_NODE) {
        const t = cur as Text
        const content = t.textContent || ''
        if (content.trim().length > 0) {
          return { node: t, offset: content.length }
        }
        cur = previousSiblingDeep(cur, root)
        continue
      }
      if (cur instanceof HTMLElement) {
        const t = findLastTextInElement(cur)
        if (t) return { node: t, offset: (t.textContent || '').length }
      }
      cur = previousSiblingDeep(cur, root)
    }
    return null
  }

  function isWhitespaceOnlyNode(node: Node): boolean {
    // Treat comment nodes as ignorable (Svelte inserts them around keyed blocks)
    if (node.nodeType === Node.COMMENT_NODE) return true
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent || '').trim().length === 0
    }
    if (node instanceof HTMLElement) {
      // Explicitly ignore empty text segment/placeholder text wrappers
      if (node.classList.contains('text-segment') || node.classList.contains('placeholder-text')) {
        return (node.textContent || '').trim().length === 0
      }
      // Generic empty element (not a chip) is also ignorable
      if (!node.classList.contains('placeholder-chip')) {
        return (node.textContent || '').trim().length === 0
      }
    }
    return false
  }

  function findAdjacentChipAtCaret(direction: 'before' | 'after'): HTMLElement | null {
    if (!editorElement) return null
    const root = editorElement as HTMLElement
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null

    const range = sel.getRangeAt(0)
    if (!range.collapsed) return null

    const container = range.startContainer
    const offset = range.startOffset

    function scanFrom(sibling: Node | null): HTMLElement | null {
      let cur: Node | null = sibling
      while (cur) {
        if (cur instanceof HTMLElement && cur.classList.contains('placeholder-chip')) {
          return cur
        }
        if (!isWhitespaceOnlyNode(cur)) {
          break
        }
        cur = direction === 'before' ? previousSiblingDeep(cur, root) : nextSiblingDeep(cur, root)
      }
      return null
    }

    if (container.nodeType === Node.TEXT_NODE) {
      const text = container.textContent || ''
      if (direction === 'before') {
        if (offset > 0) {
          const left = text.slice(0, offset)
          if (left.trim().length > 0) return null
        }
        const sibling = previousSiblingDeep(container, root)
        return scanFrom(sibling)
      } else {
        if (offset < text.length) {
          const right = text.slice(offset)
          if (right.trim().length > 0) return null
        }
        const sibling = nextSiblingDeep(container, root)
        return scanFrom(sibling)
      }
    }

    if (container.nodeType === Node.ELEMENT_NODE) {
      const el = container as HTMLElement
      let sibling: Node | null = null
      if (direction === 'before') {
        if (offset === 0) {
          sibling = previousSiblingDeep(el, root)
        } else {
          sibling = el.childNodes[offset - 1] || null
        }
        return scanFrom(sibling)
      } else {
        if (offset >= el.childNodes.length) {
          sibling = nextSiblingDeep(el, root)
        } else {
          sibling = el.childNodes[offset]
        }
        return scanFrom(sibling)
      }
    }

    return null
  }

  function deleteChipElement(
    chipEl: HTMLElement,
    _direction: 'before' | 'after',
    caretNode: Node,
    caretOffset: number
  ): void {
    if (!editorElement) return
    const root = editorElement

    chipEl.remove()

    // Sync value from DOM
    const newValue = extractTextFromEditor(root)
    if (newValue !== value) {
      value = newValue
      onValueChange(newValue)
    }

    // After Svelte rerender, restore caret to saved offset in the same container
    Promise.resolve().then(async () => {
      await tick()
      restoreCaret(caretNode, caretOffset)
    })
  }

  // caret restore handled by passing container/offset to deleteChipElement

  function handlePaste(_event: ClipboardEvent) {
    if (!isEditing) return

    // Store the original range before paste
    const selection = window.getSelection()
    let originalRange: Range | null = null
    if (selection && selection.rangeCount > 0) {
      originalRange = selection.getRangeAt(0).cloneRange()
    }

    // Let the default paste happen first
    setTimeout(() => {
      if (!editorElement) return

      // Remove formatting from pasted content
      const walker = document.createTreeWalker(editorElement, NodeFilter.SHOW_ELEMENT, null)

      const elementsToReplace: HTMLElement[] = []
      let element: HTMLElement | null

      while ((element = walker.nextNode() as HTMLElement)) {
        // Skip our own chip elements and their children
        if (
          element.classList.contains('chip') ||
          element.classList.contains('placeholder-chip') ||
          element.classList.contains('choice-chip') ||
          element.classList.contains('chip-name') ||
          element.classList.contains('chip-body') ||
          element.classList.contains('chip-name-hidden') ||
          element.classList.contains('chip-resolution') ||
          element.classList.contains('chip-weight') ||
          element.classList.contains('choice-separator') ||
          element.classList.contains('choice-option') ||
          element.classList.contains('text-segment') ||
          element.classList.contains('placeholder-text') ||
          element.closest('.chip')
        ) {
          continue
        }

        // Remove formatting attributes but keep content
        if (
          element.style.length > 0 ||
          element.hasAttribute('style') ||
          element.hasAttribute('color') ||
          element.hasAttribute('bgcolor') ||
          element.tagName === 'SPAN' ||
          element.tagName === 'FONT' ||
          element.tagName === 'B' ||
          element.tagName === 'I' ||
          element.tagName === 'STRONG' ||
          element.tagName === 'EM' ||
          element.tagName === 'BR'
        ) {
          elementsToReplace.push(element)
        }
      }

      // Replace formatted elements with text nodes and trim whitespace
      for (const el of elementsToReplace) {
        if (el.tagName === 'BR') {
          // Remove <br> tags completely
          el.parentNode?.removeChild(el)
        } else {
          const textContent = el.textContent || ''
          const textNode = document.createTextNode(textContent)
          el.parentNode?.replaceChild(textNode, el)
        }
      }

      // Restore cursor position and move to end of original range
      if (originalRange) {
        try {
          const newSelection = window.getSelection()
          if (newSelection) {
            // Move cursor to the end of the original range (after pasted text)
            originalRange.collapse(false)
            newSelection.removeAllRanges()
            newSelection.addRange(originalRange)
          }
        } catch (e) {}
      }
    }, 0)
  }

  function restoreCaret(node: Node, offset: number) {
    const sel = window.getSelection()
    if (!sel) return
    try {
      if (node.nodeType === Node.TEXT_NODE) {
        let finalOffset = offset
        const len = (node.textContent || '').length
        if (finalOffset > len) finalOffset = len
        const range = document.createRange()
        range.setStart(node, finalOffset)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
      }
    } catch {}
  }

  function handleBeforeInput(event: InputEvent) {
    // Intercept forward/backward deletes at the DOM level for reliability
    const type = (event as any).inputType as string
    if (type !== 'deleteContentForward' && type !== 'deleteContentBackward') return

    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return

    const backward = type === 'deleteContentBackward'
    const chip = findAdjacentChipAtCaret(backward ? 'before' : 'after')
    const hostNode = sel.getRangeAt(0).startContainer
    const hostEl =
      hostNode.nodeType === Node.ELEMENT_NODE
        ? (hostNode as HTMLElement)
        : (hostNode.parentElement as HTMLElement | null)
    const insideChip = hostEl ? (hostEl.closest('.placeholder-chip') as HTMLElement | null) : null

    //

    // If caret is inside a chip (e.g., editing chip-name), allow native editing
    if (insideChip) return
    if (chip) {
      event.preventDefault()
      const r = sel.getRangeAt(0)
      let node = r.startContainer
      let offset = r.startOffset
      if (backward && editorElement) {
        const pos = getPrecedingTextPositionForChip(chip, editorElement)
        if (pos) {
          node = pos.node
          offset = pos.offset
        }
      }
      deleteChipElement(chip, backward ? 'before' : 'after', node, offset)
    }
  }

  async function handleInput(_event: Event) {
    if (!isEditing || !editorElement) return

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const anchor = selection.anchorNode

    // Only react when typing inside a plain text node (not inside a chip)
    if (!anchor || anchor.nodeType !== Node.TEXT_NODE) return
    const textNode = anchor as Text
    const parentEl = textNode.parentElement
    if (!parentEl || parentEl.closest('.chip')) return

    // Detect if a complete placeholder exists anywhere in this text node
    const text = textNode.data
    placeholderRe.lastIndex = 0
    const hasFullMatch = placeholderRe.test(text)
    if (!hasFullMatch) return

    // Mirror blur behavior: derive value from DOM and emit immediately
    const newValue = extractTextFromEditor(editorElement)
    if (newValue !== value) {
      value = newValue
      onValueChange(newValue)
      // Wait for Svelte to render chips, then move caret after the next chip
      await tick()
      moveCaretAfterNextChip()
    }
  }

  function moveCaretAfterNextChip() {
    if (!editorElement) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return

    const range = sel.getRangeAt(0)
    let node: Node = range.endContainer
    if (!editorElement.contains(node)) {
      node = editorElement
    }

    // Case 1: caret is inside a chip; move after that chip
    let chipAncestor: HTMLElement | null = null
    if (node.nodeType === Node.ELEMENT_NODE) {
      chipAncestor = (node as HTMLElement).closest('.placeholder-chip')
    } else if ((node as ChildNode).parentElement) {
      chipAncestor = (node as ChildNode).parentElement!.closest('.placeholder-chip')
    }
    if (chipAncestor) {
      const r = document.createRange()
      r.setStartAfter(chipAncestor)
      r.collapse(true)
      sel.removeAllRanges()
      sel.addRange(r)
      return
    }

    // Case 2: find the first chip element after the caret position
    const walker = document.createTreeWalker(editorElement, NodeFilter.SHOW_ELEMENT)
    try {
      walker.currentNode = node
    } catch {
      walker.currentNode = editorElement
    }

    let n: Node | null
    while ((n = walker.nextNode())) {
      const el = n as HTMLElement
      if (el.classList && el.classList.contains('placeholder-chip')) {
        const r = document.createRange()
        r.setStartAfter(el)
        r.collapse(true)
        sel.removeAllRanges()
        sel.addRange(r)
        return
      }
    }

    // Fallback: place caret at end of editor
    const r = document.createRange()
    r.selectNodeContents(editorElement)
    r.collapse(false)
    sel.removeAllRanges()
    sel.addRange(r)
  }

  function handleBlur() {
    if (isEditing) {
      finishEditing()
    }
  }

  function handleChipNameEdit(event: FocusEvent, originalName: string) {
    const target = event.target as HTMLElement
    const newName = target.textContent?.trim() || ''

    if (newName && newName !== originalName) {
      // Replace the old placeholder with the new one in the value
      const oldPlaceholder = `__${originalName}__`
      const newPlaceholder = `__${newName}__`
      const newValue = value.replace(oldPlaceholder, newPlaceholder)

      if (newValue !== value) {
        value = newValue
        onValueChange(newValue)
      }
    } else if (!newName) {
      // Restore original name if empty
      target.textContent = originalName
    }
  }

  function handleChipNameKeydown(event: KeyboardEvent) {
    // Stop propagation to prevent parent editor from handling these events
    event.stopPropagation()

    if (event.key === 'Enter') {
      event.preventDefault()
      const target = event.target as HTMLElement
      target.blur() // This will trigger handleChipNameEdit
    } else if (event.key === 'Escape') {
      event.preventDefault()
      const target = event.target as HTMLElement
      const originalName = target.dataset.originalName || ''
      target.textContent = originalName
      target.blur()
    }
  }

  function handleChipNameClick(event: MouseEvent) {
    // Stop propagation to prevent parent editor from interfering
    event.stopPropagation()
    // Don't set cursor position - let browser handle natural cursor placement
  }

  function handlePlaceholderWheel(event: WheelEvent, segment: PlaceholderSegment) {
    if (disabled) return
    if (!event.ctrlKey) return

    const target = event.currentTarget as HTMLElement | null
    if (!target) return

    event.preventDefault()
    event.stopPropagation()

    const deltaDirection = event.deltaY > 0 ? -1 : 1
    const currentAttr = target.dataset.placeholderWeight
    const currentWeight = currentAttr ? parseFloat(currentAttr) : segment.weight
    const normalizedCurrent = Number.isNaN(currentWeight) ? segment.weight : currentWeight

    const nextWeightRaw = normalizedCurrent + deltaDirection * WEIGHT_STEP
    const nextWeightClamped = clampWeight(roundToStep(nextWeightRaw))
    const normalizedNext = parseFloat(nextWeightClamped.toFixed(1))

    if (isDefaultWeight(normalizedNext) && isDefaultWeight(normalizedCurrent)) {
      return
    }

    if (!isDefaultWeight(normalizedNext) && Math.abs(normalizedNext - normalizedCurrent) < 0.0001) {
      return
    }

    const basePlaceholder = `__${segment.name}__`
    const replacement = isDefaultWeight(normalizedNext)
      ? basePlaceholder
      : `(${basePlaceholder}:${formatWeightValue(normalizedNext)})`

    const prefix = value.slice(0, segment.start)
    const suffix = value.slice(segment.end)
    const newValue = `${prefix}${replacement}${suffix}`

    if (newValue !== value) {
      value = newValue
      onValueChange(newValue)
    }
  }
</script>

<div
  {id}
  class="placeholder-chip-editor {disabled ? 'disabled' : ''} {isEditing ? 'editing' : ''} {!value
    ? 'empty'
    : ''}"
  onclick={handleClick}
  onkeydown={handleKeydown}
  onbeforeinput={handleBeforeInput}
  oninput={handleInput}
  onpaste={handlePaste}
  onblur={handleBlur}
  bind:this={editorElement}
  data-placeholder={placeholder}
  tabindex={disabled ? -1 : 0}
  role="textbox"
  aria-label="Text editor with placeholder chips"
>
  {#if segments.length === 0}
    <span class="placeholder-text">{placeholder}</span>
  {:else}
    {#each segments as segment, index (index)}
      {#if segment.kind === 'text'}
        <span class="text-segment">{segment.text}</span>
      {:else if segment.kind === 'placeholder'}
        <span
          class="chip placeholder-chip {segment.type}"
          data-placeholder-name={segment.name}
          data-placeholder-weight={segment.weightText ?? formatWeightValue(segment.weight)}
          data-placeholder-weight-text={segment.weightText ?? ''}
          ondblclick={(e) => handlePlaceholderDoubleClick(e, segment.name)}
          onwheel={(e) => handlePlaceholderWheel(e, segment)}
          role="button"
          tabindex="0"
          aria-label={`Placeholder: ${segment.name}${
            !isDefaultWeight(segment.weight)
              ? `, weight ${getWeightDisplayText(segment.weight, segment.weightText)}`
              : ''
          }`}
          contenteditable="false"
        >
          <span
            class="chip-name"
            contenteditable="true"
            data-original-name={segment.name}
            onblur={(e) => handleChipNameEdit(e, segment.name)}
            onkeydown={(e) => handleChipNameKeydown(e)}
            onclick={(e) => handleChipNameClick(e)}
            role="textbox"
            aria-label="Edit placeholder name"
            tabindex="0">{segment.name}</span
          >
          <span class="chip-body">
            <span class="chip-name-hidden" aria-hidden="true">{segment.name}</span>
            {#if segment.resolution}
              <span class="chip-resolution">{segment.resolution}</span>
            {/if}
            {#if !isDefaultWeight(segment.weight)}
              <span class="chip-weight"
                >{getWeightDisplayText(segment.weight, segment.weightText)}</span
              >
            {/if}
          </span>
        </span>
      {:else if segment.kind === 'choice'}
        <span class="chip choice-chip" aria-label="Choice options" contenteditable="false">
          {#each segment.options as option, optIndex}
            {#if optIndex > 0}
              <span class="choice-separator"></span>
            {/if}
            <span class="choice-option">{option || '\u00A0'}</span>
          {/each}
        </span>
      {/if}
    {/each}
  {/if}
</div>

<PlaceholderChipEditorAutocomplete
  bind:this={autocompleteController}
  {disabled}
  target={editorElement}
  active={isEditing}
  specialTriggerPrefix="__"
/>

<style>
  .placeholder-chip-editor {
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
    line-height: 1.5;
  }

  .placeholder-chip-editor:focus {
    border-color: #38bdf8;
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.35);
    background-color: #ffffff;
  }

  .placeholder-chip-editor.disabled {
    cursor: default;
    background-color: #f3f4f6;
    opacity: 0.6;
  }

  .placeholder-chip-editor.editing {
    background-color: #ffffff;
    border-color: #38bdf8;
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.35);
  }

  .placeholder-chip-editor.empty .placeholder-text {
    color: #9ca3af;
    font-style: italic;
  }

  .text-segment {
    display: inline;
    white-space: pre-wrap;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem 0.375rem;
    margin: 0.0625rem 0.125rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    user-select: none;
    vertical-align: baseline;
  }

  .placeholder-chip {
    border: 1px dashed;
    position: relative;
    padding: 0 0.35rem 0rem 0.25rem;
    white-space: normal;
  }

  .placeholder-chip.random {
    background-color: #f3e8ff;
    color: #6b21a8;
    border-color: #c084fc;
  }

  .placeholder-chip.random:hover {
    background-color: #e9d5ff;
  }

  .placeholder-chip.random .chip-name {
    background-color: #e9d5ff;
  }

  .placeholder-chip.consistent-random {
    background-color: #ffedd5;
    color: #9a3412;
    border-color: #fb923c;
  }

  .placeholder-chip.consistent-random:hover {
    background-color: #fed7aa;
  }

  .placeholder-chip.consistent-random .chip-name {
    background-color: #fed7aa;
  }

  .placeholder-chip.unknown {
    background-color: #e5e7eb;
    color: #374151;
    border-color: #d1d5db;
  }

  .placeholder-chip.unknown:hover {
    background-color: #d1d5db;
  }

  .placeholder-chip.unknown .chip-name {
    background-color: #e5e7eb;
  }

  .chip-name {
    position: absolute;
    top: 0;
    left: 0;
    padding: 0 0.25rem 0.0625rem 0.25rem;
    font-weight: 600;
    font-size: 0.875rem;
    border-radius: 0.375rem 0 0 0.375rem;
    cursor: text;
    outline: none;
  }

  .chip-name:focus {
    outline: 2px solid rgba(56, 189, 248, 0.5);
    outline-offset: 1px;
  }

  .chip-body {
    display: inline-block;
    max-width: 100%;
    min-width: 0;
    padding: 0.0625rem 0 0 0;
  }

  .chip-name-hidden {
    visibility: hidden;
    display: inline-block;
    padding-right: 0.2rem;
    font-weight: 600;
    font-size: 0.875rem;
  }

  .chip-resolution {
    display: inline;
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

  .chip-weight {
    display: inline;
    font-weight: 700;
    margin-left: 0.25rem;
  }

  .choice-chip {
    background-color: #ecfccb;
    color: #1f3c08;
    border: 1px dashed #166534;
    white-space: nowrap;
    font-size: 0.875rem;
    padding: 0 0.375rem;
  }

  .choice-separator {
    display: inline-flex;
    align-self: stretch;
    width: 0;
    border-left: 1px dashed #166534;
    box-sizing: border-box;
    margin: 0 0.2rem;
  }

  .choice-option {
    white-space: pre;
  }
</style>

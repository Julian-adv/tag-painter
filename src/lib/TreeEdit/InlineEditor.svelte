<script lang="ts">
  import { tick } from 'svelte'
  import ChipEditor from '../placeholder/ChipEditor.svelte'
  import PlaceholderChipDisplay from './PlaceholderChipDisplay.svelte'
  import type { TreeModel } from './model'
  import { formatCommaSeparatedValues, isCommaSeparated } from '../utils/textFormatting'

  interface Props {
    value: string
    onSave: (newValue: string) => void
    placeholder?: string
    className?: string
    onTab?: () => void
    enableAutocomplete?: boolean
    onEditingChange?: (editing: boolean) => void
    expandOnEdit?: boolean
    enterStartsEditing?: boolean
    onFinish?: (completed: boolean) => void
    model: TreeModel | null
    onChipDoubleClick?: (tagName: string) => void
    specialSuggestions?: string[]
    specialTrigger?: string
    isLeafNode?: boolean
  }

  let {
    value,
    onSave,
    placeholder = '',
    className = '',
    onTab,
    enableAutocomplete = false,
    onEditingChange,
    expandOnEdit = false,
    enterStartsEditing = true,
    onFinish,
    model = null,
    onChipDoubleClick,
    specialSuggestions = [],
    specialTrigger = '__',
    isLeafNode = false
  }: Props = $props()

  let isEditing = $state(false)
  let editingValue = $state('')
  let chipEditorRef: {
    getText: () => string
    readText: (input: string) => void
    getCaretPrefix: () => string
    restoreCaret: (prefix: string) => void
    focusEditor: (mode: 'selectAll' | 'caretEnd') => void
  } | null = $state(null)
  const EMPTY_RESOLUTIONS: Record<string, string> = {}
  let wrapperEl: HTMLDivElement | null = $state(null)

  // Adjust the weight of the comma-separated token at caret with Ctrl+Wheel
  function handleWheel(event: WheelEvent) {
    if (!event.ctrlKey || !enableAutocomplete || !chipEditorRef) return
    event.preventDefault()
    event.stopPropagation()

    const step = event.deltaY < 0 ? 0.1 : -0.1
    const currentText = chipEditorRef.getText?.() ?? editingValue
    const caretPrefix = chipEditorRef.getCaretPrefix?.() ?? ''
    const caretPos = caretPrefix.length

    const { text, caretPos: nextCaret } = adjustWeightAtCaret(currentText, caretPos, step)
    if (text !== currentText) {
      chipEditorRef.readText?.(text)
      chipEditorRef.restoreCaret?.(text.slice(0, nextCaret))
      editingValue = text
    }
  }

  // Core logic: find token by comma around caret, wrap as (token:weight) and adjust
  function adjustWeightAtCaret(
    text: string,
    caret: number,
    delta: number
  ): { text: string; caretPos: number } {
    // Find token boundaries (comma-separated)
    const leftComma = text.lastIndexOf(',', Math.max(0, caret - 1))
    const rightComma = text.indexOf(',', caret)
    const left = leftComma === -1 ? 0 : leftComma + 1
    const right = rightComma === -1 ? text.length : rightComma

    // Preserve surrounding whitespace but operate on trimmed token
    let tokenStart = left
    while (tokenStart < right && /\s/.test(text[tokenStart])) tokenStart++
    let tokenEnd = right
    while (tokenEnd > tokenStart && /\s/.test(text[tokenEnd - 1])) tokenEnd--

    if (tokenStart >= tokenEnd) {
      return { text, caretPos: caret }
    }

    const token = text.slice(tokenStart, tokenEnd)

    // Parse existing form: (label:weight) | (label) | label
    let label = ''
    let weight = 1.0
    let hasParens = false
    let hasExplicitWeight = false

    if (token.startsWith('(') && token.endsWith(')')) {
      hasParens = true
      const inner = token.slice(1, -1)
      const colonIdx = inner.lastIndexOf(':')
      if (colonIdx !== -1) {
        label = inner.slice(0, colonIdx)
        const num = parseFloat(inner.slice(colonIdx + 1))
        if (!Number.isNaN(num)) {
          weight = num
          hasExplicitWeight = true
        } else {
          label = inner // Treat as no weight if parse failed
        }
      } else {
        label = inner
      }
    } else {
      // No parentheses
      const colonIdx = token.lastIndexOf(':')
      if (colonIdx !== -1) {
        // If someone typed label:1.2 without parens, support it
        label = token.slice(0, colonIdx)
        const num = parseFloat(token.slice(colonIdx + 1))
        weight = Number.isNaN(num) ? 1.0 : num
        hasExplicitWeight = !Number.isNaN(num)
      } else {
        label = token
      }
    }

    // Determine caret position within label
    let labelStartInText = tokenStart + (hasParens ? 1 : 0)
    let labelEndInText = tokenEnd - (hasParens ? 1 : 0)
    if (hasParens && hasExplicitWeight) {
      // Exclude ":weight" from label range
      const inner = token.slice(1, -1)
      const colonIdx = inner.lastIndexOf(':')
      if (colonIdx !== -1) {
        labelEndInText = tokenStart + 1 + colonIdx
      }
    } else if (!hasParens && hasExplicitWeight) {
      const colonIdx = token.lastIndexOf(':')
      if (colonIdx !== -1) {
        labelEndInText = tokenStart + colonIdx
      }
    }

    const labelLen = Math.max(0, labelEndInText - labelStartInText)
    const posInLabel = Math.max(0, Math.min(labelLen, caret - labelStartInText))

    // Adjust weight and clamp
    const newWeightRaw = Math.round((weight + delta) * 10) / 10
    const newWeight = Math.max(0.1, Math.min(2.0, newWeightRaw))

    const before = text.slice(0, tokenStart)
    const after = text.slice(tokenEnd)

    // If weight is exactly 1.0, unwrap to just the label (no parentheses)
    const isOne = newWeight === 1.0
    const newToken = isOne ? label : `(${label}:${newWeight.toFixed(1)})`
    const newText = before + newToken + after

    // New caret: keep position within label
    const newLabelStart = isOne ? before.length : before.length + 1 // after "(" if wrapped
    const newCaret = newLabelStart + Math.max(0, Math.min(label.length, posInLabel))

    return { text: newText, caretPos: newCaret }
  }

  async function startEditing(behavior: 'selectAll' | 'caretEnd' = 'selectAll') {
    editingValue = value
    isEditing = true
    onEditingChange?.(true)
    await tick()
    chipEditorRef?.readText?.(value)
    chipEditorRef?.focusEditor?.(behavior)
  }

  function finishEditing() {
    const editorValue = chipEditorRef?.getText?.() ?? editingValue
    editingValue = editorValue
    let finalValue = editorValue.trim()

    // Apply comma formatting for leaf nodes
    if (isLeafNode && finalValue && isCommaSeparated(finalValue)) {
      finalValue = formatCommaSeparatedValues(finalValue)
    }

    if (finalValue && finalValue !== value) {
      onSave(finalValue)
    }
    isEditing = false
    onEditingChange?.(false)
    onFinish?.(true) // completed = true
  }

  function cancelEditing() {
    isEditing = false
    editingValue = ''
    onEditingChange?.(false)
    onFinish?.(false) // completed = false (cancelled)
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      finishEditing()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      cancelEditing()
    } else if (event.key === 'Tab' && !event.shiftKey) {
      if (onTab) {
        event.preventDefault()
        event.stopPropagation()
        finishEditing()
        onTab()
      }
    }
  }

  function handleFocusOut(event: FocusEvent) {
    const next = event.relatedTarget as Node | null
    if (wrapperEl && next && wrapperEl.contains(next)) {
      return
    }

    // Delay finishing to allow focus to settle (e.g., choice-cell getting focus)
    setTimeout(() => {
      if (wrapperEl && wrapperEl.contains(document.activeElement)) {
        return
      }
      finishEditing()
    }, 0)
  }

  export async function activate(behavior: 'selectAll' | 'caretEnd' = 'selectAll') {
    await startEditing(behavior)
  }
</script>

{#if isEditing}
  <div
    class="chip-editor-wrapper {expandOnEdit ? 'full-width' : ''}"
    bind:this={wrapperEl}
    onfocusout={handleFocusOut}
    onkeydown={handleKeydown}
    onwheel={handleWheel}
    role="presentation"
  >
    <ChipEditor
      bind:this={chipEditorRef}
      label=""
      value={editingValue}
      disabled={false}
      currentRandomTagResolutions={EMPTY_RESOLUTIONS}
      onTagDoubleClick={onChipDoubleClick}
      specialSuggestions={enableAutocomplete ? specialSuggestions : []}
      specialTrigger={enableAutocomplete ? specialTrigger : '__'}
      showLabel={false}
      autocompleteActive={enableAutocomplete}
    />
  </div>
{:else}
  <div
    class="inline-editor-display {className}"
    ondblclick={() => startEditing('caretEnd')}
    role="button"
    tabindex="-1"
    onkeydown={(e) => {
      if (e.key === 'Enter' && enterStartsEditing) {
        e.preventDefault()
        e.stopPropagation()
        startEditing()
      }
    }}
  >
    <PlaceholderChipDisplay {value} {placeholder} {model} {onChipDoubleClick} />
  </div>
{/if}

<style>
  .chip-editor-wrapper {
    width: 100%;
  }

  .chip-editor-wrapper.full-width {
    width: 100%;
  }

  .inline-editor-display {
    padding: 0.125rem 0.25rem;
    border: 1px solid transparent;
    font-size: 0.875rem;
    cursor: pointer;
    /* Allow wrapping across multiple lines when content exceeds parent width */
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
    user-select: none;
    min-width: 1.5rem;
    min-height: 1.25rem; /* Ensure minimum height for empty values */
  }

  /* Ensure empty values have proper height by adding content */
  .inline-editor-display:empty::before {
    content: '\200B'; /* Zero-width space to maintain height */
    display: inline-block;
  }
  .inline-editor-display:hover {
    background-color: rgba(255, 255, 255, 0.5);
  }
  .inline-editor-input {
    border: none;
    background: #ffffff;
    outline: none;
    padding: 0.125rem 0.25rem;
    font-size: 0.875rem;
    min-width: 1.5rem;
  }
  .inline-editor-input.full-width {
    width: 100%;
  }
</style>

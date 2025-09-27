<script lang="ts">
  import { tick } from 'svelte'
  import { createPlaceholderRegex } from '$lib/constants'
  import { findNodeByName, isConsistentRandomArray } from './TreeEdit/utils'
  import type { TreeModel } from './TreeEdit/model'

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
      }
    | { kind: 'choice'; options: string[] }

  const placeholderRe = createPlaceholderRegex()
  let editorElement: HTMLDivElement | null = null
  let isEditing = $state(false)

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

  function parseTextIntoSegments(text: string): Segment[] {
    const segments: Segment[] = []
    let lastIndex = 0

    // First pass: handle placeholders
    placeholderRe.lastIndex = 0
    const matches = Array.from(text.matchAll(placeholderRe))

    for (const match of matches) {
      const matchIndex = match.index ?? 0

      // Add text before placeholder
      if (matchIndex > lastIndex) {
        const textBefore = text.slice(lastIndex, matchIndex)
        segments.push(...parseChoiceSegments(textBefore))
      }

      // Add placeholder segment
      const name = match[1]
      const type = getTagType(name)
      const resolution = currentRandomTagResolutions[name] || null
      segments.push({ kind: 'placeholder', name, type, resolution })

      lastIndex = matchIndex + match[0].length
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
      const options = optionsText.split('|').map(opt => opt.trim())
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

  function handleClick() {
    if (disabled) return
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

      // Set cursor to end
      const selection = window.getSelection()
      if (selection) {
        selection.selectAllChildren(editorElement)
        selection.collapseToEnd()
      }
    }
  }

  function finishEditing() {
    if (!editorElement) return

    isEditing = false
    editorElement.contentEditable = 'false'

    // Extract text content from the contenteditable div
    const newValue = editorElement.textContent || ''

    if (newValue !== value) {
      value = newValue
      onValueChange(newValue)
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!isEditing) return

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

  function handleBlur() {
    if (isEditing) {
      finishEditing()
    }
  }

  // Update segments when dependencies change
  $effect(() => {
    // React to changes in value, currentRandomTagResolutions, model, refreshToken
    void value
    void currentRandomTagResolutions
    void model
    void refreshToken
    // segments will be recalculated via $derived
  })
</script>

<div
  {id}
  class="placeholder-chip-editor {disabled ? 'disabled' : ''} {isEditing ? 'editing' : ''} {!value ? 'empty' : ''}"
  onclick={handleClick}
  onkeydown={handleKeydown}
  onblur={handleBlur}
  bind:this={editorElement}
  data-placeholder={placeholder}
  tabindex={disabled ? -1 : 0}
  role="textbox"
  aria-label="Text editor with placeholder chips"
>
  {#if !isEditing}
    {#if segments.length === 0}
      <span class="placeholder-text">{placeholder}</span>
    {:else}
      {#each segments as segment, index (index)}
        {#if segment.kind === 'text'}
          <span class="text-segment">{segment.text}</span>
        {:else if segment.kind === 'placeholder'}
          <span
            class="chip placeholder-chip {segment.type}"
            ondblclick={(e) => handlePlaceholderDoubleClick(e, segment.name)}
            role="button"
            tabindex="0"
            aria-label="Placeholder: {segment.name}"
          >
            <span class="chip-name">{segment.name}</span>
            {#if segment.resolution}
              <span class="chip-resolution">{segment.resolution}</span>
            {/if}
          </span>
        {:else if segment.kind === 'choice'}
          <span class="chip choice-chip" aria-label="Choice options">
            {#each segment.options as option, optIndex}
              {#if optIndex > 0}
                <span class="choice-separator">|</span>
              {/if}
              <span class="choice-option">{option || '\u00A0'}</span>
            {/each}
          </span>
        {/if}
      {/each}
    {/if}
  {:else}
    <!-- When editing, show plain text content -->
    {value}
  {/if}
</div>

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
    margin: 0 0.125rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    user-select: none;
    vertical-align: baseline;
  }

  .placeholder-chip {
    border: 1px solid;
    gap: 0.25rem;
  }

  .placeholder-chip.random {
    background-color: #f3e8ff;
    color: #6b21a8;
    border-color: #c084fc;
  }

  .placeholder-chip.random:hover {
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

  .placeholder-chip.unknown {
    background-color: #e5e7eb;
    color: #374151;
    border-color: #d1d5db;
  }

  .placeholder-chip.unknown:hover {
    background-color: #d1d5db;
  }

  .chip-name {
    font-weight: 600;
  }

  .chip-resolution {
    font-weight: 400;
    opacity: 0.8;
    font-style: italic;
  }

  .choice-chip {
    background-color: #ecfccb;
    color: #1f3c08;
    border: 1px dashed #166534;
    white-space: nowrap;
  }

  .choice-separator {
    margin: 0 0.25rem;
    color: #166534;
    font-weight: bold;
  }

  .choice-option {
    white-space: pre;
  }

  /* Hide placeholder text when editor is focused and empty */
  .placeholder-chip-editor[contenteditable="true"]:empty::before {
    content: attr(data-placeholder);
    color: #9ca3af;
    font-style: italic;
    pointer-events: none;
  }
</style>
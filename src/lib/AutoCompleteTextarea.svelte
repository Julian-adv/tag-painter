<!-- Reusable textarea component with auto-completion support -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { getTags } from './stores/tagsStore'

  interface Props {
    id?: string
    value: string
    placeholder?: string
    rows?: number
    class?: string
    readonly?: boolean
    onValueChange?: (value: string) => void
    onkeydown?: (event: KeyboardEvent) => void
  }

  let {
    id,
    value = $bindable(),
    placeholder = 'Enter text...',
    class: className = '',
    readonly = false,
    onValueChange,
    onkeydown
  }: Props = $props()

  let textareaElement: HTMLTextAreaElement
  let tags: string[] = $state([])
  let suggestions: string[] = $state([])
  let showSuggestions = $state(false)
  let selectedSuggestionIndex = $state(-1)
  let suggestionPosition = $state({ top: 0, left: 0 })
  let mirrorDiv: HTMLDivElement | null = null

  onMount(async () => {
    tags = await getTags()
  })

  function getCurrentWord(): { word: string; startIndex: number } {
    const cursorPosition = textareaElement.selectionStart
    const text = value

    // Find the start of the current word (looking for spaces or commas)
    let startIndex = cursorPosition - 1
    while (
      startIndex >= 0 &&
      text[startIndex] !== ' ' &&
      text[startIndex] !== ',' &&
      text[startIndex] !== '\n'
    ) {
      startIndex--
    }
    startIndex++

    // Find the end of the current word
    let endIndex = cursorPosition
    while (
      endIndex < text.length &&
      text[endIndex] !== ' ' &&
      text[endIndex] !== ',' &&
      text[endIndex] !== '\n'
    ) {
      endIndex++
    }

    return {
      word: text.substring(startIndex, endIndex).trim(),
      startIndex
    }
  }

  function updateSuggestions() {
    if (readonly) {
      suggestions = []
      showSuggestions = false
      return
    }

    const { word } = getCurrentWord()

    if (word.length < 2) {
      suggestions = []
      showSuggestions = false
      return
    }

    suggestions = tags.filter((tag) => tag.toLowerCase().includes(word.toLowerCase())).slice(0, 100)

    showSuggestions = suggestions.length > 0
    selectedSuggestionIndex = -1

    if (showSuggestions) {
      updateSuggestionPosition()
    }
  }

  function updateSuggestionPosition() {
    // Use textarea mirroring technique directly
    let popUpPos = { x: 0, y: 0 }

    // Create and setup mirror div if it doesn't exist
    if (!mirrorDiv) {
      mirrorDiv = document.createElement('div')
      document.body.appendChild(mirrorDiv)

      const style = window.getComputedStyle(textareaElement)

      // Copy all computed styles from textarea to mirror div
      for (let i = 0; i < style.length; i++) {
        const property = style[i]
        mirrorDiv.style.setProperty(property, style.getPropertyValue(property))
      }

      // Set position styles for accurate positioning
      mirrorDiv.style.position = 'absolute'
      mirrorDiv.style.top = '-9999px'
      mirrorDiv.style.left = '-9999px'
      mirrorDiv.style.visibility = 'hidden'
    }

    // Clear previous content
    mirrorDiv.innerHTML = ''

    // Add text up to cursor position
    const textBeforeCursor = textareaElement.value.substring(0, textareaElement.selectionStart)
    const textAfterCursor = textareaElement.value.substring(textareaElement.selectionStart)

    mirrorDiv.textContent = textBeforeCursor

    // Add a span at cursor position
    const span = document.createElement('span')
    mirrorDiv.appendChild(span)

    // Add remaining text after cursor for accurate wrapping
    const afterText = document.createTextNode(textAfterCursor)
    mirrorDiv.appendChild(afterText)

    // Get positions
    const divPos = mirrorDiv.getBoundingClientRect()
    const spanPos = span.getBoundingClientRect()
    const inputPos = textareaElement.getBoundingClientRect()

    popUpPos = {
      x: inputPos.x + (spanPos.x - divPos.x),
      y: inputPos.y + (spanPos.y - divPos.y)
    }

    suggestionPosition = {
      top: popUpPos.y + 20,
      left: popUpPos.x
    }
  }

  function insertSuggestion(suggestion: string) {
    const { word, startIndex } = getCurrentWord()
    const beforeWord = value.substring(0, startIndex)
    const afterWord = value.substring(startIndex + word.length)

    value = beforeWord + suggestion + afterWord
    showSuggestions = false
    onValueChange?.(value)

    // Set cursor position after the inserted suggestion
    setTimeout(() => {
      const newCursorPosition = startIndex + suggestion.length
      textareaElement.setSelectionRange(newCursorPosition, newCursorPosition)
      textareaElement.focus()
    }, 0)
  }


  function autoResize() {
    if (textareaElement) {
      textareaElement.style.height = 'auto'
      textareaElement.style.height = textareaElement.scrollHeight + 'px'
    }
  }

  // Auto-resize when value changes or component mounts
  $effect(() => {
    if (textareaElement && value !== undefined) {
      // Small delay to ensure DOM has updated
      setTimeout(() => autoResize(), 0)
    }
  })

  function handleInput() {
    updateSuggestions()
    autoResize()
    onValueChange?.(value)
  }

  function handleClick() {
    updateSuggestions()
  }

  function handleBlur() {
    // Use setTimeout to allow suggestion clicks to be processed before hiding
    setTimeout(() => {
      showSuggestions = false
      selectedSuggestionIndex = -1
    }, 150)
  }

  function handleKeydown(event: KeyboardEvent) {
    // Handle suggestion navigation
    if (showSuggestions && suggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, suggestions.length - 1)
        return
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1)
        return
      } else if (event.key === 'Tab' || event.key === 'Enter') {
        if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestions.length) {
          event.preventDefault()
          insertSuggestion(suggestions[selectedSuggestionIndex])
          return
        }
      } else if (event.key === 'Escape') {
        event.preventDefault()
        showSuggestions = false
        selectedSuggestionIndex = -1
        return
      }
    }
    
    // Call custom onkeydown handler if provided
    onkeydown?.(event)
  }
</script>

<div class="textarea-container">
  <textarea
    {id}
    bind:this={textareaElement}
    bind:value
    {placeholder}
    {readonly}
    rows={1}
    class="textarea {className} {readonly ? 'readonly' : ''}"
    oninput={handleInput}
    onclick={handleClick}
    onkeydown={handleKeydown}
    onblur={handleBlur}
    style="resize: none; overflow: hidden; min-height: 1.5em;"
  ></textarea>

  {#if showSuggestions}
    <div
      class="suggestions-dropdown"
      style="top: {suggestionPosition.top}px; left: {suggestionPosition.left}px;"
    >
      {#each suggestions as suggestion, index (suggestion)}
        <button
          type="button"
          class="suggestion-item {index === selectedSuggestionIndex ? 'selected' : ''}"
          onmousedown={(e) => {
            e.preventDefault()
            insertSuggestion(suggestion)
          }}
        >
          {suggestion}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .textarea-container {
    position: relative;
    width: 100%;
  }

  .textarea {
    display: block;
    width: 100%;
    padding: 4px;
    border-radius: 4px;
    border: 1px solid #ddd;
    font-size: 13px;
    resize: vertical;
    box-sizing: border-box;
    background-color: #fff;
  }

  .textarea:focus {
    outline: none;
    border-color: #2196f3;
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
  }

  .textarea.readonly {
    background-color: #f5f5f5;
    color: #666;
    cursor: not-allowed;
  }

  .suggestions-dropdown {
    position: fixed;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    max-height: 200px;
    overflow-y: auto;
    overflow-x: hidden;
    z-index: 9999;
    min-width: 120px;
    max-width: 250px;
  }

  .suggestion-item {
    padding: 6px 12px;
    cursor: pointer;
    font-size: 14px;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    color: #2c6ded;
    margin: 2px 0;
    transition: background-color 0.15s ease;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-sizing: border-box;
  }

  .suggestion-item:hover {
    background-color: #f5f5f5;
  }

  .suggestion-item.selected {
    background-color: #e8f4fd;
    color: #1976d2;
  }
</style>

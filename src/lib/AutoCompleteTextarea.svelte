<!-- Reusable textarea component with auto-completion support -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { initTags, isCustomTag, combinedTags } from './stores/tagsStore'

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
  let suggestions: string[] = $state([])
  let showSuggestions = $state(false)
  let selectedSuggestionIndex = $state(-1)
  let suggestionPosition = $state({ top: 0, left: 0 })
  let mirrorDiv: HTMLDivElement | null = null
  let lastSelectedSuggestions: Map<string, string> = new Map()

  onMount(async () => {
    await initTags()
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

    suggestions = $combinedTags.filter((tag) => tag.toLowerCase().includes(word.toLowerCase())).slice(0, 100)

    showSuggestions = suggestions.length > 0
    selectedSuggestionIndex = -1

    // Auto-select previously chosen suggestion if it exists
    if (showSuggestions) {
      const lastSelected = lastSelectedSuggestions.get(word.toLowerCase())
      if (lastSelected) {
        const index = suggestions.findIndex(suggestion => suggestion === lastSelected)
        if (index !== -1) {
          selectedSuggestionIndex = index
          // Scroll to show the selected suggestion
          scrollSelectedIntoView()
        }
      }
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

    // Remember this selection for the current word
    if (word.length >= 2) {
      lastSelectedSuggestions.set(word.toLowerCase(), suggestion)
    }

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

  function scrollSelectedIntoView() {
    if (selectedSuggestionIndex < 0) return
    
    // Use a small delay to ensure DOM is updated
    setTimeout(() => {
      const suggestionElement = document.querySelector(`[data-suggestion-index="${selectedSuggestionIndex}"]`)
      if (suggestionElement) {
        suggestionElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        })
      }
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
        scrollSelectedIntoView()
        return
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1)
        scrollSelectedIntoView()
        return
      } else if (event.key === 'Tab') {
        event.preventDefault()
        // Use first suggestion if none selected, otherwise use selected one
        const indexToUse = selectedSuggestionIndex >= 0 ? selectedSuggestionIndex : 0
        if (indexToUse < suggestions.length) {
          insertSuggestion(suggestions[indexToUse])
        }
        return
      } else if (event.key === 'Enter') {
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

<div class="relative w-full">
  <textarea
    {id}
    bind:this={textareaElement}
    bind:value
    {placeholder}
    {readonly}
    rows={1}
    class="block w-full p-1 rounded border border-gray-300 text-sm resize-y box-border bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 {readonly
      ? 'bg-gray-100 text-gray-600 cursor-not-allowed'
      : ''} {className}"
    oninput={handleInput}
    onclick={handleClick}
    onkeydown={handleKeydown}
    onblur={handleBlur}
    style="resize: none; overflow: hidden;"
  ></textarea>

  {#if showSuggestions}
    <div
      class="fixed bg-white border border-gray-300 rounded shadow-lg max-h-48 overflow-y-auto overflow-x-hidden z-[9999] min-w-[120px] max-w-[250px]"
      style="top: {suggestionPosition.top}px; left: {suggestionPosition.left}px;"
    >
      {#each suggestions as suggestion, index (suggestion)}
        <button
          type="button"
          data-suggestion-index={index}
          class="py-1.5 px-3 cursor-pointer text-sm border-none bg-none w-full text-left my-0.5 transition-colors duration-150 whitespace-nowrap overflow-hidden text-ellipsis box-border hover:bg-gray-100 {index ===
          selectedSuggestionIndex
            ? isCustomTag(suggestion)
              ? 'bg-pink-50 text-pink-700'
              : 'bg-blue-50 text-blue-700'
            : isCustomTag(suggestion)
              ? 'text-pink-600'
              : 'text-blue-600'}"
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

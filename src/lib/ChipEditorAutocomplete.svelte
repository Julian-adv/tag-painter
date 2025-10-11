<script lang="ts">
  import { onDestroy } from 'svelte'
  import { initTags, isCustomTag, combinedTags } from './stores/tagsStore'

  interface Props {
    target: HTMLElement | null
    disabled?: boolean
    active?: boolean
    specialTriggerPrefix?: string
    specialSuggestions?: string[]
  }

  let {
    target = null,
    disabled = false,
    active = true,
    specialTriggerPrefix = '__',
    specialSuggestions = []
  }: Props = $props()

  const MAX_SUGGESTIONS = 100

  interface SelectionContext {
    node: Text
    start: number
    end: number
    isChipName: boolean
    hasSpecialSuffix: boolean
    usingSpecial: boolean
  }

  let suggestions: string[] = $state([])
  let showSuggestions = $state(false)
  let selectedSuggestionIndex = $state(-1)
  let suggestionPosition = $state({ top: 0, left: 0 })
  let currentContext: SelectionContext | null = null
  let cleanup: (() => void) | null = null

  $effect(() => {
    $combinedTags
    if (showSuggestions) {
      updateSuggestions()
    }
  })

  $effect(() => {
    specialSuggestions
    if (showSuggestions) {
      updateSuggestions()
    }
  })

  onDestroy(() => {
    detach()
  })

  $effect(() => {
    if (!active || !target || disabled) {
      detach()
      hideSuggestions()
      return
    }

    attach()
    updateSuggestions()
  })

  async function attach() {
    await initTags()

    detach()
    if (!target) return

    const handleInput = () => updateSuggestions()
    const handleClick = () => updateSuggestions()
    const handleKeyUp = (event: KeyboardEvent) => {
      if (
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'Tab' ||
        event.key === 'Enter' ||
        event.key === 'Escape'
      ) {
        return
      }
      updateSuggestions()
    }
    const handleScroll = () => {
      if (showSuggestions) updateSuggestionPosition()
    }
    const handleBlur = () => {
      setTimeout(() => hideSuggestions(), 100)
    }

    target.addEventListener('input', handleInput)
    target.addEventListener('click', handleClick)
    target.addEventListener('keyup', handleKeyUp)
    target.addEventListener('scroll', handleScroll)
    target.addEventListener('blur', handleBlur, true)

    const handleWindowScroll = () => {
      if (showSuggestions) updateSuggestionPosition()
    }
    const handleResize = () => {
      if (showSuggestions) updateSuggestionPosition()
    }

    window.addEventListener('scroll', handleWindowScroll, true)
    window.addEventListener('resize', handleResize)

    cleanup = () => {
      target?.removeEventListener('input', handleInput)
      target?.removeEventListener('click', handleClick)
      target?.removeEventListener('keyup', handleKeyUp)
      target?.removeEventListener('scroll', handleScroll)
      target?.removeEventListener('blur', handleBlur, true)
      window.removeEventListener('scroll', handleWindowScroll, true)
      window.removeEventListener('resize', handleResize)
      cleanup = null
    }
  }

  function detach() {
    cleanup?.()
    cleanup = null
  }

  function hideSuggestions() {
    showSuggestions = false
    selectedSuggestionIndex = -1
    suggestions = []
    currentContext = null
  }

  function isDelimiter(char: string) {
    return (
      char === ' ' ||
      char === ',' ||
      char === '\n' ||
      char === '{' ||
      char === '}' ||
      char === '(' ||
      char === ')' ||
      char === ':' ||
      char === '|'
    )
  }

  function resolveSelectionContext(): SelectionContext | null {
    if (!target) return null
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null
    const range = selection.getRangeAt(0)
    const container = range.startContainer
    if (!target.contains(container)) return null

    const caretRange = range.cloneRange()
    caretRange.collapse(true)

    let textNode: Text | null = null
    let offset = caretRange.startOffset

    if (caretRange.startContainer.nodeType === Node.TEXT_NODE) {
      textNode = caretRange.startContainer as Text
    } else if (caretRange.startContainer.nodeType === Node.ELEMENT_NODE) {
      const element = caretRange.startContainer as Element
      const resolved = findTextNodeForElement(element, caretRange.startOffset, target)
      if (resolved) {
        ;({ node: textNode, offset } = resolved)
      }
    }

    if (!textNode) return null

    const parentElement = textNode.parentElement
    const isChipName = parentElement?.classList.contains('chip-name') ?? false

    const textContent = textNode.textContent ?? ''

    let start = offset
    while (start > 0 && !isDelimiter(textContent[start - 1])) {
      start--
    }

    let end = offset
    while (end < textContent.length && !isDelimiter(textContent[end])) {
      end++
    }

    if (start === end) return null

    const word = textContent.slice(start, end)
    if (!word) return null

    const usingSpecial =
      specialTriggerPrefix !== undefined &&
      specialTriggerPrefix !== null &&
      (specialTriggerPrefix === '' || word.startsWith(specialTriggerPrefix))

    const hasSpecialSuffix =
      usingSpecial && specialTriggerPrefix ? word.endsWith(specialTriggerPrefix) : false

    return {
      node: textNode,
      start,
      end,
      isChipName,
      hasSpecialSuffix,
      usingSpecial
    }
  }

  function findTextNodeForElement(
    element: Element,
    offset: number,
    root: HTMLElement
  ): { node: Text; offset: number } | null {
    if (element.childNodes.length === 0) {
      return ascendToFindTextNode(element, root)
    }

    const forward = element.childNodes[offset] ?? null
    if (forward) {
      const found = findFirstTextNode(forward)
      if (found) return { node: found.node, offset: 0 }
    }

    for (let index = offset - 1; index >= 0; index--) {
      const previous = element.childNodes[index]
      const found = findLastTextNode(previous)
      if (found) return { node: found.node, offset: found.length }
    }

    return ascendToFindTextNode(element, root)
  }

  function ascendToFindTextNode(
    element: Element,
    root: HTMLElement
  ): { node: Text; offset: number } | null {
    const parent = element.parentElement
    if (!parent || parent === root) return null
    const index = Array.prototype.indexOf.call(parent.childNodes, element)
    return findTextNodeForElement(parent, index, root)
  }

  function findFirstTextNode(node: Node): { node: Text } | null {
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text
      const parent = textNode.parentElement
      if (parent && parent.closest('.tag') && parent.classList.contains('chip-name') === false) {
        return null
      }
      return { node: textNode }
    }
    for (let index = 0; index < node.childNodes.length; index++) {
      const child = node.childNodes[index]
      const found = findFirstTextNode(child)
      if (found) return found
    }
    return null
  }

  function findLastTextNode(node: Node): { node: Text; length: number } | null {
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text
      const parent = textNode.parentElement
      if (parent && parent.closest('.tag') && parent.classList.contains('chip-name') === false) {
        return null
      }
      return { node: textNode, length: textNode.textContent?.length ?? 0 }
    }
    for (let index = node.childNodes.length - 1; index >= 0; index--) {
      const child = node.childNodes[index]
      const found = findLastTextNode(child)
      if (found) return found
    }
    return null
  }

  function updateSuggestions() {
    if (disabled || !active || !target) {
      hideSuggestions()
      return
    }

    const context = resolveSelectionContext()
    if (!context) {
      hideSuggestions()
      return
    }

    const textContent = context.node.textContent ?? ''
    const rawWord = textContent.slice(context.start, context.end)
    if (!rawWord) {
      hideSuggestions()
      return
    }

    let usingSpecial = context.usingSpecial
    let hasClosing = context.hasSpecialSuffix
    let searchTerm = rawWord

    if (usingSpecial && specialTriggerPrefix) {
      searchTerm = rawWord.slice(specialTriggerPrefix.length)
      if (hasClosing) {
        searchTerm = searchTerm.slice(
          0,
          Math.max(0, searchTerm.length - specialTriggerPrefix.length)
        )
      }
    }

    if (!context.isChipName && !usingSpecial && searchTerm.length < 2) {
      hideSuggestions()
      return
    }

    if (context.isChipName && searchTerm.length < 2) {
      hideSuggestions()
      return
    }

    const pool = usingSpecial
      ? (Array.isArray(specialSuggestions) ? specialSuggestions : [])
      : $combinedTags

    const lower = searchTerm.toLowerCase()
    const filtered = pool
      .filter((tag) => tag && tag.toLowerCase().includes(lower))
      .slice(0, MAX_SUGGESTIONS)

    if (filtered.length === 0) {
      hideSuggestions()
      return
    }

    suggestions = filtered
    showSuggestions = true
    selectedSuggestionIndex = -1
    currentContext = {
      ...context,
      usingSpecial,
      hasSpecialSuffix: hasClosing
    }

    updateSuggestionPosition()
  }

  function updateSuggestionPosition() {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0).cloneRange()
    range.collapse(true)
    const rect = range.getBoundingClientRect()

    suggestionPosition = {
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX
    }
  }

  function dispatchInputEvent() {
    if (!target) return
    try {
      target.dispatchEvent(new InputEvent('input', { bubbles: true }))
    } catch (_error) {
      target.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }

  function insertSuggestion(suggestion: string) {
    if (!currentContext || !target) return

    const selection = window.getSelection()
    if (!selection) return

    const processed = suggestion.replace(/_/g, ' ')
    let replacement = processed

    if (!currentContext.isChipName && currentContext.usingSpecial && specialTriggerPrefix) {
      const suffix = currentContext.hasSpecialSuffix ? '' : specialTriggerPrefix
      replacement = `${specialTriggerPrefix}${processed}${suffix}`
    }

    const node = currentContext.node
    const textContent = node.textContent ?? ''
    const before = textContent.slice(0, currentContext.start)
    const after = textContent.slice(currentContext.end)
    node.textContent = before + replacement + after

    const newOffset = before.length + replacement.length
    const range = document.createRange()
    range.setStart(node, newOffset)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)

    target.focus()
    dispatchInputEvent()
    hideSuggestions()
  }

  function scrollSelectedIntoView() {
    if (selectedSuggestionIndex < 0) return
    setTimeout(() => {
      const element = document.querySelector(
        `[data-chip-suggestion-index="${selectedSuggestionIndex}"]`
      )
      element?.scrollIntoView({ behavior: 'instant', block: 'center' })
    }, 0)
  }

  export function handleKeydown(event: KeyboardEvent): boolean {
    if (!showSuggestions || suggestions.length === 0) return false

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      event.stopPropagation()
      selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, suggestions.length - 1)
      scrollSelectedIntoView()
      return true
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1)
      scrollSelectedIntoView()
      return true
    }

    if (event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      const index = selectedSuggestionIndex >= 0 ? selectedSuggestionIndex : 0
      if (index < suggestions.length) insertSuggestion(suggestions[index])
      return true
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestions.length) {
        insertSuggestion(suggestions[selectedSuggestionIndex])
      } else {
        hideSuggestions()
      }
      return true
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      hideSuggestions()
      return true
    }

    return false
  }

  export function close() {
    hideSuggestions()
  }
</script>

{#if showSuggestions}
  <div
    class="fixed z-[9999] max-h-48 max-w-[250px] min-w-[120px] overflow-x-hidden overflow-y-auto rounded border border-gray-300 bg-white shadow-lg"
    style="top: {suggestionPosition.top}px; left: {suggestionPosition.left}px;"
  >
    {#each suggestions as suggestion, index (index)}
      <button
        type="button"
        data-chip-suggestion-index={index}
        class="my-0.5 box-border w-full cursor-pointer overflow-hidden border-none bg-none px-3 py-1.5 text-left text-sm text-ellipsis whitespace-nowrap transition-colors duration-150 hover:bg-gray-100 {index ===
        selectedSuggestionIndex
          ? isCustomTag(suggestion)
            ? 'bg-pink-50 text-pink-700'
            : 'bg-blue-50 text-blue-700'
          : isCustomTag(suggestion)
            ? 'text-pink-600'
            : 'text-blue-600'}"
        onmousedown={(event) => {
          event.preventDefault()
          insertSuggestion(suggestion)
        }}
      >
        {suggestion}
      </button>
    {/each}
  </div>
{/if}

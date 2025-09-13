export type ReorderDirection = 'up' | 'down'

type Options = {
  reorder: (dir: ReorderDirection) => void
  startEditingSelection: () => void
  addChildForSelection: () => void
  moveSelectionBy: (delta: number) => void
  collapseOrFocusParent: () => void
  expandOrFocusFirstChild: () => void
  deleteBySelection: () => void
  duplicateBySelection: () => void
  setTabbingActive: (active: boolean) => void
  setLastTabWasWithShift: (withShift: boolean) => void
}

export function treeKeyboard(node: HTMLElement, options: Options) {
  function onKeyDown(e: KeyboardEvent) {
    // Alt+ArrowUp/Down: reorder within parent
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      options.reorder(e.key === 'ArrowUp' ? 'up' : 'down')
      return
    }

    // Enter or F2: start editing current selection
    if (!e.ctrlKey && (e.key === 'Enter' || e.key === 'F2')) {
      e.preventDefault()
      options.startEditingSelection()
      return
    }

    // Ctrl+Enter: add child (or sibling if leaf)
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault()
      options.addChildForSelection()
      return
    }

    // Arrow navigation and expand/collapse
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      options.moveSelectionBy(-1)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      options.moveSelectionBy(1)
      return
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      options.collapseOrFocusParent()
      return
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      options.expandOrFocusFirstChild()
      return
    }

    // Delete / Duplicate
    if (e.key === 'Delete') {
      e.preventDefault()
      options.deleteBySelection()
      return
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault()
      options.duplicateBySelection()
      return
    }

    // Track Tabing state to allow range selection on focus movement
    if (e.key === 'Tab') {
      options.setTabbingActive(true)
      options.setLastTabWasWithShift(!!e.shiftKey)
    } else {
      options.setTabbingActive(false)
      options.setLastTabWasWithShift(false)
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.key === 'Tab') {
      options.setTabbingActive(false)
      options.setLastTabWasWithShift(false)
    }
  }

  function onMouseDown() {
    options.setTabbingActive(false)
    options.setLastTabWasWithShift(false)
  }

  node.addEventListener('keydown', onKeyDown)
  node.addEventListener('keyup', onKeyUp)
  node.addEventListener('mousedown', onMouseDown)

  return {
    destroy() {
      node.removeEventListener('keydown', onKeyDown)
      node.removeEventListener('keyup', onKeyUp)
      node.removeEventListener('mousedown', onMouseDown)
    }
  }
}

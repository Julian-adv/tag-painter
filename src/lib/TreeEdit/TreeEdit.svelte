<script lang="ts">
  import TreeNode from './TreeNode.svelte'
  import TreeEditControlPanel from './TreeEditControlPanel.svelte'
  import TreeNodePath from './TreeNodePath.svelte'
  import TreeFilter from './TreeFilter.svelte'
  import { treeKeyboard } from './treeKeyboard'
  import { getNextSelectionId, findNearestVisibleAncestorId } from './nav'
  import type { TreeModel, LeafNode, ArrayNode, ObjectNode, AnyNode } from './model'
  import { fromYAML, toYAML } from './yaml-io'
  import {
    addChild,
    isContainer,
    uid,
    removeNode,
    moveChild,
    rebuildPathSymbols,
    normalizeArrayOrdering
  } from './model'
  import {
    groupSelectedNodes,
    expandAll,
    collapseAll,
    duplicateSubtreeNextToSource,
    togglePinForLeaf
  } from './operations'
  import { computeNextSelectionAfterDelete } from './selection'
  import { findBestMatchingLeafId } from '$lib/utils/treeSearch'
  import { tick } from 'svelte'
  import { CONSISTENT_RANDOM_MARKER } from '$lib/constants'
  import { isConsistentRandomArray } from './utils'
  import { addBySelectionAction, addSiblingBySelectionAction } from './addBySelection'
  import { m } from '$lib/paraglide/messages'

  let {
    initialYAML = '',
    hasUnsavedChanges = $bindable(false)
  }: { initialYAML?: string; hasUnsavedChanges?: boolean } = $props()

  let model: TreeModel = $state(fromYAML(initialYAML))
  let newlyAddedRootChildId: string | null = $state(null)
  let selectedIds: string[] = $state([])
  let lastSelectedId: string | null = $state(null) // For shift-click range selection
  let autoEditChildId: string | null = $state(null)
  let autoEditBehavior: 'selectAll' | 'caretEnd' = $state('selectAll')
  let treeContainer: HTMLDivElement | null = $state(null)
  // Track Tab navigation state to sync selection with keyboard focus only
  let tabbingActive: boolean = $state(false)
  // Track whether the last Tab press included Shift to enable range selection
  let lastTabWasWithShift: boolean = $state(false)
  // Rename callback state
  let renameCallbacks: Record<string, (newName: string) => void> = $state({})
  // Cached suggestions for "__" autocomplete: names of container nodes with children
  let parentNameSuggestions: string[] = $state([])
  // Filter state
  let filterText: string = $state('')
  // Track whether a filter was active previously to react when it is cleared
  let hadFilter: boolean = $state(false)

  function focusSelectedSoon() {
    tick().then(() => scrollSelectedIntoView())
  }

  function moveSelectionBy(delta: number) {
    const currentId = lastSelectedId || selectedIds[0] || null
    const nextId = getNextSelectionId(model, currentId, delta, filterText)
    if (!nextId) return
    selectedIds = [nextId]
    lastSelectedId = nextId
    focusSelectedSoon()
  }

  function collapseOrFocusParent() {
    if (selectedIds.length !== 1) return
    const sid = selectedIds[0]
    const n = model.nodes[sid]
    if (!n) return
    if (isContainer(n) && !n.collapsed) {
      n.collapsed = true
      return
    }
    const pid = n.parentId
    if (pid && pid !== model.rootId) {
      selectedIds = [pid]
      lastSelectedId = pid
      focusSelectedSoon()
    }
  }

  function expandOrFocusFirstChild() {
    if (selectedIds.length !== 1) return
    const sid = selectedIds[0]
    const n = model.nodes[sid]
    if (!n) return
    if (isContainer(n)) {
      if (n.collapsed) {
        n.collapsed = false
        return
      }
      const firstChild = n.children?.[0]
      if (firstChild) {
        selectedIds = [firstChild]
        lastSelectedId = firstChild
        focusSelectedSoon()
      }
    }
  }

  function startEditingSelection() {
    if (selectedIds.length !== 1) return
    const sid = selectedIds[0]
    autoEditChildId = sid
    autoEditBehavior = 'caretEnd'
  }

  function addSiblingAfterLeaf(leafId: string) {
    const node = model.nodes[leafId]
    if (!node || node.kind !== 'leaf') return
    const parentId = node.parentId
    if (!parentId) return
    const parent = model.nodes[parentId]
    if (!parent || !isContainer(parent)) return
    parent.collapsed = false
    const children = (parent as ObjectNode | ArrayNode).children
    const currentIndex = children.indexOf(leafId)
    const insertIndex = currentIndex >= 0 ? currentIndex + 1 : children.length
    const newId = uid()
    const newLeaf: LeafNode = {
      id: newId,
      name: parent.kind === 'array' ? String(children.length) : 'newKey',
      kind: 'leaf',
      parentId,
      value: ''
    }
    addChild(model, parentId, newLeaf)
    const appendedIndex = (parent as ObjectNode | ArrayNode).children.length - 1
    moveChild(
      model,
      parentId,
      appendedIndex,
      Math.min(insertIndex, (parent as ObjectNode | ArrayNode).children.length - 1)
    )
    normalizeArrayOrdering(model)
    rebuildPathSymbols(model)
    selectedIds = [newId]
    lastSelectedId = newId
    hasUnsavedChanges = true
    // Wait for DOM to update after filter clear, then trigger editing mode
    tick().then(() => {
      setAutoEditChildId(newId)
      scrollSelectedIntoView()
    })
  }

  function addChildForSelection() {
    // Clear filter when adding nodes via Ctrl+Enter to ensure new node is visible
    filterText = ''

    if (selectedIds.length !== 1) return
    const sid = selectedIds[0]
    const n = model.nodes[sid]
    if (!n) return
    if (n.kind === 'leaf') {
      addSiblingAfterLeaf(sid)
      return
    }

    // Array node: add a sibling instead of a child
    if (n.kind === 'array') {
      addSiblingBySelection()
      return
    }

    // Container: add a child (only for object nodes now)
    /* Removed array handling - now handled above */

    if (n.kind === 'object') {
      const arrId = uid()
      const arrayNode: ArrayNode = {
        id: arrId,
        name: 'new_parent',
        kind: 'array',
        parentId: n.id,
        children: [],
        collapsed: false
      }
      addChild(model, n.id, arrayNode)
      const firstChild: LeafNode = {
        id: uid(),
        name: '0',
        kind: 'leaf',
        parentId: arrId,
        value: ''
      }
      addChild(model, arrId, firstChild)
      selectedIds = [firstChild.id]
      lastSelectedId = firstChild.id
      hasUnsavedChanges = true
      // Wait for DOM to update after filter clear, then trigger editing mode
      tick().then(() => {
        setAutoEditChildId(firstChild.id)
        scrollSelectedIntoView()
      })
      return
    }
  }

  function recomputeParentNameSuggestionsFromValues(values: AnyNode[]) {
    const names = new Set<string>()
    // Container names
    for (const n of values) {
      if (isContainer(n) && n.children.length > 0) {
        names.add(n.name)
      }
    }
    // Full container paths from model.pathSymbols (e.g., parent/sub)
    for (const [path, id] of Object.entries(model.pathSymbols)) {
      const node = model.nodes[id]
      if (node && isContainer(node) && node.children.length > 0) {
        if (path) names.add(path)
      }
    }
    parentNameSuggestions = Array.from(names)
  }

  // Derive suggestions whenever model structure changes
  $effect(() => {
    const values = Object.values(model.nodes)
    recomputeParentNameSuggestionsFromValues(values)
  })

  // When a previously active filter is cleared, keep selection and scroll it into view
  $effect(() => {
    const nowHasFilter = !!filterText && filterText.trim().length > 0
    if (hadFilter && !nowHasFilter) {
      tick().then(() => scrollSelectedIntoView())
    }
    hadFilter = nowHasFilter
  })

  function loadYaml(text: string) {
    model = fromYAML(text)
  }

  // Loading is handled by parent dialog now

  // Expose helpers for parent dialog
  export function load(text: string) {
    initialYAML = text
    loadYaml(text)
    hasUnsavedChanges = false
  }

  export function getYaml() {
    // Compute YAML only when needed
    return toYAML(model)
  }

  export function markSaved() {
    hasUnsavedChanges = false
  }

  // hasUnsavedChanges is updated by child mutations and load/save helpers

  // Saving handled by parent

  function selectNode(id: string, shiftKey = false) {
    if (shiftKey && lastSelectedId && selectedIds.length > 0) {
      // Range selection: find nodes between lastSelectedId and id with same parent
      const lastNode = model.nodes[lastSelectedId]
      const currentNode = model.nodes[id]

      if (lastNode && currentNode && lastNode.parentId === currentNode.parentId) {
        const parentId = lastNode.parentId
        if (parentId) {
          const parent = model.nodes[parentId]
          if (parent && isContainer(parent)) {
            const children = (parent as ObjectNode | ArrayNode).children
            const lastIndex = children.indexOf(lastSelectedId)
            const currentIndex = children.indexOf(id)

            if (lastIndex !== -1 && currentIndex !== -1) {
              const start = Math.min(lastIndex, currentIndex)
              const end = Math.max(lastIndex, currentIndex)
              const rangeIds = children.slice(start, end + 1)

              // Add range to selection (union with existing selection)
              const newSelection = [...new Set([...selectedIds, ...rangeIds])]
              selectedIds = newSelection
              return
            }
          }
        }
      }
    }

    // Regular single selection
    selectedIds = [id]
    lastSelectedId = id
    // If the user explicitly selects a different node, stop auto-edit anchoring
    if (autoEditChildId && autoEditChildId !== id) {
      autoEditChildId = null
    }
    if (newlyAddedRootChildId && newlyAddedRootChildId !== id) {
      newlyAddedRootChildId = null
    }
  }

  // Allow descendants to request auto-editing of a specific child id
  function setAutoEditChildId(id: string | null, behavior: 'selectAll' | 'caretEnd' = 'caretEnd') {
    autoEditChildId = id
    autoEditBehavior = behavior
  }

  function handleTreeMutate(structural: boolean) {
    if (structural) {
      normalizeArrayOrdering(model)
      rebuildPathSymbols(model)
    }
    hasUnsavedChanges = true
  }

  function scrollSelectedIntoView() {
    if (!treeContainer) return
    const el = treeContainer.querySelector('.row.selected:first-of-type') as HTMLElement | null
    if (el) {
      el.scrollIntoView({ block: 'center', inline: 'nearest' })
      const active = typeof document !== 'undefined' ? document.activeElement : null
      const filterHasFocus =
        active instanceof HTMLElement && active.classList.contains('filter-input')
      if (!filterHasFocus) {
        // Move keyboard focus to the selected row so keyboard nav (Tab/Enter) applies to it
        el.focus()
      }
    }
  }

  // findNearestVisibleAncestorId moved to nav.ts

  function handleExpandAll() {
    expandAll(model)
    // Keep current selection centered if any
    tick().then(() => scrollSelectedIntoView())
  }

  function handleCollapseAll() {
    // Collapse containers
    collapseAll(model)
    // If current selection becomes hidden, select nearest visible ancestor
    if (selectedIds.length === 1) {
      const selId = selectedIds[0]
      const newId = findNearestVisibleAncestorId(model, selId)
      if (newId !== selId) {
        selectedIds = [newId]
        lastSelectedId = newId
      }
    }
    // Scroll to show the new selection (typically a top-level node)
    tick().then(() => scrollSelectedIntoView())
  }

  // Reorder current single selection within its parent
  function reorderSelection(direction: 'up' | 'down') {
    if (selectedIds.length !== 1) return
    const sid = selectedIds[0]
    const node = model.nodes[sid]
    const pid = node?.parentId || null
    if (!pid) return
    const parent = model.nodes[pid]
    if (!parent || !isContainer(parent)) return
    const children = (parent as ObjectNode | ArrayNode).children
    const idx = children.indexOf(sid)
    if (idx === -1) return
    const to = direction === 'up' ? idx - 1 : idx + 1
    if (to < 0 || to >= children.length) return
    moveChild(model, pid, idx, to)
    hasUnsavedChanges = true
    tick().then(() => scrollSelectedIntoView())
  }

  function handleCollapseSiblings() {
    if (selectedIds.length !== 1) return
    const selectedId = selectedIds[0]
    const selectedNode = model.nodes[selectedId]
    if (!selectedNode) return

    // Determine the container whose siblings we want to collapse
    let targetContainerId: string | null = null
    if (selectedNode.kind === 'array' || selectedNode.kind === 'object') {
      targetContainerId = selectedId
    } else if (selectedNode.kind === 'leaf') {
      targetContainerId = selectedNode.parentId ?? null
    }
    if (!targetContainerId) return

    // Find the parent of that container
    const targetContainer = model.nodes[targetContainerId]
    if (!targetContainer || (targetContainer.kind !== 'array' && targetContainer.kind !== 'object'))
      return
    const parentId = targetContainer.parentId
    if (!parentId) return
    const parentNode = model.nodes[parentId]
    if (!parentNode || (parentNode.kind !== 'array' && parentNode.kind !== 'object')) return
    if (!parentNode.children) return

    // Collapse all sibling container nodes (including the target container)
    for (const childId of parentNode.children) {
      const childNode = model.nodes[childId]
      if (childNode && (childNode.kind === 'array' || childNode.kind === 'object')) {
        childNode.collapsed = true
      }
    }

    // If a leaf was selected, move selection to its parent container for visibility
    if (selectedNode.kind === 'leaf') {
      selectedIds = [targetContainerId]
      lastSelectedId = targetContainerId
    }

    tick().then(() => scrollSelectedIntoView())
  }

  // Allow parent to programmatically select a node by name
  export function selectByName(name: string) {
    if (!name) return
    let targetId: string | null = null
    // Prefer exact pathSymbol match (supports paths like "aaa/bbb")
    const byPath = model.pathSymbols[name]
    if (byPath) {
      targetId = byPath
    } else {
      const sym = model.symbols[name]
      if (sym) {
        targetId = sym
      }
    }
    if (targetId) {
      // Expand ancestor containers so target is rendered
      let cur = model.nodes[targetId] || null
      while (cur && cur.parentId) {
        const parent = model.nodes[cur.parentId]
        if (parent && isContainer(parent)) parent.collapsed = false
        cur = parent || null
      }
      selectedIds = [targetId]
      lastSelectedId = targetId
      // Wait for DOM update then scroll to the selected row
      tick().then(() => scrollSelectedIntoView())
    }
  }

  // Select the most similar leaf under a given parent container name based on target text
  export function selectBestChildByValue(parentName: string, targetText: string): boolean {
    const bestId = findBestMatchingLeafId(model, parentName, targetText)
    if (!bestId) {
      selectByName(parentName)
      return false
    }

    // Expand ancestors to ensure visibility
    let cur = model.nodes[bestId]
    while (cur && cur.parentId) {
      const p = model.nodes[cur.parentId]
      if (!p) break
      if (p.kind === 'object' || p.kind === 'array') p.collapsed = false
      cur = p
    }

    selectedIds = [bestId]
    lastSelectedId = bestId
    tick().then(() => scrollSelectedIntoView())
    return true
  }

  function addBySelection() {
    const result = addBySelectionAction(model, selectedIds)
    if (!result.changed) return

    autoEditBehavior = result.autoEditBehavior
    if (result.autoEditChildId) setAutoEditChildId(result.autoEditChildId, result.autoEditBehavior)
    newlyAddedRootChildId = result.newlyAddedRootChildId

    if (result.selectedId) {
      selectedIds = [result.selectedId]
      lastSelectedId = result.selectedId
    }

    hasUnsavedChanges = true
    tick().then(() => scrollSelectedIntoView())
  }

  function addSiblingBySelection() {
    // Clear filter when adding sibling to ensure new node is visible
    filterText = ''

    const result = addSiblingBySelectionAction(model, selectedIds)
    if (!result.changed) return

    autoEditBehavior = result.autoEditBehavior

    if (result.selectedId) {
      selectedIds = [result.selectedId]
      lastSelectedId = result.selectedId
    }

    hasUnsavedChanges = true
    // Wait for DOM to update after filter clear, then trigger editing mode
    tick().then(() => {
      if (result.autoEditChildId) setAutoEditChildId(result.autoEditChildId, result.autoEditBehavior)
      scrollSelectedIntoView()
    })
  }

  function deleteBySelection() {
    if (selectedIds.length === 0 || selectedIds.includes(model.rootId)) return
    const validIds = selectedIds.filter((id) => id !== model.rootId)
    const uniqueNext = computeNextSelectionAfterDelete(model, validIds)

    // Perform deletion
    for (const id of validIds) removeNode(model, id)
    normalizeArrayOrdering(model)
    rebuildPathSymbols(model)

    if (uniqueNext.length > 0) {
      selectedIds = uniqueNext
      lastSelectedId = uniqueNext[0]
      tick().then(() => scrollSelectedIntoView())
    } else {
      selectedIds = []
      lastSelectedId = null
    }
    hasUnsavedChanges = true
  }

  function togglePinSelected() {
    if (selectedIds.length !== 1) return
    const selectedId = selectedIds[0]
    togglePinForLeaf(model, selectedId)
  }

  function getSelectedNode() {
    return selectedIds.length === 1 ? model.nodes[selectedIds[0]] : null
  }

  function setSelectedArrayMode(mode: 'random' | 'consistent-random') {
    const n = getSelectedNode()
    if (!n || n.kind !== 'array') return
    if (mode === 'consistent-random') {
      if (!isConsistentRandomArray(model, selectedIds[0])) {
        const markerId = uid()
        addChild(model, n.id, {
          id: markerId,
          name: String(n.children?.length ?? 0),
          kind: 'leaf',
          parentId: n.id,
          value: CONSISTENT_RANDOM_MARKER
        })
        const children = n.children
        const appendedIndex = children.length - 1
        const [moved] = children.splice(appendedIndex, 1)
        children.splice(0, 0, moved)
        normalizeArrayOrdering(model)
        rebuildPathSymbols(model)
        hasUnsavedChanges = true
      }
      return
    }
    // mode === 'random'
    if (isConsistentRandomArray(model, selectedIds[0])) {
      const firstId = n.children[0]
      removeNode(model, firstId)
      normalizeArrayOrdering(model)
      rebuildPathSymbols(model)
      hasUnsavedChanges = true
    }
  }

  function groupSelected() {
    const result = groupSelectedNodes(model, selectedIds)
    if (!result.success) {
      console.warn('Group operation failed:', result.error)
      return
    }

    normalizeArrayOrdering(model)
    rebuildPathSymbols(model)
    hasUnsavedChanges = true
    selectedIds = result.newGroupId ? [result.newGroupId] : []
    lastSelectedId = result.newGroupId || null
    // Trigger inline name editing for the new group
    if (result.newGroupId) setAutoEditChildId(result.newGroupId)
  }

  function setRenameCallback(nodeId: string | null, callback: ((newName: string) => void) | null) {
    if (nodeId && callback) {
      renameCallbacks[nodeId] = callback
    } else if (nodeId) {
      delete renameCallbacks[nodeId]
    }
  }

  function duplicateBySelection() {
    if (selectedIds.length !== 1) return
    const sourceId = selectedIds[0]
    const result = duplicateSubtreeNextToSource(model, sourceId)
    if (!result.success || !result.newRootId) return
    const newRootId = result.newRootId
    // Focus/edit the new node (caret at end, not select-all)
    autoEditBehavior = 'caretEnd'
    autoEditChildId = newRootId
    selectedIds = [newRootId]
    lastSelectedId = newRootId
    normalizeArrayOrdering(model)
    rebuildPathSymbols(model)
    hasUnsavedChanges = true
  }

  // Expose simple setters for tree keyboard action
  function setTabbingActiveState(v: boolean) {
    tabbingActive = v
  }
  function setLastTabWithShiftState(v: boolean) {
    lastTabWasWithShift = v
  }
</script>

<div class="tree-root">
  <div class="grid">
    <section>
      <!-- Filter input -->
      <TreeFilter bind:filterText />

      <!-- Path breadcrumb -->
      <TreeNodePath
        {model}
        {selectedIds}
        onSelectNode={selectNode}
        onScrollToSelected={scrollSelectedIntoView}
      />

      <div
        class="tree"
        role="button"
        aria-label={m['treeEdit.clearSelection']()}
        onclick={() => {
          selectedIds = []
          lastSelectedId = null
        }}
        tabindex="-1"
        bind:this={treeContainer}
        data-tree-root
        onkeydown={() => {
          /* keyboard handled by treeKeyboard action */
        }}
        onkeyup={() => {
          /* keyboard handled by treeKeyboard action */
        }}
        use:treeKeyboard={{
          reorder: reorderSelection,
          startEditingSelection,
          addChildForSelection,
          moveSelectionBy,
          collapseOrFocusParent,
          expandOrFocusFirstChild,
          deleteBySelection,
          duplicateBySelection,
          setTabbingActive: setTabbingActiveState,
          setLastTabWasWithShift: setLastTabWithShiftState
        }}
      >
        <TreeNode
          {model}
          id={model.rootId}
          isRootChild={true}
          autoEditChildId={autoEditChildId ?? newlyAddedRootChildId}
          {autoEditBehavior}
          onMutate={handleTreeMutate}
          {selectedIds}
          onSelect={selectNode}
          {setAutoEditChildId}
          onChipDoubleClick={selectByName}
          {tabbingActive}
          shiftTabActive={lastTabWasWithShift}
          {renameCallbacks}
          {parentNameSuggestions}
          {filterText}
        />
      </div>
    </section>
    <div class="col-divider" aria-hidden="true"></div>
    <TreeEditControlPanel
      {model}
      {selectedIds}
      onExpandAll={handleExpandAll}
      onCollapseAll={handleCollapseAll}
      collapseSiblings={handleCollapseSiblings}
      {setSelectedArrayMode}
      {togglePinSelected}
      {groupSelected}
      {duplicateBySelection}
      {addBySelection}
      {addSiblingBySelection}
      {deleteBySelection}
      onModelChanged={() => (hasUnsavedChanges = true)}
      {setAutoEditChildId}
      {setRenameCallback}
      {parentNameSuggestions}
    />
  </div>
</div>

<style>
  .tree-root {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0; /* allow internal scrolling */
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 60%) 1px 1fr; /* left | divider | right */
    gap: 0.25rem;
    flex: 1 1 auto; /* fill available space in root */
    min-height: 0; /* allow children to shrink within flex parent */
  }
  .col-divider {
    background-color: #e5e7eb; /* gray-300 */
    align-self: stretch; /* span full height of the grid row */
  }
  .grid > section {
    display: flex;
    flex-direction: column;
    min-height: 0; /* enable internal scrolling */
  }
  .tree {
    /* remove border; rely on column divider instead */
    padding: 0.5rem;
    border-radius: 0.5rem;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto; /* scroll only vertically inside left column */
    overflow-x: hidden;
    text-align: left; /* ensure inline-flex rows align left */
  }
</style>

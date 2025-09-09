<script lang="ts">
  import TreeNode from './TreeNode.svelte'
  import TreeEditControlPanel from './TreeEditControlPanel.svelte'
  import TreeNodePath from './TreeNodePath.svelte'
  import type { TreeModel, LeafNode, ArrayNode, ObjectNode, AnyNode } from './model'
  import { fromYAML, toYAML } from './yaml-io'
  import { addChild, isContainer, uid, removeNode, moveChild, rebuildPathSymbols } from './model'
  import { groupSelectedNodes, expandAll, collapseAll } from './operations'
  import { computeNextSelectionAfterDelete } from './selection'
  import { findBestMatchingLeafId } from '$lib/utils/treeSearch'
  import { tick } from 'svelte'
  import { CONSISTENT_RANDOM_MARKER } from '$lib/constants'
  import { isConsistentRandomArray, getNodePath } from './utils'
  import { addBySelectionAction } from './addBySelection'
  import { shouldNodeBeVisible } from './utils'
  import {
    testModeStore,
    setTestModeOverride,
    removeTestModeOverride
  } from '../stores/testModeStore.svelte'

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

  // Build a flat list of currently visible node ids in render order
  function flattenVisibleNodeIds(): string[] {
    const result: string[] = []
    function dfs(curId: string) {
      const n = model.nodes[curId]
      if (!n) return
      // Only traverse subtrees that are visible under current filter
      if (!shouldNodeBeVisible(model, curId, filterText)) return
      if (curId !== model.rootId) result.push(curId)
      if (isContainer(n) && !n.collapsed) {
        for (const cid of (n.children || [])) dfs(cid)
      }
    }
    dfs(model.rootId)
    return result
  }

  function focusSelectedSoon() {
    tick().then(() => scrollSelectedIntoView())
  }

  function moveSelectionBy(delta: number) {
    const visible = flattenVisibleNodeIds()
    if (visible.length === 0) return
    // Prefer lastSelectedId when available
    const currentId = lastSelectedId || selectedIds[0] || null
    if (!currentId) {
      selectedIds = [visible[0]]
      lastSelectedId = visible[0]
      focusSelectedSoon()
      return
    }
    let idx = visible.indexOf(currentId)
    if (idx === -1) {
      // Fallback: select nearest visible ancestor
      const newId = findNearestVisibleAncestorId(currentId)
      idx = Math.max(0, visible.indexOf(newId))
    }
    const next = Math.min(visible.length - 1, Math.max(0, idx + delta))
    if (visible[next]) {
      selectedIds = [visible[next]]
      lastSelectedId = visible[next]
      focusSelectedSoon()
    }
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
    autoEditBehavior = 'selectAll'
    focusSelectedSoon()
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
    setAutoEditChildId(newId)
    selectedIds = [newId]
    lastSelectedId = newId
    hasUnsavedChanges = true
    focusSelectedSoon()
  }

  function addChildForSelection() {
    if (selectedIds.length !== 1) return
    const sid = selectedIds[0]
    const n = model.nodes[sid]
    if (!n) return
    if (n.kind === 'leaf') {
      addSiblingAfterLeaf(sid)
      return
    }

    // Container: add a child
    if (n.kind === 'array') {
      const child: LeafNode = {
        id: uid(),
        name: String(n.children.length),
        kind: 'leaf',
        parentId: n.id,
        value: ''
      }
      addChild(model, n.id, child)
      setAutoEditChildId(child.id)
      selectedIds = [child.id]
      lastSelectedId = child.id
      hasUnsavedChanges = true
      focusSelectedSoon()
      return
    }

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
      setAutoEditChildId(firstChild.id)
      selectedIds = [firstChild.id]
      lastSelectedId = firstChild.id
      hasUnsavedChanges = true
      focusSelectedSoon()
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
  function setAutoEditChildId(id: string | null) {
    autoEditChildId = id
    // Default behavior: select all when entering edit programmatically
    autoEditBehavior = 'selectAll'
  }

  function scrollSelectedIntoView() {
    if (!treeContainer) return
    const el = treeContainer.querySelector('.row.selected:first-of-type') as HTMLElement | null
    if (el) {
      el.scrollIntoView({ block: 'center', inline: 'nearest' })
      // Move keyboard focus to the selected row so keyboard nav (Tab/Enter) applies to it
      el.focus()
    }
  }


  function findNearestVisibleAncestorId(id: string): string {
    const start = model.nodes[id]
    if (!start) return model.rootId
    let current = start
    while (current.parentId) {
      const parent = model.nodes[current.parentId]
      if (!parent) break
      // If parent is collapsed, current is hidden; move up to parent
      if (parent.collapsed) {
        current = parent
        continue
      }
      break
    }
    return current.id
  }

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
      const newId = findNearestVisibleAncestorId(selId)
      if (newId !== selId) {
        selectedIds = [newId]
        lastSelectedId = newId
      }
    }
    // Scroll to show the new selection (typically a top-level node)
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
    if (!targetContainer || (targetContainer.kind !== 'array' && targetContainer.kind !== 'object')) return
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
    if (result.autoEditChildId) setAutoEditChildId(result.autoEditChildId)
    newlyAddedRootChildId = result.newlyAddedRootChildId

    if (result.selectedId) {
      selectedIds = [result.selectedId]
      lastSelectedId = result.selectedId
    }

    hasUnsavedChanges = true
    tick().then(() => scrollSelectedIntoView())
  }

  function deleteBySelection() {
    if (selectedIds.length === 0 || selectedIds.includes(model.rootId)) return
    const validIds = selectedIds.filter((id) => id !== model.rootId)
    const uniqueNext = computeNextSelectionAfterDelete(model, validIds)

    // Perform deletion
    for (const id of validIds) removeNode(model, id)
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
    const n = model.nodes[selectedId]
    if (!n || n.kind !== 'leaf') return
    // Find nearest array ancestor to scope the pin to that array only
    let parentId = n.parentId
    let arrayAncestorId: string | null = null
    while (parentId) {
      const p = model.nodes[parentId]
      if (!p) break
      if (p.kind === 'array') {
        arrayAncestorId = p.id
        break
      }
      parentId = p.parentId || null
    }
    if (!arrayAncestorId) return
    // Build path key for the array ancestor
    const pinKey = getNodePath(model, arrayAncestorId)
    // Compute a group path (nearest object ancestor) to enforce exclusive pinning within that group
    let groupPath: string | null = null
    const arrayParentId = model.nodes[arrayAncestorId]?.parentId || null
    if (arrayParentId) {
      groupPath = getNodePath(model, arrayParentId)
    }
    const val = String(n.value ?? '')
    const store = testModeStore[pinKey]
    const selectedNodePath = getNodePath(model, selectedId)
    const isPinned = store && store.enabled && 
                     (store.pinnedLeafPath === selectedNodePath || store.overrideTag === val)
    
    if (isPinned) {
      removeTestModeOverride(pinKey)
    } else {
      // Remove existing pins within the same group (e.g., pose/action/*), except the one we are setting
      if (groupPath && groupPath.length > 0) {
        for (const k of Object.keys(testModeStore)) {
          if (k !== pinKey && (k === groupPath || k.startsWith(groupPath + '/'))) {
            removeTestModeOverride(k)
          }
        }
      }
      const selectedNodePath = getNodePath(model, selectedId)
      // Store only the pinnedLeafPath, not the overrideTag
      setTestModeOverride(pinKey, '', selectedNodePath)
    }
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
        hasUnsavedChanges = true
      }
      return
    }
    // mode === 'random'
    if (isConsistentRandomArray(model, selectedIds[0])) {
      const firstId = n.children[0]
      removeNode(model, firstId)
      hasUnsavedChanges = true
    }
  }

  function groupSelected() {
    const result = groupSelectedNodes(model, selectedIds)
    if (!result.success) {
      console.warn('Group operation failed:', result.error)
      return
    }

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
    if (sourceId === model.rootId) return
    const source = model.nodes[sourceId]
    if (!source) return

    const parentId = source.parentId
    if (!parentId) return
    const parent = model.nodes[parentId]
    if (!parent || !isContainer(parent)) return

    const siblings = parent.children
    const srcIndex = siblings.indexOf(sourceId)
    if (srcIndex === -1) return
    const insertIndex = srcIndex + 1

    // Helper: clone subtree under a given parent and return new root id
    function cloneUnderParent(srcId: string, tgtParentId: string, newName: string): string {
      const src = model.nodes[srcId]
      if (!src) return ''

      if (src.kind === 'leaf') {
        const newId = uid()
        const cloned = {
          id: newId,
          name: newName,
          kind: 'leaf' as const,
          parentId: tgtParentId,
          value: (src as LeafNode).value
        }
        addChild(model, tgtParentId, cloned)
        return newId
      }

      if (src.kind === 'ref') {
        const newId = uid()
        const cloned = {
          id: newId,
          name: src.name,
          kind: 'ref' as const,
          parentId: tgtParentId,
          refName: src.refName
        }
        addChild(model, tgtParentId, cloned)
        return newId
      }

      // containers
      const newId = uid()
      const container = {
        id: newId,
        name: newName,
        kind: src.kind,
        parentId: tgtParentId,
        children: [] as string[],
        collapsed: !!src.collapsed
      } as ObjectNode | ArrayNode
      addChild(model, tgtParentId, container)

      for (const childId of src.children) {
        const child = model.nodes[childId]
        if (!child) continue
        const childName = child.name
        cloneUnderParent(childId, newId, childName)
      }
      return newId
    }

    // Determine new name based on parent type
    const newName = parent.kind === 'array' ? String(siblings.length) : source.name
    const newRootId = cloneUnderParent(sourceId, parentId, newName)
    if (!newRootId) return

    // Move to appear just after the source
    const appendedIndex = siblings.length - 1
    let targetIndex = insertIndex
    if (appendedIndex < insertIndex) {
      // after appending, list grew by 1; if appending at end it may already be at/after target
      targetIndex = Math.min(insertIndex, siblings.length - 1)
    }
    moveChild(model, parentId, appendedIndex, targetIndex)

    // Focus/edit the new node (caret at end, not select-all)
    autoEditBehavior = 'caretEnd'
    autoEditChildId = newRootId
    selectedIds = [newRootId]
    lastSelectedId = newRootId
    rebuildPathSymbols(model)
    hasUnsavedChanges = true
  }

  function clearFilter() {
    filterText = ''
    // After clearing via the button, ensure current selection is visible
    tick().then(() => scrollSelectedIntoView())
  }
</script>

<div class="tree-root">
  <div class="grid">
    <section>
      <!-- Filter input -->
      <div class="filter-container">
        <input
          type="text"
          class="filter-input"
          placeholder="Filter nodes..."
          bind:value={filterText}
          onkeydown={(e) => e.stopPropagation()}
        />
        {#if filterText}
          <button
            type="button"
            class="filter-clear"
            onclick={clearFilter}
            aria-label="Clear filter"
          >
            ×
          </button>
        {/if}
      </div>

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
        aria-label="Clear selection"
        onclick={() => {
          selectedIds = []
          lastSelectedId = null
        }}
        tabindex="-1"
        bind:this={treeContainer}
        data-tree-root
        onkeydown={(e) => {
          // Tree-level keyboard handling (navigation and actions)
          if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            // Reorder within parent
            if (selectedIds.length === 1) {
              const sid = selectedIds[0]
              const node = model.nodes[sid]
              const pid = node?.parentId || null
              if (pid) {
                const parent = model.nodes[pid]
                if (parent && isContainer(parent)) {
                  const children = (parent as ObjectNode | ArrayNode).children
                  const idx = children.indexOf(sid)
                  if (idx !== -1) {
                    const to = e.key === 'ArrowUp' ? idx - 1 : idx + 1
                    if (to >= 0 && to < children.length) {
                      moveChild(model, pid, idx, to)
                      hasUnsavedChanges = true
                      // Keep selection and ensure visibility
                      tick().then(() => scrollSelectedIntoView())
                    }
                  }
                }
              }
            }
            e.preventDefault()
            return
          }

          if (!e.ctrlKey && (e.key === 'Enter' || e.key === 'F2')) {
            // Start editing current selection
            e.preventDefault()
            startEditingSelection()
            return
          }

          if (e.ctrlKey && e.key === 'Enter') {
            // Ctrl+Enter: add child (or sibling if leaf)
            e.preventDefault()
            addChildForSelection()
            return
          }

          if (e.key === 'ArrowUp') {
            e.preventDefault()
            moveSelectionBy(-1)
            return
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            moveSelectionBy(1)
            return
          }
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            collapseOrFocusParent()
            return
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault()
            expandOrFocusFirstChild()
            return
          }

          if (e.key === 'Delete') {
            // Delete selected node(s) via keyboard
            e.preventDefault()
            deleteBySelection()
          } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
            // Duplicate selected node via Ctrl+D / Cmd+D
            e.preventDefault()
            duplicateBySelection()
          }
          // Record Shift+Tab to enable range selection on focus movement
          if (e.key === 'Tab') {
            tabbingActive = true
            lastTabWasWithShift = !!e.shiftKey
          } else {
            tabbingActive = false
            lastTabWasWithShift = false
          }
        }}
        onkeyup={(e) => {
          if (e.key === 'Tab') {
            tabbingActive = false
            lastTabWasWithShift = false
          }
        }}
        onmousedown={() => {
          // Mouse interactions should not trigger focus-driven selection
          tabbingActive = false
          lastTabWasWithShift = false
        }}
      >
        <TreeNode
          {model}
          id={model.rootId}
          isRootChild={true}
          autoEditChildId={autoEditChildId ?? newlyAddedRootChildId}
          {autoEditBehavior}
          onMutate={(structural: boolean) => {
            if (structural) rebuildPathSymbols(model)
            hasUnsavedChanges = true
          }}
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
  .filter-container {
    position: relative;
    margin: 0.5rem 0.5rem 0 0.5rem;
  }
  .filter-input {
    width: 100%;
    padding: 0.5rem;
    padding-right: 2rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background-color: white;
    color: #374151;
  }
  .filter-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 1px #3b82f6;
  }
  .filter-clear {
    position: absolute;
    right: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: #6b7280;
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0;
    width: 1.5rem;
    height: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.25rem;
  }
  .filter-clear:hover {
    color: #374151;
    background-color: #f3f4f6;
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

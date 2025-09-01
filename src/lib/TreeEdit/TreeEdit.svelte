<script lang="ts">
  import TreeNode from './TreeNode.svelte'
  import TreeEditControlPanel from './TreeEditControlPanel.svelte'
  import type { TreeModel, LeafNode, ArrayNode, ObjectNode, AnyNode } from './model'
  import { fromYAML, toYAML } from './yaml-io'
  import { addChild, isContainer, uid, removeNode, convertLeafToArray, moveChild } from './model'
  import { groupSelectedNodes } from './operations'
  import { getTopLevelAncestorName } from './utils'
  import { tick } from 'svelte'
  import { CONSISTENT_RANDOM_MARKER } from '$lib/constants'
  import { isConsistentRandomArray } from './utils'
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
  let treeContainer: HTMLDivElement | null = $state(null)
  // Track Tab navigation state to sync selection with keyboard focus only
  let tabbingActive: boolean = $state(false)
  // Track whether the last Tab press included Shift to enable range selection
  let lastTabWasWithShift: boolean = $state(false)
  // Rename callback state
  let renameCallbacks: Record<string, (newName: string) => void> = $state({})
  // Cached suggestions for "__" autocomplete: names of container nodes with children
  let parentNameSuggestions: string[] = $state([])

  function recomputeParentNameSuggestionsFromValues(values: AnyNode[]) {
    const names = new Set<string>()
    for (const n of values) {
      if (isContainer(n) && n.children.length > 0) {
        names.add(n.name)
      }
    }
    parentNameSuggestions = Array.from(names)
  }

  // Derive suggestions whenever model structure changes
  $effect(() => {
    const values = Object.values(model.nodes)
    recomputeParentNameSuggestionsFromValues(values)
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
  }

  // Allow descendants to request auto-editing of a specific child id
  function setAutoEditChildId(id: string | null) {
    autoEditChildId = id
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

  // Allow parent to programmatically select a node by name
  export function selectByName(name: string) {
    if (!name) return
    let targetId: string | null = null
    const sym = model.symbols[name]
    if (sym) {
      targetId = sym
    } else {
      for (const n of Object.values(model.nodes)) {
        if (n.name === name) {
          targetId = n.id
          break
        }
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

  function addBySelection() {
    // Special case: no selection -> add an Array node at root with one empty item
    if (selectedIds.length === 0) {
      const rootId = model.rootId
      const root = model.nodes[rootId]
      if (!root || !isContainer(root)) return

      const arrayNode: ArrayNode = {
        id: uid(),
        name: 'newKey',
        kind: 'array',
        parentId: rootId,
        children: [],
        collapsed: false
      }
      addChild(model, rootId, arrayNode)

      const firstItem: LeafNode = {
        id: uid(),
        name: '0',
        kind: 'leaf',
        parentId: arrayNode.id,
        value: ''
      }
      addChild(model, arrayNode.id, firstItem)

      // Auto-edit the new array node's name
      newlyAddedRootChildId = arrayNode.id
      selectedIds = [arrayNode.id]
      lastSelectedId = arrayNode.id
      hasUnsavedChanges = true
      return
    }

    const targetId = selectedIds.length === 1 ? selectedIds[0] : null
    if (!targetId) return
    const parent = model.nodes[targetId]
    if (!parent) return
    // Disallow adding under ref nodes
    if (parent.kind === 'ref') return

    // If leaf, convert to array and then add an empty child at the end
    if (parent.kind === 'leaf') {
      const firstChildId = convertLeafToArray(model, targetId)
      if (!firstChildId) return
    }

    const freshParent = model.nodes[targetId]
    if (!freshParent || !isContainer(freshParent)) return

    // Determine child name depending on container type
    let childName = 'newKey'
    if (freshParent.kind === 'array') {
      const nextIndex = String(freshParent.children?.length ?? 0)
      childName = nextIndex
    }

    const child: LeafNode = {
      id: uid(),
      name: childName,
      kind: 'leaf',
      parentId: targetId,
      value: ''
    }
    addChild(model, targetId, child)
    newlyAddedRootChildId = child.id
    selectedIds = [child.id]
    lastSelectedId = child.id
    hasUnsavedChanges = true
  }

  function deleteBySelection() {
    if (selectedIds.length === 0 || selectedIds.includes(model.rootId)) return
    // Delete all selected nodes (filter out root if somehow included)
    const validIds = selectedIds.filter((id) => id !== model.rootId)
    for (const id of validIds) {
      removeNode(model, id)
    }
    selectedIds = []
    lastSelectedId = null
    hasUnsavedChanges = true
  }

  function togglePinSelected() {
    if (selectedIds.length !== 1) return
    const selectedId = selectedIds[0]
    const n = model.nodes[selectedId]
    if (!n || n.kind !== 'leaf') return
    const parentName = getTopLevelAncestorName(model, selectedId)
    if (!parentName) return
    const val = String(n.value ?? '')
    if (testModeStore[parentName]?.pinnedLeafId === selectedId) {
      removeTestModeOverride(parentName)
    } else {
      setTestModeOverride(parentName, val, selectedId)
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

    hasUnsavedChanges = true
    selectedIds = result.newGroupId ? [result.newGroupId] : []
    lastSelectedId = result.newGroupId || null
    // Trigger inline name editing for the new group
    if (result.newGroupId) {
      autoEditChildId = result.newGroupId
    }
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

    // Focus/edit the new node
    autoEditChildId = newRootId
    selectedIds = [newRootId]
    lastSelectedId = newRootId
    hasUnsavedChanges = true
  }
</script>

<div class="tree-root">
  <div class="grid">
    <section>
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
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            selectedIds = []
            lastSelectedId = null
          } else if (e.key === 'Delete') {
            // Delete selected node(s) via keyboard
            e.preventDefault()
            deleteBySelection()
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
          onMutate={() => (hasUnsavedChanges = true)}
          {selectedIds}
          onSelect={selectNode}
          {setAutoEditChildId}
          onChipDoubleClick={selectByName}
          {tabbingActive}
          shiftTabActive={lastTabWasWithShift}
          {renameCallbacks}
          {parentNameSuggestions}
        />
      </div>
    </section>
    <div class="col-divider" aria-hidden="true"></div>
    <TreeEditControlPanel
      {model}
      {selectedIds}
      {setSelectedArrayMode}
      {togglePinSelected}
      {groupSelected}
      {duplicateBySelection}
      {addBySelection}
      {deleteBySelection}
      onModelChanged={() => (hasUnsavedChanges = true)}
      {setAutoEditChildId}
      {setRenameCallback}
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

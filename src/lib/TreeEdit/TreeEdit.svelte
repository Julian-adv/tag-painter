<script lang="ts">
  import TreeNode from './TreeNode.svelte'
  import type { TreeModel, LeafNode, ArrayNode, ObjectNode } from './model'
  import { fromYAML, toYAML } from './yaml-io'
  import ActionButton from '../ActionButton.svelte'
  import { Plus, Trash, ChevronDown, ChevronRight, LockClosed } from 'svelte-heros-v2'
  import { addChild, isContainer, uid, removeNode, convertLeafToArray } from './model'
  import { groupSelectedNodes, canGroupSelected } from './operations'
  import { getParentOf } from './utils'
  import { tick } from 'svelte'
  import { CONSISTENT_RANDOM_MARKER } from '$lib/constants'
  import { isConsistentRandomArray, isLeafPinned } from './utils'
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

  function canPinSelected(): boolean {
    if (selectedIds.length !== 1) return false
    const selectedId = selectedIds[0]
    const n = model.nodes[selectedId]
    if (!n || n.kind !== 'leaf') return false
    const pid = getParentOf(model, selectedId)
    if (!pid) return false
    const p = model.nodes[pid]
    return !!p && p.kind === 'array'
  }

  function togglePinSelected() {
    if (selectedIds.length !== 1) return
    const selectedId = selectedIds[0]
    const n = model.nodes[selectedId]
    if (!n || n.kind !== 'leaf') return
    const pid = getParentOf(model, selectedId)
    if (!pid) return
    const p = model.nodes[pid]
    if (!p || p.kind !== 'array') return
    const parentName = p.name
    const val = String(n.value ?? '')
    if (testModeStore[parentName]?.overrideTag === val) {
      removeTestModeOverride(parentName)
    } else {
      setTestModeOverride(parentName, val)
    }
  }

  function expandAll() {
    for (const node of Object.values(model.nodes)) {
      if (node && isContainer(node)) node.collapsed = false
    }
  }

  function collapseAll() {
    for (const node of Object.values(model.nodes)) {
      if (node && isContainer(node) && node.id !== model.rootId) node.collapsed = true
    }
  }

  function getSelectedNode() {
    return selectedIds.length === 1 ? model.nodes[selectedIds[0]] : null
  }

  function isSelectedArrayNode(): boolean {
    const n = getSelectedNode()
    return !!n && n.kind === 'array'
  }

  function isSelectedConsistentRandom(): boolean {
    if (selectedIds.length !== 1) return false
    return isConsistentRandomArray(model, selectedIds[0])
  }

  function setSelectedArrayMode(mode: 'random' | 'consistent-random') {
    const n = getSelectedNode()
    if (!n || n.kind !== 'array') return
    if (mode === 'consistent-random') {
      if (!isSelectedConsistentRandom()) {
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
    if (isSelectedConsistentRandom()) {
      const firstId = n.children[0]
      removeNode(model, firstId)
      hasUnsavedChanges = true
    }
  }

  function isAddDisabled(): boolean {
    if (selectedIds.length === 0) return false
    if (selectedIds.length > 1) return true // Disable add for multiple selection
    const selectedId = selectedIds[0]
    const sel = model.nodes[selectedId]
    if (!sel) return false
    if (sel.kind === 'ref') return true
    const pid = getParentOf(model, selectedId)
    if (!pid) return false
    const p = model.nodes[pid]
    return !!p && p.kind === 'array'
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
        />
      </div>
    </section>
    <div class="col-divider" aria-hidden="true"></div>
    <section class="right-col">
      <div class="array-mode" aria-label="Array selection mode">
        <fieldset class:disabled={!isSelectedArrayNode()} disabled={!isSelectedArrayNode()}>
          <legend class="section-label">Node type</legend>
          <label class="mode-option">
            <input
              type="radio"
              name="arrayMode"
              value="random"
              checked={isSelectedArrayNode() && !isSelectedConsistentRandom()}
              onchange={() => setSelectedArrayMode('random')}
            />
            <span>Random</span>
          </label>
          <label class="mode-option">
            <input
              type="radio"
              name="arrayMode"
              value="consistent-random"
              checked={isSelectedConsistentRandom()}
              onchange={() => setSelectedArrayMode('consistent-random')}
            />
            <span>Consistent Random</span>
          </label>
        </fieldset>
      </div>

      <div class="btns">
        <ActionButton
          onclick={togglePinSelected}
          variant="gray"
          size="md"
          icon={LockClosed}
          title={selectedIds.length === 1
            ? isLeafPinned(model, selectedIds[0])
              ? 'Unpin this option'
              : 'Pin this option'
            : 'Pin this option'}
          disabled={!canPinSelected()}
        >
          {selectedIds.length === 1
            ? isLeafPinned(model, selectedIds[0])
              ? 'Unpin'
              : 'Pin'
            : 'Pin'}
        </ActionButton>
        <ActionButton
          onclick={expandAll}
          variant="gray"
          size="md"
          icon={ChevronDown}
          title="Expand all nodes"
        >
          Expand all
        </ActionButton>
        <ActionButton
          onclick={collapseAll}
          variant="gray"
          size="md"
          icon={ChevronRight}
          title="Collapse all nodes"
        >
          Collapse all
        </ActionButton>
        <ActionButton
          onclick={groupSelected}
          variant="blue"
          size="md"
          title="Group selected leaves"
          disabled={!canGroupSelected(model, selectedIds)}
        >
          Group
        </ActionButton>
        <ActionButton
          onclick={addBySelection}
          variant="green"
          size="md"
          icon={Plus}
          title={selectedIds.length === 1 ? 'Add child to selected' : 'Add top-level node'}
          disabled={isAddDisabled()}
        >
          {selectedIds.length === 1 ? 'Add child' : 'Add top level'}
        </ActionButton>
        <ActionButton
          onclick={deleteBySelection}
          variant="red"
          size="md"
          icon={Trash}
          title="Delete selected node"
          disabled={selectedIds.length === 0 || selectedIds.includes(model.rootId)}
        >
          Delete
        </ActionButton>
      </div>
    </section>
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
  .btns {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0.25rem 0;
    padding: 0.5rem;
  }
  .right-col {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem;
    align-items: flex-start; /* left-align controls */
  }
  .array-mode fieldset {
    display: inline-flex;
    justify-content: flex-start;
    gap: 0.75rem;
    align-items: center;
    padding: 0.25rem 0;
  }
  .array-mode fieldset.disabled {
    opacity: 0.5;
  }
  .mode-option {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.875rem;
    color: #374151;
  }
  .section-label {
    font-size: 0.875rem; /* same or larger than radio labels */
    color: #6b7280;
    font-weight: 400; /* not bold */
    text-align: left;
    margin-bottom: 0.25rem;
  }
</style>

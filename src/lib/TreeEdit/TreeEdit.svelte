<script lang="ts">
  import TreeNode from './TreeNode.svelte'
  import type { TreeModel, LeafNode, ArrayNode } from './model'
  import { fromYAML, toYAML } from './yaml-io'
  import ActionButton from '../ActionButton.svelte'
  import { Plus, Trash } from 'svelte-heros-v2'
  import { addChild, isContainer, uid, removeNode, convertLeafToArray } from './model'
  import { tick } from 'svelte'
  import { CONSISTENT_RANDOM_MARKER } from '$lib/constants'
  import { isConsistentRandomArray } from './utils'

  let {
    initialYAML = '',
    hasUnsavedChanges = $bindable(false)
  }: { initialYAML?: string; hasUnsavedChanges?: boolean } = $props()

  let model: TreeModel = $state(fromYAML(initialYAML))
  let newlyAddedRootChildId: string | null = $state(null)
  let selectedId: string | null = $state(null)
  let autoEditChildId: string | null = $state(null)
  let treeContainer: HTMLDivElement | null = $state(null)

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

  function selectNode(id: string) {
    selectedId = id
  }

  // Allow descendants to request auto-editing of a specific child id
  function setAutoEditChildId(id: string | null) {
    autoEditChildId = id
  }

  function scrollSelectedIntoView() {
    if (!treeContainer) return
    const el = treeContainer.querySelector('.row.selected') as HTMLElement | null
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
      selectedId = targetId
      // Wait for DOM update then scroll to the selected row
      tick().then(() => scrollSelectedIntoView())
    }
  }

  function addBySelection() {
    // Special case: no selection -> add an Array node at root with one empty item
    if (!selectedId) {
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
      selectedId = arrayNode.id
      hasUnsavedChanges = true
      return
    }

    const targetId = selectedId
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
    selectedId = child.id
    hasUnsavedChanges = true
  }

  function deleteBySelection() {
    if (!selectedId || selectedId === model.rootId) return
    removeNode(model, selectedId)
    selectedId = null
    hasUnsavedChanges = true
  }

  function getSelectedNode() {
    return selectedId ? model.nodes[selectedId] : null
  }

  function isSelectedArrayNode(): boolean {
    const n = getSelectedNode()
    return !!n && n.kind === 'array'
  }

  function isSelectedConsistentRandom(): boolean {
    if (!selectedId) return false
    return isConsistentRandomArray(model, selectedId)
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

  function getParentOf(nodeId: string): string | null {
    return model.nodes[nodeId]?.parentId ?? null
  }

  function isAddDisabled(): boolean {
    if (!selectedId) return false
    const sel = model.nodes[selectedId]
    if (!sel) return false
    if (sel.kind === 'ref') return true
    const pid = getParentOf(selectedId)
    if (!pid) return false
    const p = model.nodes[pid]
    return !!p && p.kind === 'array'
  }
</script>

<div class="tree-root">
  <div class="grid">
    <section>
      <div
        class="tree"
        role="button"
        aria-label="Clear selection"
        onclick={() => (selectedId = null)}
        tabindex="-1"
        bind:this={treeContainer}
        data-tree-root
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            selectedId = null
          }
        }}
      >
        <TreeNode
          {model}
          id={model.rootId}
          isRootChild={true}
          autoEditChildId={autoEditChildId ?? newlyAddedRootChildId}
          onMutate={() => (hasUnsavedChanges = true)}
          {selectedId}
          onSelect={selectNode}
          {setAutoEditChildId}
        />
      </div>
    </section>
    <div class="col-divider" aria-hidden="true"></div>
    <section class="right-col">
      <div class="array-mode" aria-label="Array selection mode">
        <fieldset class:disabled={!isSelectedArrayNode()} disabled={!isSelectedArrayNode()}>
          <legend class="sr-only">Array mode</legend>
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
          onclick={addBySelection}
          variant="green"
          size="md"
          icon={Plus}
          title={selectedId ? 'Add child to selected' : 'Add top-level node'}
          disabled={isAddDisabled()}
        >
          {selectedId ? 'Add child' : 'Add top level'}
        </ActionButton>
        <ActionButton
          onclick={deleteBySelection}
          variant="red"
          size="md"
          icon={Trash}
          title="Delete selected node"
          disabled={!selectedId || selectedId === model.rootId}
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
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
</style>

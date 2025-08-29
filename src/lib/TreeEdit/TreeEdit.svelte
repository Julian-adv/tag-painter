<script lang="ts">
  import TreeNode from './TreeNode.svelte'
  import type { TreeModel, LeafNode } from './model'
  import { fromYAML, toYAML } from './yaml-io'
  import ActionButton from '../ActionButton.svelte'
  import { Plus, Trash } from 'svelte-heros-v2'
  import { addChild, isContainer, uid, removeNode, convertLeafToArray } from './model'

  let {
    initialYAML = '',
    hasUnsavedChanges = $bindable(false)
  }: { initialYAML?: string; hasUnsavedChanges?: boolean } = $props()

  let model: TreeModel = $state(fromYAML(initialYAML))
  let newlyAddedRootChildId: string | null = $state(null)
  let selectedId: string | null = $state(null)

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
      selectedId = targetId
    }
  }

  function addBySelection() {
    const targetId = selectedId ?? model.rootId
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
          autoEditChildId={newlyAddedRootChildId}
          onMutate={() => (hasUnsavedChanges = true)}
          {selectedId}
          onSelect={selectNode}
        />
      </div>
    </section>
    <div class="col-divider" aria-hidden="true"></div>
  </div>

  <div class="btns">
    <ActionButton
      onclick={addBySelection}
      variant="green"
      size="md"
      icon={Plus}
      title={selectedId ? 'Add child to selected' : 'Add top-level node'}
      disabled={isAddDisabled()}
    />
    <ActionButton
      onclick={deleteBySelection}
      variant="red"
      size="md"
      icon={Trash}
      title="Delete selected node"
      disabled={!selectedId || selectedId === model.rootId}
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
  .btns {
    display: flex;
    gap: 0.5rem;
    margin: 0.25rem 0;
  }
</style>

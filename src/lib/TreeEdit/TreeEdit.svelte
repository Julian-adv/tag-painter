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

  // Current file name for display
  const fileName = 'wildcards.yaml'

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
      value: ''
    }
    addChild(model, targetId, child)
    newlyAddedRootChildId = child.id
    hasUnsavedChanges = true
  }

  function deleteBySelection() {
    if (!selectedId || selectedId === model.rootId) return
    removeNode(model, selectedId)
    selectedId = null
    hasUnsavedChanges = true
  }
</script>

<div class="grid">
  <section>
    <h3>{fileName}</h3>
    <div class="tree">
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
</div>

<div class="btns">
  <ActionButton
    onclick={addBySelection}
    variant="green"
    size="md"
    icon={Plus}
    title={selectedId ? 'Add child to selected' : 'Add top-level node'}
    disabled={!!selectedId && model.nodes[selectedId]?.kind === 'ref'}
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

<style>
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  .tree {
    border: 1px solid #ddd;
    padding: 0.5rem;
    border-radius: 0.5rem;
    max-height: 70vh;
    overflow: auto;
  }
  h3 {
    margin: 0.25rem 0 0.5rem;
    text-align: left;
  }
  .btns {
    display: flex;
    gap: 0.5rem;
    margin: 0.25rem 0;
  }
</style>

<script lang="ts">
  import TreeNode from './TreeNode.svelte'
  import type { TreeModel, LeafNode } from './model'
  import { fromYAML, toYAML } from './yaml-io'
  import ActionButton from '../ActionButton.svelte'
  import { Plus } from 'svelte-heros-v2'
  import { addChild, isContainer, uid } from './model'

  let {
    initialYAML = '',
    hasUnsavedChanges = $bindable(false)
  }: { initialYAML?: string; hasUnsavedChanges?: boolean } = $props()

  // Current file name for display
  const fileName = 'wildcards.yaml'

  let model: TreeModel = $state(fromYAML(initialYAML))
  let newlyAddedRootChildId: string | null = $state(null)

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

  function addRootChild() {
    const root = model.nodes[model.rootId]
    if (!root || !isContainer(root)) return
    const child: LeafNode = {
      id: uid(),
      name: 'newKey',
      kind: 'leaf',
      value: ''
    }
    addChild(model, model.rootId, child)
    newlyAddedRootChildId = child.id
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
      />
    </div>
  </section>
</div>

<div class="btns">
  <ActionButton
    onclick={addRootChild}
    variant="green"
    size="md"
    icon={Plus}
    title="Add top-level node"
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

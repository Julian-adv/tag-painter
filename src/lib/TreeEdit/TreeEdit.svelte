<script lang="ts">
  import TreeNode from './TreeNode.svelte'
  import type { TreeModel, LeafNode } from './model'
  import { fromYAML, toYAML } from './yaml-io'
  import ActionButton from '../ActionButton.svelte'
  import { Plus } from 'svelte-heros-v2'
  import { addChild, isContainer, uid } from './model'
  import { onMount } from 'svelte'

  let {
    initialYAML = 'a: 1\nlist:\n - x\n - y\nobj:\n k: v\n ref: { $ref: obj }\n'
  }: { initialYAML?: string } = $props()

  // Current file name for display
  const fileName = 'wildcards.yaml'

  let model: TreeModel = $state(fromYAML(initialYAML))
  let yamlOut = $derived(toYAML(model))
  let newlyAddedRootChildId: string | null = $state(null)

  function loadYaml(text: string) {
    model = fromYAML(text)
  }

  onMount(() => {
    // Load YAML from server file on mount
    fetch('/api/wildcards')
      .then((res) => (res.ok ? res.text() : ''))
      .then((text) => {
        if (typeof text === 'string' && text.length > 0) {
          initialYAML = text
          loadYaml(text)
        }
      })
      .catch((err) => console.error('Failed to load wildcards.yaml:', err))
  })

  function exportYaml() {
    // Save the current YAML to server-side file
    fetch('/api/wildcards', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: yamlOut
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to save')
      })
      .catch((err) => {
        console.error('Save failed:', err)
      })
  }

  // Expose save so parent dialog can trigger it
  export function save() {
    exportYaml()
  }

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

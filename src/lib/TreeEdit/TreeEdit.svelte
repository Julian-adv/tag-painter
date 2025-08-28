<script lang="ts">
  import TreeNode from './TreeNode.svelte'
  import type { TreeModel } from './model'
  import { fromYAML, toYAML } from './yaml-io'
  import { onMount } from 'svelte'

  let {
    initialYAML = 'a: 1\nlist:\n - x\n - y\nobj:\n k: v\n ref: { $ref: obj }\n'
  }: { initialYAML?: string } = $props()

  let model: TreeModel = $state(fromYAML(initialYAML))
  let yamlOut = $derived(toYAML(model))

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
</script>

<div class="grid">
  <section>
    <h3>Tree</h3>
    <div class="tree">
      <TreeNode {model} id={model.rootId} isRootChild={true} />
    </div>
  </section>

  <section>
    <h3>YAML 입/출력</h3>
    <textarea bind:value={initialYAML} rows={12}></textarea>
    <div class="btns">
      <button
        onclick={exportYaml}
        class="rounded-md bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:outline-none"
      >
        Save
      </button>
    </div>
    <textarea readonly rows={12} value={yamlOut}></textarea>
  </section>
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  textarea {
    width: 100%;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
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
  }
  .btns {
    display: flex;
    gap: 0.5rem;
    margin: 0.25rem 0;
  }
</style>

<script lang="ts">
  import TreeNode from './TreeNode.svelte'
  import type { TreeModel } from './model'
  import { fromYAML, toYAML } from './yaml-io'

  let { initialYAML = 'a: 1\nlist:\n - x\n - y\nobj:\n k: v\n ref: { $ref: obj }\n' }: { initialYAML?: string } = $props()

  let model: TreeModel = $state(fromYAML(initialYAML))
  let yamlOut = $derived(toYAML(model))

  function loadYaml(text: string) {
    model = fromYAML(text)
  }
  function exportYaml() {
    // yamlOut is now automatically updated via $derived
    // This function could be removed, but keeping for explicit export action
  }
</script>

<div class="grid">
  <section>
    <h3>Tree</h3>
    <div class="tree">
      <TreeNode {model} id={model.rootId} />
    </div>
  </section>

  <section>
    <h3>YAML 입/출력</h3>
    <textarea bind:value={initialYAML} rows={12}></textarea>
    <div class="btns">
      <button onclick={() => loadYaml(initialYAML)}>YAML 불러오기</button>
      <button onclick={exportYaml}>YAML 내보내기</button>
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

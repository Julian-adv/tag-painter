<script lang="ts">
  import {
    isContainer,
    setLeafValue,
    toggle,
    renameNode,
    addChild,
    removeNode,
    upsertRef
  } from './model'
  import type { ArrayNode, LeafNode, ObjectNode, RefNode, TreeModel } from './model'
  import TreeNode from './TreeNode.svelte'

  let { model, id }: { model: TreeModel; id: string } = $props()

  const get = (id: string) => model.nodes[id]

  function onToggle() {
    toggle(model, id)
  }
  function onDelete() {
    removeNode(model, id)
  }
  function addLeaf() {
    const parent = get(id)
    if (!parent || !isContainer(parent)) return
    const child: LeafNode = {
      id: crypto.randomUUID(),
      name: 'newKey',
      kind: 'leaf',
      value: ''
    } as LeafNode
    addChild(model, id, child)
  }
  function addObject() {
    const child: ObjectNode = {
      id: crypto.randomUUID(),
      name: 'obj',
      kind: 'object',
      children: [],
      collapsed: false
    }
    addChild(model, id, child)
  }
  function addArray() {
    const child: ArrayNode = {
      id: crypto.randomUUID(),
      name: 'list',
      kind: 'array',
      children: [],
      collapsed: false
    }
    addChild(model, id, child)
  }
  function addRef() {
    const name = prompt('참조할 이름 ($ref):')
    if (name) upsertRef(model, id, name)
  }
</script>

{#if get(id)}
  {@const n = get(id)}
  <div class="node">
    <div class="row">
      <button class="toggle" onclick={onToggle}>{n.collapsed ? '▶' : '▼'}</button>
      <input
        class="name"
        value={n.name}
        onchange={(e) => renameNode(model, id, (e.target as HTMLInputElement).value)}
      />

      {#if n.kind === 'leaf'}
        <span class="sep">:</span>
        <input
          class="value"
          value={(n as LeafNode).value ?? ''}
          onchange={(e) => setLeafValue(model, id, (e.target as HTMLInputElement).value)}
        />
      {:else if n.kind === 'ref'}
        <span class="ref">$ref → {(n as RefNode).refName}</span>
      {:else}
        <div class="actions">
          <button
            title="leaf 추가"
            onclick={(e) => {
              e.stopPropagation()
              addLeaf()
            }}>＋leaf</button
          >
          <button
            title="object 추가"
            onclick={(e) => {
              e.stopPropagation()
              addObject()
            }}>＋obj</button
          >
          <button
            title="array 추가"
            onclick={(e) => {
              e.stopPropagation()
              addArray()
            }}>＋arr</button
          >
          <button
            title="ref 추가"
            onclick={(e) => {
              e.stopPropagation()
              addRef()
            }}>＋ref</button
          >
        </div>
      {/if}

      {#if id !== model.rootId}
        <button class="del" onclick={onDelete}>🗑</button>
      {/if}
    </div>

    {#if isContainer(n) && !n.collapsed}
      <div class="children">
        {#each (n as ObjectNode | ArrayNode).children as cid (cid)}
          <TreeNode {model} id={cid} />
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .node {
    padding-left: 0.5rem;
    border-left: 1px dashed var(--muted, #ccc);
    margin: 0.25rem 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .toggle {
    width: 1.5rem;
  }
  .name {
    width: 10rem;
  }
  .value {
    width: 12rem;
  }
  .actions button {
    font-size: 0.8rem;
  }
  .ref {
    font-style: italic;
    opacity: 0.8;
  }
  .del {
    margin-left: auto;
  }
  .children {
    margin-left: 1.25rem;
  }
</style>

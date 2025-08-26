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
  import { ChevronDown, ChevronRight } from 'svelte-heros-v2'

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
      <div class="node-header">
        <button class="toggle" onclick={onToggle}>
          {#if n.collapsed}
            <ChevronRight class="w-4 h-4" />
          {:else}
            <ChevronDown class="w-4 h-4" />
          {/if}
        </button>
        <input
          class="name"
          value={n.name}
          onchange={(e) => renameNode(model, id, (e.target as HTMLInputElement).value)}
        />
      </div>

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
  .node-header {
    display: flex;
    align-items: center;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    background-color: #f9fafb;
    overflow: hidden;
  }
  .toggle {
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    cursor: pointer;
    color: #6b7280;
    border-radius: 0;
  }
  .toggle:hover {
    color: #374151;
    background-color: #e5e7eb;
  }
  .name {
    width: 10rem;
    border: none;
    background: transparent;
    outline: none;
    padding: 0.5rem;
    font-size: 0.875rem;
  }
  .name:focus {
    background-color: #ffffff;
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

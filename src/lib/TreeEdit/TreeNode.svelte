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
  import type { ArrayNode, LeafNode, NodeKind, ObjectNode, RefNode, TreeModel } from './model'
  import TreeNode from './TreeNode.svelte'
  import ActionButton from '../ActionButton.svelte'
  import InlineEditor from './InlineEditor.svelte'
  import { ChevronDown, ChevronRight, Trash, Plus } from 'svelte-heros-v2'

  let { model, id, parentKind }: { model: TreeModel; id: string; parentKind?: NodeKind } = $props()

  const get = (id: string) => model.nodes[id]

  function onToggle() {
    toggle(model, id)
  }

  function onDelete() {
    removeNode(model, id)
  }

  function handleAddChild() {
    // 기본적으로 leaf 노드를 추가
    addLeaf()
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
      {#if parentKind !== 'array'}
        <div class="node-header array-type">
          <button class="toggle" onclick={onToggle}>
            {#if isContainer(n) && (n as ObjectNode | ArrayNode).children.length > 0}
              {#if n.collapsed}
                <ChevronRight class="w-3 h-3" />
              {:else}
                <ChevronDown class="w-3 h-3" />
              {/if}
            {/if}
          </button>
          <InlineEditor
            value={n.name}
            onSave={(newValue) => renameNode(model, id, newValue)}
            className="name-editor"
          />
        </div>
      {/if}

      {#if n.kind === 'leaf' && parentKind !== 'array'}
        <span class="sep">:</span>
      {/if}

      {#if n.kind === 'leaf'}
        <div class="value-wrapper">
          <InlineEditor
            value={String((n as LeafNode).value ?? '')}
            onSave={(newValue) => setLeafValue(model, id, newValue)}
            className="value-editor"
            placeholder="Enter value"
          />
        </div>
      {:else if n.kind === 'ref'}
        <span class="ref">$ref → {(n as RefNode).refName}</span>
      {/if}

      <div class="spacer"></div>

      {#if isContainer(n)}
        <ActionButton
          onclick={handleAddChild}
          variant="green"
          size="sm"
          icon={Plus}
          title="Add child"
        />
      {/if}

      {#if id !== model.rootId}
        <ActionButton onclick={onDelete} variant="red" icon={Trash} title="Delete node" />
      {/if}
    </div>

    {#if isContainer(n) && !n.collapsed}
      <div class="children">
        {#each (n as ObjectNode | ArrayNode).children as cid (cid)}
          <TreeNode {model} id={cid} parentKind={n.kind} />
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .node {
    padding-left: 0.25rem;
    margin: 0.25rem 0;
    position: relative;
  }
  .node::before {
    content: '';
    position: absolute;
    left: -0.5rem;
    top: 0;
    width: 0.5rem;
    height: 1rem;
    border-left: 1px dashed var(--muted, #ccc);
    border-bottom: 1px dashed var(--muted, #ccc);
  }
  .node::after {
    content: '';
    position: absolute;
    left: -0.5rem;
    top: 1rem;
    bottom: 0;
    width: 0;
    border-left: 1px dashed var(--muted, #ccc);
  }
  .node:last-child::after {
    display: none;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .node-header {
    display: inline-flex;
    align-items: center;
    border: 1px dashed #d1d5db;
    border-radius: 0.375rem;
    background-color: #f9fafb;
    overflow: hidden;
  }
  .node-header.array-type {
    background-color: #f3e8ff;
    color: #6b21a8;
    border-color: #c084fc;
  }
  .node-header.array-type:hover {
    background-color: #e9d5ff;
  }
  .toggle {
    width: 1.25rem;
    height: 1.25rem;
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
  .value-wrapper {
    display: inline-flex;
    align-items: center;
    border: 1px dashed #d1d5db;
    border-radius: 0.375rem;
    background-color: #e0f2fe;
    color: #075985;
    overflow: hidden;
  }
  .value-wrapper:hover {
    background-color: #bae6fd;
  }
  .ref {
    font-style: italic;
    opacity: 0.8;
  }
  .children {
    margin-left: 1.25rem;
  }
  .spacer {
    flex: 1;
  }
</style>

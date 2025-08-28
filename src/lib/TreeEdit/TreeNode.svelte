<script lang="ts">
  import {
    isContainer,
    setLeafValue,
    toggle,
    renameNode,
    addChild,
    removeNode,
    upsertRef,
    moveChild,
    convertLeafToArray
  } from './model'
  import type { ArrayNode, LeafNode, NodeKind, ObjectNode, RefNode, TreeModel } from './model'
  import TreeNode from './TreeNode.svelte'
  import ActionButton from '../ActionButton.svelte'
  import InlineEditor from './InlineEditor.svelte'
  import { ChevronDown, ChevronRight, Trash, Plus } from 'svelte-heros-v2'

  let {
    model,
    id,
    parentKind,
    isRootChild = false,
    autoEditName = false,
    autoEditChildId = null,
    onMutate
  }: {
    model: TreeModel
    id: string
    parentKind?: NodeKind
    isRootChild?: boolean
    autoEditName?: boolean
    autoEditChildId?: string | null
    onMutate: () => void
  } = $props()

  const get = (id: string) => model.nodes[id]

  let isDragging = $state(false)
  let dragOverPosition = $state<'before' | 'after' | null>(null)
  let newlyAddedChildId = $state<string | null>(null)

  // Refs to inline editors for programmatic activation
  let nameEditorRef: { activate: () => void } | null = $state(null)
  let valueEditorRef: { activate: () => void } | null = $state(null)

  // Run once to auto-activate editor when requested (used for freshly added node)
  let autoEditApplied = $state(false)

  $effect(() => {
    if (autoEditName && !autoEditApplied) {
      // Prefer name editor when present; otherwise try value editor (e.g., array children)
      if (nameEditorRef && parentKind !== 'array') {
        nameEditorRef.activate()
      } else if (valueEditorRef) {
        valueEditorRef.activate()
      }
      autoEditApplied = true
    }
  })

  function onToggle() {
    toggle(model, id)
    onMutate()
  }

  function onDelete() {
    removeNode(model, id)
    onMutate()
  }

  function handleAddChild() {
    // 기본적으로 leaf 노드를 추가
    addLeaf()
  }

  function handleConvertLeafToArray() {
    const firstChildId = convertLeafToArray(model, id)
    if (firstChildId) {
      // After converting, the current node becomes an array. Add an empty child and focus it.
      const parent = get(id)
      if (parent && isContainer(parent)) {
        const nextIndexName = String(parent.children?.length ?? 1)
        const newChild: LeafNode = {
          id: crypto.randomUUID(),
          name: nextIndexName,
          kind: 'leaf',
          value: ''
        } as LeafNode
        addChild(model, id, newChild)
        newlyAddedChildId = newChild.id
      }
      onMutate()
    }
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
    // Mark the newly added child so it renders in editing mode and focuses
    newlyAddedChildId = child.id
    onMutate()
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
    onMutate()
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
    onMutate()
  }

  function addRef() {
    const name = prompt('참조할 이름 ($ref):')
    if (name) {
      upsertRef(model, id, name)
      onMutate()
    }
  }

  function handleDragStart(event: DragEvent) {
    isDragging = true
    event.dataTransfer!.effectAllowed = 'move'
    event.dataTransfer!.setData('text/plain', id)
  }

  function handleDragEnd() {
    isDragging = false
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault()
    event.dataTransfer!.dropEffect = 'move'

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const y = event.clientY - rect.top
    const height = rect.height

    dragOverPosition = y < height / 2 ? 'before' : 'after'
  }

  function handleDragLeave() {
    dragOverPosition = null
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    const draggedId = event.dataTransfer!.getData('text/plain')

    if (draggedId === id) {
      dragOverPosition = null
      return
    }

    // Find the parent of both nodes
    let parentId: string | null = null
    let draggedIndex = -1
    let targetIndex = -1

    for (const [nodeId, node] of Object.entries(model.nodes)) {
      if (isContainer(node)) {
        const children = (node as ObjectNode | ArrayNode).children
        const draggedIdx = children.indexOf(draggedId)
        const targetIdx = children.indexOf(id)

        if (draggedIdx !== -1 && targetIdx !== -1) {
          parentId = nodeId
          draggedIndex = draggedIdx
          targetIndex = targetIdx
          break
        }
      }
    }

    if (parentId && draggedIndex !== -1 && targetIndex !== -1) {
      let newIndex = targetIndex
      if (dragOverPosition === 'after') {
        newIndex = targetIndex + 1
      }

      // Adjust for removal of dragged item
      if (draggedIndex < newIndex) {
        newIndex -= 1
      }

      moveChild(model, parentId, draggedIndex, newIndex)
      onMutate()
    }

    dragOverPosition = null
  }
</script>

{#if get(id)}
  {@const n = get(id)}
  <div
    class="node"
    class:root-child={isRootChild}
    class:drag-over-before={dragOverPosition === 'before'}
    class:drag-over-after={dragOverPosition === 'after'}
  >
    {#if id !== model.rootId}
      <div
        class="row"
        draggable={id !== model.rootId}
        ondragstart={handleDragStart}
        ondragend={handleDragEnd}
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        ondrop={handleDrop}
        class:dragging={isDragging}
        role="treeitem"
        aria-grabbed={isDragging}
        aria-selected="false"
        tabindex="0"
      >
        {#if parentKind !== 'array'}
          <div class="node-header array-type">
            <button class="toggle" onclick={onToggle}>
              {#if isContainer(n) && (n as ObjectNode | ArrayNode).children.length > 0}
                {#if n.collapsed}
                  <ChevronRight class="h-3 w-3" />
                {:else}
                  <ChevronDown class="h-3 w-3" />
                {/if}
              {/if}
            </button>
            <InlineEditor
              value={n.name}
              onSave={(newValue) => {
                renameNode(model, id, newValue)
                onMutate()
              }}
              className="name-editor"
              bind:this={nameEditorRef}
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
              onSave={(newValue) => {
                setLeafValue(model, id, newValue)
                onMutate()
              }}
              className="value-editor"
              placeholder="Enter value"
              bind:this={valueEditorRef}
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
        {:else if n.kind === 'leaf' && parentKind !== 'array'}
          <ActionButton
            onclick={handleConvertLeafToArray}
            variant="green"
            size="sm"
            icon={Plus}
            title="Convert to array"
          />
        {/if}

        {#if id !== model.rootId}
          <ActionButton onclick={onDelete} variant="red" icon={Trash} title="Delete node" />
        {/if}
      </div>
    {/if}

    {#if isContainer(n) && !n.collapsed}
      <div class="children" class:root-child={id === model.rootId}>
        {#each (n as ObjectNode | ArrayNode).children as cid (cid)}
          <TreeNode
            {model}
            id={cid}
            parentKind={n.kind}
            isRootChild={id === model.rootId}
            autoEditName={cid === newlyAddedChildId || cid === autoEditChildId}
            {onMutate}
          />
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
  .node:not(.root-child)::before {
    content: '';
    position: absolute;
    left: -0.5rem;
    top: 0;
    width: 0.5rem;
    height: 1rem;
    border-left: 1px dashed var(--muted, #ccc);
    border-bottom: 1px dashed var(--muted, #ccc);
  }
  .node:not(.root-child)::after {
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
    position: relative;
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
  .children:not(.root-child) {
    margin-left: 1.25rem;
  }
  .spacer {
    flex: 1;
  }

  /* Drag and drop styles */
  .row.dragging {
    opacity: 0.5;
    cursor: grabbing;
  }

  .row[draggable='true'] {
    cursor: grab;
  }

  .node.drag-over-before > .row::before {
    content: '';
    position: absolute;
    top: -3px;
    left: 0;
    width: calc(100%);
    height: 2px;
    background-color: #3b82f6;
    z-index: 10;
  }

  .node.drag-over-after > .row::after {
    content: '';
    position: absolute;
    bottom: -3px;
    left: 0;
    width: calc(100%);
    height: 2px;
    background-color: #3b82f6;
    z-index: 10;
  }
</style>

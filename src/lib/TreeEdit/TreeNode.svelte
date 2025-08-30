<script lang="ts">
  import { isContainer, setLeafValue, toggle, renameNode, moveChild, addChild, uid } from './model'
  import type { ArrayNode, LeafNode, NodeKind, ObjectNode, RefNode, TreeModel } from './model'
  import TreeNode from './TreeNode.svelte'
  import InlineEditor from './InlineEditor.svelte'
  import { ChevronDown, ChevronRight, LockClosed } from 'svelte-heros-v2'
  import { isConsistentRandomArray, isLeafPinned } from './utils'
  import { testModeStore } from '../stores/testModeStore.svelte'

  let {
    model,
    id,
    parentKind,
    isRootChild = false,
    autoEditName = false,
    autoEditChildId = null,
    onMutate,
    selectedId = null,
    onSelect,
    setAutoEditChildId
  }: {
    model: TreeModel
    id: string
    parentKind?: NodeKind
    isRootChild?: boolean
    autoEditName?: boolean
    autoEditChildId?: string | null
    onMutate: () => void
    selectedId?: string | null
    onSelect: (id: string) => void
    setAutoEditChildId?: (id: string | null) => void
  } = $props()

  const get = (id: string) => model.nodes[id]

  let isDragging = $state(false)
  let dragOverPosition = $state<'before' | 'after' | null>(null)
  let newlyAddedChildId = $state<string | null>(null)
  let isValueEditing = $state(false)
  let isNameEditing = $state(false)
  let rowEl: HTMLDivElement | null = $state(null)

  // Refs to inline editors for programmatic activation
  let nameEditorRef: { activate: () => void } | null = $state(null)
  let valueEditorRef: { activate: () => void } | null = $state(null)

  // One-shot auto edit trigger per node instance
  let autoEditApplied = $state(false)

  $effect(() => {
    if (autoEditName && !autoEditApplied) {
      // Prefer name editor when available (non-array parents), otherwise use value editor.
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
  }

  // Removed unused per-node handlers: onDelete, handleAddChild, handleConvertLeafToArray

  // Removed unused add* helpers after moving actions to TreeEdit

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

    // Determine target parent (container of the target row)
    const targetParentId = model.nodes[id]?.parentId ?? null
    const draggedParentId = model.nodes[draggedId]?.parentId ?? null

    if (targetParentId) {
      const targetParent = model.nodes[targetParentId]
      if (!targetParent || !isContainer(targetParent)) {
        dragOverPosition = null
        return
      }
      const children = (targetParent as ObjectNode | ArrayNode).children
      const targetIndex = children.indexOf(id)
      if (targetIndex === -1) {
        dragOverPosition = null
        return
      }

      let newIndex = targetIndex
      if (dragOverPosition === 'after') newIndex = targetIndex + 1

      if (draggedParentId === targetParentId) {
        // Same-parent reorder
        const draggedIndex = children.indexOf(draggedId)
        if (draggedIndex === -1) {
          dragOverPosition = null
          return
        }
        if (draggedIndex < newIndex) newIndex -= 1
        moveChild(model, targetParentId, draggedIndex, newIndex)
        onMutate()
      } else {
        // Cross-parent move
        const draggedNode = model.nodes[draggedId]
        if (!draggedNode) {
          dragOverPosition = null
          return
        }
        // Remove from old parent
        if (draggedParentId) {
          const oldParent = model.nodes[draggedParentId]
          if (oldParent && isContainer(oldParent)) {
            const oldChildren = (oldParent as ObjectNode | ArrayNode).children
            const oldIdx = oldChildren.indexOf(draggedId)
            if (oldIdx !== -1) oldChildren.splice(oldIdx, 1)
          }
        }
        // Insert into new parent
        children.splice(newIndex, 0, draggedId)
        // Update parent link
        draggedNode.parentId = targetParentId
        onMutate()
      }
    }

    dragOverPosition = null
  }

  function isConsistentRandomNode(): boolean {
    return isConsistentRandomArray(model, id)
  }

  function addSiblingAfterCurrentLeaf() {
    const node = model.nodes[id]
    if (!node || node.kind !== 'leaf') return
    const parentId = node.parentId
    if (!parentId) return
    const parent = model.nodes[parentId]
    if (!parent || !isContainer(parent)) return

    // Ensure parent is expanded so the new item is visible
    parent.collapsed = false

    const children = (parent as ObjectNode | ArrayNode).children
    const currentIndex = children.indexOf(id)
    const insertIndex = currentIndex >= 0 ? currentIndex + 1 : children.length

    const newId = uid()
    const newLeaf: LeafNode = {
      id: newId,
      name: parent.kind === 'array' ? String(children.length) : 'newKey',
      kind: 'leaf',
      parentId,
      value: ''
    }

    // Append first, then move to the desired position to keep indices valid
    addChild(model, parentId, newLeaf)
    const appendedIndex = (parent as ObjectNode | ArrayNode).children.length - 1
    moveChild(
      model,
      parentId,
      appendedIndex,
      Math.min(insertIndex, (parent as ObjectNode | ArrayNode).children.length - 1)
    )

    onMutate()
    // Request auto-edit for the newly created leaf
    setAutoEditChildId?.(newId)
    onSelect(newId)
  }

  function isArrayPinned(): boolean {
    const node = model.nodes[id]
    if (!node || node.kind !== 'array') return false
    const parentName = node.name
    return !!testModeStore[parentName]?.overrideTag
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
        class:selected={id === selectedId}
        class:editing={isNameEditing || isValueEditing}
        class:name-editing={isNameEditing}
        class:value-editing={isValueEditing}
        draggable={id !== model.rootId}
        bind:this={rowEl}
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
        onclick={(e) => {
          e.stopPropagation()
          onSelect(id)
        }}
        onkeydown={(e) => {
          if (e.key === 'Enter') {
            // Handle before children so InlineEditor doesn't start editing
            e.preventDefault()
            // Only act when not already editing
            if (!isNameEditing && !isValueEditing) {
              const n = model.nodes[id]
              if (n && n.kind === 'leaf') {
                addSiblingAfterCurrentLeaf()
                return
              }
              onSelect(id)
              return
            }
          } else if (e.key === ' ') {
            e.preventDefault()
            onSelect(id)
          }
        }}
      >
        {#if parentKind !== 'array'}
          <div
            class="node-header"
            class:array-type={n.kind === 'array'}
            class:consistent-array={n.kind === 'array' && isConsistentRandomNode()}
          >
            <button
              class="toggle"
              onclick={(e) => {
                e.stopPropagation()
                onToggle()
              }}
            >
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
              onTab={() => {
                if (n.kind === 'leaf') {
                  // Move from name to value editor on leaves
                  valueEditorRef?.activate()
                } else if (n.kind === 'array' && autoEditName) {
                  const children = (n as ArrayNode).children
                  if (children && children.length > 0) {
                    const firstChildId = children[0]
                    // Request auto-editing on first child and select it
                    setAutoEditChildId?.(firstChildId)
                    onSelect(firstChildId)
                  }
                }
              }}
              className="name-editor"
              model={model}
              bind:this={nameEditorRef}
              onEditingChange={(editing) => (isNameEditing = editing)}
              onFinish={() => {
                onSelect(id)
                rowEl?.focus()
              }}
              expandOnEdit={true}
              enterStartsEditing={n.kind !== 'leaf'}
            />
            {#if n.kind === 'array' && isArrayPinned()}
              <span class="lock-icon"><LockClosed size="12" /></span>
            {/if}
          </div>
        {/if}

        {#if n.kind === 'leaf' && parentKind !== 'array'}
          <span class="sep">:</span>
        {/if}

        {#if n.kind === 'leaf'}
          <div class="value-wrapper" class:editing={isValueEditing}>
            <InlineEditor
              value={String((n as LeafNode).value ?? '')}
              onSave={(newValue) => {
                setLeafValue(model, id, newValue)
                onMutate()
              }}
              enableAutocomplete={true}
              className="value-editor"
              placeholder="Enter value"
              onEditingChange={(editing) => (isValueEditing = editing)}
              model={model}
              bind:this={valueEditorRef}
              onFinish={() => {
                onSelect(id)
                rowEl?.focus()
              }}
              enterStartsEditing={false}
            />
            {#if isLeafPinned(model, id)}
              <span class="lock-icon"><LockClosed size="12" /></span>
            {/if}
          </div>
        {:else if n.kind === 'ref'}
          <span class="ref">$ref → {(n as RefNode).refName}</span>
        {/if}

        <!-- spacer removed to allow row to shrink to content -->
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
            {autoEditChildId}
            {onMutate}
            {selectedId}
            {onSelect}
            {setAutoEditChildId}
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
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    position: relative;
  }
  .row.name-editing,
  .row.value-editing {
    display: flex;
    width: 100%;
  }
  .row.selected {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
    border-radius: 0.375rem;
  }
  .lock-icon {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0; /* prevent shrinking in inline-flex rows */
    color: #d97706; /* text-orange-600 */
    margin-right: 0.25rem; /* mr-1 */
  }
  /* size applied via LockClosed size prop */
  .node-header {
    display: inline-flex;
    align-items: center;
    border: 1px dashed #d1d5db;
    border-radius: 0.375rem;
    background-color: #f9fafb;
    overflow: hidden;
    flex-shrink: 0; /* prevent shrinking when value expands */
  }
  .node-header.array-type {
    background-color: #f3e8ff;
    color: #6b21a8;
    border-color: #c084fc;
  }
  .node-header.array-type:hover {
    background-color: #e9d5ff;
  }
  .node-header.array-type.consistent-array {
    background-color: #ffedd5; /* bg-orange-100 */
    color: #9a3412; /* text-orange-800 */
    border-color: #fb923c; /* border-orange-400 */
  }
  .node-header.array-type.consistent-array:hover {
    background-color: #fed7aa; /* hover:bg-orange-200 */
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
  /* Default: keep value editor content-sized while editing */
  .value-wrapper.editing {
    flex: 0 1 auto;
    width: auto;
  }
  /* When value is editing, expand value editor to fill remaining width */
  .row.value-editing .value-wrapper.editing {
    flex: 1 1 auto;
    width: 100%;
  }

  /* When name is being edited, allow header/editor to grow */
  .row.name-editing .node-header {
    flex: 1 1 auto;
    min-width: 0;
  }
  /* Removed unused selectors targeting child component internals */

  .sep {
    flex-shrink: 0; /* keep colon visible */
  }
  .ref {
    font-style: italic;
    opacity: 0.8;
  }
  .children:not(.root-child) {
    margin-left: 1.25rem;
  }
  /* spacer removed */

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

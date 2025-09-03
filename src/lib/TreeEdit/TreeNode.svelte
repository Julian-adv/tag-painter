<script lang="ts">
  import { isContainer, setLeafValue, toggle, renameNode, moveChild, addChild, uid } from './model'
  import type { ArrayNode, LeafNode, NodeKind, ObjectNode, RefNode, TreeModel } from './model'
  import TreeNode from './TreeNode.svelte'
  import InlineEditor from './InlineEditor.svelte'
  import { ChevronDown, ChevronRight, LockClosed } from 'svelte-heros-v2'
  import { isConsistentRandomArray, isLeafPinned, shouldNodeBeVisible } from './utils'
  import { testModeStore } from '../stores/testModeStore.svelte'

  let {
    model,
    id,
    parentKind,
    isRootChild = false,
    autoEditName = false,
    autoEditChildId = null,
    onMutate,
    selectedIds = [],
    onSelect,
    setAutoEditChildId,
    onChipDoubleClick,
    tabbingActive = false,
    shiftTabActive = false,
    renameCallbacks = {},
    parentNameSuggestions = [],
    filterText = ''
  }: {
    model: TreeModel
    id: string
    parentKind?: NodeKind
    isRootChild?: boolean
    autoEditName?: boolean
    autoEditChildId?: string | null
    onMutate: () => void
    selectedIds?: string[]
    onSelect: (id: string, shiftKey?: boolean) => void
    setAutoEditChildId?: (id: string | null) => void
    onChipDoubleClick?: (tagName: string) => void
    tabbingActive?: boolean
    shiftTabActive?: boolean
    renameCallbacks?: Record<string, (newName: string) => void>
    parentNameSuggestions?: string[]
    filterText?: string
  } = $props()

  const get = (id: string) => model.nodes[id]

  // Check if this node should be visible based on filter
  const isVisible = $derived(() => shouldNodeBeVisible(model, id, filterText))

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
      const node = model.nodes[id]
      // Prefer name editor for non-leaf nodes even under array parents;
      // for leaves under array parents, prefer value editor.
      const canUseNameEditor = !!nameEditorRef && node && node.kind !== 'leaf'
      if (canUseNameEditor) {
        nameEditorRef!.activate()
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

    const targetNode = model.nodes[id]
    const draggedNode = model.nodes[draggedId]

    // Helper to guard against creating cycles
    function isAncestor(ancestorId: string, nodeId: string): boolean {
      let cur = model.nodes[nodeId]
      while (cur && cur.parentId) {
        if (cur.parentId === ancestorId) return true
        cur = model.nodes[cur.parentId]
      }
      return false
    }

    // If dropping a container onto a child within an array, and the drop
    // is between children (middle), split the array around the drop index
    // into two arrays with the dragged container placed between them.
    const targetParentIdEarly = model.nodes[id]?.parentId ?? null
    const draggedParentIdEarly = model.nodes[draggedId]?.parentId ?? null
    if (targetParentIdEarly && draggedNode && isContainer(draggedNode)) {
      const targetParentEarly = model.nodes[targetParentIdEarly]
      if (targetParentEarly && targetParentEarly.kind === 'array') {
        const children = (targetParentEarly as ArrayNode).children
        const targetIndex = children.indexOf(id)
        if (targetIndex !== -1) {
          let insertIndex = targetIndex
          if (dragOverPosition === 'after') insertIndex = targetIndex + 1
          // Only apply split behavior when dropping strictly in the middle
          if (insertIndex > 0 && insertIndex < children.length) {
            const bId = targetParentEarly.id
            const bName = targetParentEarly.name
            const bParentId = targetParentEarly.parentId

            const leftIds = children.slice(0, insertIndex)
            const rightIds = children.slice(insertIndex)

            const leftId = uid()
            const leftArr: ArrayNode = {
              id: leftId,
              name: 'new_parent1',
              kind: 'array',
              parentId: bId,
              children: [],
              collapsed: false
            }
            leftIds.forEach((cid, idx) => {
              const ch = model.nodes[cid]
              if (ch) {
                ch.parentId = leftId
                ch.name = String(idx)
                leftArr.children.push(cid)
              }
            })

            const rightId = uid()
            const rightArr: ArrayNode = {
              id: rightId,
              name: 'new_parent2',
              kind: 'array',
              parentId: bId,
              children: [],
              collapsed: false
            }
            rightIds.forEach((cid, idx) => {
              const ch = model.nodes[cid]
              if (ch) {
                ch.parentId = rightId
                ch.name = String(idx)
                rightArr.children.push(cid)
              }
            })

            // Convert b (array) to object in-place
            const newB: ObjectNode = {
              id: bId,
              name: bName,
              kind: 'object',
              parentId: bParentId,
              children: [],
              collapsed: false
            }

            // Detach dragged from its old parent
            if (draggedParentIdEarly) {
              const oldParent = model.nodes[draggedParentIdEarly]
              if (oldParent && isContainer(oldParent)) {
                const oc = oldParent.children
                const oi = oc.indexOf(draggedId)
                if (oi !== -1) oc.splice(oi, 1)
              }
            }

            // Persist new arrays
            model.nodes[leftId] = leftArr
            model.nodes[rightId] = rightArr

            // Rebuild b's children: left, dragged, right
            newB.children.push(leftId)
            draggedNode.parentId = bId
            newB.children.push(draggedId)
            newB.children.push(rightId)

            // Write new b
            model.nodes[bId] = newB

            onMutate()
            dragOverPosition = null
            return
          } else {
            // Not a middle position: convert array to object with a single
            // child array containing all previous items, then place dragged
            // either before or after that array based on drop index.
            const bId = targetParentEarly.id
            const bName = targetParentEarly.name
            const bParentId = targetParentEarly.parentId
            const prevChildren = [...children]

            const cId = uid()
            const cNode: ArrayNode = {
              id: cId,
              name: 'items',
              kind: 'array',
              parentId: bId,
              children: [],
              collapsed: false
            }
            prevChildren.forEach((cid, idx) => {
              const ch = model.nodes[cid]
              if (ch) {
                ch.parentId = cId
                ch.name = String(idx)
                cNode.children.push(cid)
              }
            })

            const newB: ObjectNode = {
              id: bId,
              name: bName,
              kind: 'object',
              parentId: bParentId,
              children: [],
              collapsed: false
            }

            // Detach dragged from old parent
            if (draggedParentIdEarly) {
              const oldParent = model.nodes[draggedParentIdEarly]
              if (oldParent && isContainer(oldParent)) {
                const oc = oldParent.children
                const oi = oc.indexOf(draggedId)
                if (oi !== -1) oc.splice(oi, 1)
              }
            }

            // Persist c
            model.nodes[cId] = cNode

            // Order: if inserting at start, [dragged, c]; else [c, dragged]
            if (insertIndex === 0) {
              draggedNode.parentId = bId
              newB.children.push(draggedId)
              newB.children.push(cId)
            } else {
              newB.children.push(cId)
              draggedNode.parentId = bId
              newB.children.push(draggedId)
            }

            model.nodes[bId] = newB
            onMutate()
            dragOverPosition = null
            return
          }
        }
      }
    }

    // New behavior: dropping a container (array/object) onto another container
    if (targetNode && draggedNode && isContainer(targetNode) && isContainer(draggedNode)) {
      // Prevent moving a node into its own subtree
      if (isAncestor(draggedId, id)) {
        dragOverPosition = null
        return
      }

      // If target is object: make dragged a child of target
      if (targetNode.kind === 'object') {
        // Detach from old parent if present
        const oldPid = draggedNode.parentId
        if (oldPid) {
          const oldParent = model.nodes[oldPid]
          if (oldParent && isContainer(oldParent)) {
            const oc = oldParent.children
            const oi = oc.indexOf(draggedId)
            if (oi !== -1) oc.splice(oi, 1)
          }
        }
        // Attach to target object
        addChild(model, targetNode.id, draggedNode)
        onMutate()
        dragOverPosition = null
        return
      }

      // If target is array: convert it into an object with two children:
      //  - a new array "c" containing previous items
      //  - the dragged container "a"
      if (targetNode.kind === 'array') {
        const bId = targetNode.id
        const bName = targetNode.name
        const bParentId = targetNode.parentId
        const prevChildren = [...targetNode.children]

        // Build new array node "c" with previous children
        const cId = uid()
        const cNode: ArrayNode = {
          id: cId,
          name: 'items',
          kind: 'array',
          parentId: bId,
          children: [],
          collapsed: false
        }

        // Reparent previous children under c and renumber
        prevChildren.forEach((cid, idx) => {
          const ch = model.nodes[cid]
          if (ch) {
            ch.parentId = cId
            ch.name = String(idx)
            cNode.children.push(cid)
          }
        })

        // Convert b (array) to object in-place, preserving id/name/parent
        const newB: ObjectNode = {
          id: bId,
          name: bName,
          kind: 'object',
          parentId: bParentId,
          children: [cId],
          collapsed: false
        }

        // Write c and new b into model
        model.nodes[cId] = cNode
        model.nodes[bId] = newB

        // Detach dragged from old parent
        const oldPid = draggedNode.parentId
        if (oldPid) {
          const oldParent = model.nodes[oldPid]
          if (oldParent && isContainer(oldParent)) {
            const oc = oldParent.children
            const oi = oc.indexOf(draggedId)
            if (oi !== -1) oc.splice(oi, 1)
          }
        }
        // Attach dragged under new b
        addChild(model, bId, draggedNode)

        onMutate()
        dragOverPosition = null
        return
      }
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

  function isTopLevelPinned(): boolean {
    const node = model.nodes[id]
    if (!node || (node.kind !== 'array' && node.kind !== 'object')) return false
    if (node.parentId !== model.rootId) return false
    const s = testModeStore[node.name]
    return !!(s && s.enabled && s.overrideTag)
  }

  function handleTabFromNameEditor() {
    const n = model.nodes[id]
    if (!n) return

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
  }

  function handleRowKeydown(e: KeyboardEvent) {
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
  }

  function handleRowFocusIn() {
    // Only sync selection when focus is moved via Tab navigation,
    // not when focusing due to mouse or programmatic focus.
    if (tabbingActive) {
      onSelect(id, shiftTabActive)
    }
  }

  function handleRowClick(e: MouseEvent) {
    e.stopPropagation()
    onSelect(id, e.shiftKey)
  }

  function handleToggleClick(e: MouseEvent) {
    e.stopPropagation()
    onToggle()
  }

  function handleNameSave(newValue: string) {
    // Check if there's a rename callback for this node (from Rename button)
    if (renameCallbacks[id]) {
      renameCallbacks[id](newValue)
    } else {
      // Normal rename behavior
      renameNode(model, id, newValue)
      onMutate()
    }
  }

  function handleValueSave(newValue: string) {
    setLeafValue(model, id, newValue)
    onMutate()
  }

  function handleNameFinish(completed: boolean = true) {
    // Check if there's a rename callback for this node (from Rename button)
    if (renameCallbacks[id] && !completed) {
      // Signal cancellation by calling the callback with __CANCEL__
      renameCallbacks[id]('__CANCEL__')
    }
    onSelect(id)
    rowEl?.focus()
  }

  function handleValueFinish(_completed: boolean = true) {
    onSelect(id)
    rowEl?.focus()
  }
</script>

{#if get(id) && isVisible()}
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
        class:selected={selectedIds.includes(id)}
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
        onfocusin={handleRowFocusIn}
        onclick={handleRowClick}
        onkeydown={handleRowKeydown}
      >
        {#if parentKind !== 'array'}
          <div
            class="node-header"
            class:array-type={n.kind === 'array' || n.kind === 'object'}
            class:consistent-array={n.kind === 'array' && isConsistentRandomNode()}
          >
            <button class="toggle" onclick={handleToggleClick}>
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
              onSave={handleNameSave}
              onTab={handleTabFromNameEditor}
              className="name-editor"
              {model}
              bind:this={nameEditorRef}
              onEditingChange={(editing) => (isNameEditing = editing)}
              onFinish={handleNameFinish}
              expandOnEdit={true}
              enterStartsEditing={n.kind !== 'leaf'}
            />
            {#if (n.kind === 'array' || n.kind === 'object') && isTopLevelPinned()}
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
              onSave={handleValueSave}
              enableAutocomplete={true}
              specialSuggestions={parentNameSuggestions}
              className="value-editor"
              onEditingChange={(editing) => (isValueEditing = editing)}
              {model}
              bind:this={valueEditorRef}
              onFinish={handleValueFinish}
              enterStartsEditing={false}
              {onChipDoubleClick}
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
            {selectedIds}
            {onSelect}
            {setAutoEditChildId}
            {onChipDoubleClick}
            {tabbingActive}
            {shiftTabActive}
            {renameCallbacks}
            {parentNameSuggestions}
            {filterText}
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
  /* Increase spacing between sibling children by 1px over base */
  .children > :global(.node) {
    margin-top: calc(0.25rem + 1px);
    margin-bottom: calc(0.25rem + 1px);
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

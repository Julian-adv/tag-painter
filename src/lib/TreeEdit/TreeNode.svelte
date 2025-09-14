<script lang="ts">
  import { isContainer, setLeafValue, toggle, renameNode } from './model'
  import type { ArrayNode, LeafNode, NodeKind, ObjectNode, RefNode, TreeModel } from './model'
  import TreeNode from './TreeNode.svelte'
  import InlineEditor from './InlineEditor.svelte'
  import { ChevronDown, ChevronRight, LockClosed } from 'svelte-heros-v2'
  import { isConsistentRandomArray, isLeafPinned, shouldNodeBeVisible } from './utils'
  import { testModeStore } from '../stores/testModeStore.svelte'
  import { computeDropPosition, dropOnNode } from './dnd'

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
    filterText = '',
    autoEditBehavior = 'selectAll'
  }: {
    model: TreeModel
    id: string
    parentKind?: NodeKind
    isRootChild?: boolean
    autoEditName?: boolean
    autoEditChildId?: string | null
    onMutate: (structural: boolean) => void
    selectedIds?: string[]
    onSelect: (id: string, shiftKey?: boolean) => void
    setAutoEditChildId?: (id: string | null) => void
    onChipDoubleClick?: (tagName: string) => void
    tabbingActive?: boolean
    shiftTabActive?: boolean
    renameCallbacks?: Record<string, (newName: string) => void>
    parentNameSuggestions?: string[]
    filterText?: string
    autoEditBehavior: 'selectAll' | 'caretEnd'
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
  let nameEditorRef: { activate: (behavior: 'selectAll' | 'caretEnd') => void } | null =
    $state(null)
  let valueEditorRef: { activate: (behavior: 'selectAll' | 'caretEnd') => void } | null =
    $state(null)

  // One-shot auto edit trigger per node instance
  let autoEditApplied = $state(false)

  $effect(() => {
    if (autoEditName && !autoEditApplied) {
      const node = model.nodes[id]
      // Prefer name editor for non-leaf nodes even under array parents;
      // for leaves under array parents, prefer value editor.
      const canUseNameEditor = !!nameEditorRef && node && node.kind !== 'leaf'
      if (canUseNameEditor) {
        nameEditorRef!.activate(autoEditBehavior)
      } else if (valueEditorRef) {
        valueEditorRef.activate(autoEditBehavior)
      }
      autoEditApplied = true
    }
  })

  function onToggle() {
    toggle(model, id)
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
    dragOverPosition = computeDropPosition(event)
  }

  function handleDragLeave() {
    dragOverPosition = null
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    const draggedId = event.dataTransfer!.getData('text/plain')
    dropOnNode(model, id, draggedId, dragOverPosition, onMutate)
    dragOverPosition = null
  }

  function isConsistentRandomNode(): boolean {
    return isConsistentRandomArray(model, id)
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
      valueEditorRef?.activate('selectAll')
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
    // Keep Space to toggle/select on the current row; let other keys bubble
    if (e.key === ' ') {
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
      const n = model.nodes[id]
      onMutate(!!n && (n.kind === 'array' || n.kind === 'object'))
    }
  }

  function handleValueSave(newValue: string) {
    setLeafValue(model, id, newValue)
    onMutate(false)
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
              isLeafNode={true}
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
            {autoEditBehavior}
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

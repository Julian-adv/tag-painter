<script lang="ts">
  import type { TreeModel } from './model'
  import ActionButton from '../ActionButton.svelte'
  import {
    Plus,
    Trash,
    ChevronDown,
    ChevronRight,
    LockClosed,
    PencilSquare,
    DocumentDuplicate,
    RectangleGroup
  } from 'svelte-heros-v2'
  import {
    isLeafPinned,
    extractCompositionDirective,
    updateCompositionDirective,
    extractDisablesDirective,
    updateDisablesDirective
  } from './utils'
  import { canGroupSelected, expandAll, collapseAll } from './operations'
  import { getParentOf, isConsistentRandomArray } from './utils'
  import { renameNode } from './model'
  import DisablesEditor from './DisablesEditor.svelte'

  let {
    model,
    selectedIds,
    setSelectedArrayMode,
    togglePinSelected,
    groupSelected,
    duplicateBySelection,
    addBySelection,
    deleteBySelection,
    onModelChanged,
    setAutoEditChildId,
    setRenameCallback,
    parentNameSuggestions = []
  }: {
    model: TreeModel
    selectedIds: string[]
    setSelectedArrayMode: (mode: 'random' | 'consistent-random') => void
    togglePinSelected: () => void
    groupSelected: () => void
    duplicateBySelection: () => void
    addBySelection: () => void
    deleteBySelection: () => void
    onModelChanged?: () => void
    setAutoEditChildId?: (id: string | null) => void
    setRenameCallback?: (
      nodeId: string | null,
      callback: ((newName: string) => void) | null
    ) => void
    parentNameSuggestions: string[]
  } = $props()

  let editingNodeId: string | null = $state(null)
  let originalName: string = $state('')

  function getSelectedNode() {
    return selectedIds.length === 1 ? model.nodes[selectedIds[0]] : null
  }

  function isSelectedArrayNode(): boolean {
    const n = getSelectedNode()
    return !!n && n.kind === 'array'
  }

  function isSelectedConsistentRandom(): boolean {
    if (selectedIds.length !== 1) return false
    return isConsistentRandomArray(model, selectedIds[0])
  }

  function canPinSelected(): boolean {
    if (selectedIds.length !== 1) return false
    const selectedId = selectedIds[0]
    const n = model.nodes[selectedId]
    if (!n || n.kind !== 'leaf') return false
    // Check if there exists any array ancestor
    let pid = getParentOf(model, selectedId)
    while (pid) {
      const p = model.nodes[pid]
      if (!p) break
      if (p.kind === 'array') return true
      pid = p.parentId
    }
    return false
  }

  function isAddDisabled(): boolean {
    if (selectedIds.length === 0) return false
    if (selectedIds.length > 1) return true // Disable add for multiple selection
    const selectedId = selectedIds[0]
    const sel = model.nodes[selectedId]
    if (!sel) return false
    if (sel.kind === 'ref') return true
    const pid = getParentOf(model, selectedId)
    if (!pid) return false
    const p = model.nodes[pid]
    return !!p && p.kind === 'array'
  }

  function canRenameSelected(): boolean {
    if (selectedIds.length !== 1) return false
    const selectedId = selectedIds[0]
    const node = model.nodes[selectedId]
    return !!node && (node.kind === 'object' || node.kind === 'array')
  }

  function canDuplicateSelected(): boolean {
    return selectedIds.length === 1 && !selectedIds.includes(model.rootId)
  }

  function getSelectedLeafComposition(): string | null {
    if (selectedIds.length !== 1) return null
    const selectedId = selectedIds[0]
    const node = model.nodes[selectedId]
    if (!node || node.kind !== 'leaf') return null
    return extractCompositionDirective(String(node.value || ''))
  }

  function isSelectedLeafNode(): boolean {
    if (selectedIds.length !== 1) return false
    const selectedId = selectedIds[0]
    const node = model.nodes[selectedId]
    return !!node && node.kind === 'leaf'
  }

  function updateSelectedComposition(newComposition: string) {
    if (selectedIds.length !== 1) return
    const selectedId = selectedIds[0]
    const node = model.nodes[selectedId]
    if (!node || node.kind !== 'leaf') return

    const currentValue = String(node.value || '')
    const updatedValue = updateCompositionDirective(currentValue, newComposition)
    node.value = updatedValue
    onModelChanged?.()
  }

  // Disables directive helpers
  function getSelectedLeafDisables(): string[] {
    if (selectedIds.length !== 1) return []
    const selectedId = selectedIds[0]
    const node = model.nodes[selectedId]
    if (!node || node.kind !== 'leaf') return []
    return extractDisablesDirective(String(node.value || ''))
  }

  function updateSelectedDisables(items: string[]) {
    if (selectedIds.length !== 1) return
    const selectedId = selectedIds[0]
    const node = model.nodes[selectedId]
    if (!node || node.kind !== 'leaf') return
    const currentValue = String(node.value || '')
    const updatedValue = updateDisablesDirective(currentValue, items)
    node.value = updatedValue
    onModelChanged?.()
  }

  function startRenaming() {
    if (selectedIds.length !== 1) return
    const selectedId = selectedIds[0]
    const node = model.nodes[selectedId]
    if (!node || (node.kind !== 'object' && node.kind !== 'array')) return

    originalName = node.name
    editingNodeId = selectedId
    setAutoEditChildId?.(selectedId)
    setRenameCallback?.(selectedId, finishRenaming)
  }

  function finishRenaming(newName: string) {
    // Check if this is a cancellation signal
    if (newName === '__CANCEL__') {
      cancelRenaming()
      return
    }

    if (!editingNodeId || !originalName || newName === originalName) {
      editingNodeId = null
      originalName = ''
      setAutoEditChildId?.(null)
      setRenameCallback?.(null, null)
      return
    }

    // Rename the node itself
    renameNode(model, editingNodeId, newName)

    // Find all leaf nodes that reference the old name with __oldName__ pattern
    // and replace with __newName__
    replaceNameReferencesInLeaves(originalName, newName)

    editingNodeId = null
    originalName = ''
    setAutoEditChildId?.(null)
    setRenameCallback?.(null, null)
    onModelChanged?.()
  }

  function cancelRenaming() {
    editingNodeId = null
    originalName = ''
    setAutoEditChildId?.(null)
    setRenameCallback?.(null, null)
  }

  function replaceNameReferencesInLeaves(oldName: string, newName: string) {
    const oldPattern = `__${oldName}__`
    const newPattern = `__${newName}__`

    for (const node of Object.values(model.nodes)) {
      if (node.kind === 'leaf' && typeof node.value === 'string') {
        if (node.value.includes(oldPattern)) {
          node.value = node.value.replace(
            new RegExp(`__${escapeRegex(oldName)}__`, 'g'),
            newPattern
          )
        }
      }
    }
  }

  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
</script>

<section class="right-col">
  <div class="array-mode" aria-label="Array selection mode">
    <fieldset class:disabled={!isSelectedArrayNode()} disabled={!isSelectedArrayNode()}>
      <legend class="section-label">Node type</legend>
      <label class="mode-option">
        <input
          type="radio"
          name="arrayMode"
          value="random"
          checked={isSelectedArrayNode() && !isSelectedConsistentRandom()}
          onchange={() => setSelectedArrayMode('random')}
        />
        <span>Random</span>
      </label>
      <label class="mode-option">
        <input
          type="radio"
          name="arrayMode"
          value="consistent-random"
          checked={isSelectedConsistentRandom()}
          onchange={() => setSelectedArrayMode('consistent-random')}
        />
        <span>Consistent Random</span>
      </label>
    </fieldset>
  </div>

  <!-- Directives section -->
  {#if isSelectedLeafNode()}
    <div class="directives" aria-label="Content directives">
      <fieldset>
        <legend class="section-label">Directives</legend>
        <div class="directive-row">
          <label for="composition-select" class="directive-label">Composition</label>
          <select
            id="composition-select"
            class="directive-select"
            value={getSelectedLeafComposition() || ''}
            onchange={(e) => updateSelectedComposition(e.currentTarget.value)}
          >
            <option value="">None</option>
            <option value="all">all</option>
            <option value="2h">2h (horizontal split)</option>
            <option value="2v">2v (vertical split)</option>
          </select>
        </div>
        <div class="directive-row stacked">
          <label class="directive-label" for="disables-input">Disables</label>
          <DisablesEditor
            items={getSelectedLeafDisables()}
            suggestions={parentNameSuggestions}
            inputId="disables-input"
            {model}
            onAdd={(value: string) => {
              const items = getSelectedLeafDisables()
              if (!items.includes(value)) updateSelectedDisables([...items, value])
            }}
            onRemove={(value: string) => {
              const items = getSelectedLeafDisables().filter((x) => x !== value)
              updateSelectedDisables(items)
            }}
          />
        </div>
      </fieldset>
    </div>
  {/if}

  <div class="btns">
    <ActionButton
      onclick={() => expandAll(model)}
      variant="gray"
      size="md"
      icon={ChevronDown}
      title="Expand all nodes"
    >
      Expand all
    </ActionButton>
    <ActionButton
      onclick={() => collapseAll(model)}
      variant="gray"
      size="md"
      icon={ChevronRight}
      title="Collapse all nodes"
    >
      Collapse all
    </ActionButton>
    <ActionButton
      onclick={togglePinSelected}
      variant="gray"
      size="md"
      icon={LockClosed}
      title={selectedIds.length === 1
        ? isLeafPinned(model, selectedIds[0])
          ? 'Unpin this option'
          : 'Pin this option'
        : 'Pin this option'}
      disabled={!canPinSelected()}
    >
      {selectedIds.length === 1 ? (isLeafPinned(model, selectedIds[0]) ? 'Unpin' : 'Pin') : 'Pin'}
    </ActionButton>
    <ActionButton
      onclick={startRenaming}
      variant="gray"
      size="md"
      icon={PencilSquare}
      title="Rename selected node"
      disabled={!canRenameSelected()}
    >
      Rename
    </ActionButton>
    <ActionButton
      onclick={duplicateBySelection}
      variant="gray"
      size="md"
      icon={DocumentDuplicate}
      title="Duplicate selected node"
      disabled={!canDuplicateSelected()}
    >
      Duplicate
    </ActionButton>
    <ActionButton
      onclick={groupSelected}
      variant="blue"
      size="md"
      icon={RectangleGroup}
      title="Group selected leaves"
      disabled={!canGroupSelected(model, selectedIds)}
    >
      Group
    </ActionButton>
    <ActionButton
      onclick={addBySelection}
      variant="green"
      size="md"
      icon={Plus}
      title={selectedIds.length === 1 ? 'Add child to selected' : 'Add top-level node'}
      disabled={isAddDisabled()}
    >
      {selectedIds.length === 1 ? 'Add child' : 'Add top level'}
    </ActionButton>
    <ActionButton
      onclick={deleteBySelection}
      variant="red"
      size="md"
      icon={Trash}
      title="Delete selected node"
      disabled={selectedIds.length === 0 || selectedIds.includes(model.rootId)}
    >
      Delete
    </ActionButton>
  </div>
</section>

<style>
  .right-col {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem;
    align-items: flex-start; /* left-align controls */
  }
  /* Disables editor styles moved to DisablesEditor.svelte */
  .directives fieldset {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.25rem 0;
  }
  .directive-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
  .directive-row.stacked {
    flex-direction: column;
    align-items: flex-start;
  }
  .directive-label {
    font-size: 0.875rem;
    color: #374151;
    font-weight: 500;
  }
  .directive-select {
    font-size: 0.875rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    background-color: white;
    color: #374151;
    min-width: 80px;
  }
  .directive-select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 1px #3b82f6;
  }
  .array-mode fieldset {
    display: inline-flex;
    justify-content: flex-start;
    gap: 0.75rem;
    align-items: center;
    padding: 0.25rem 0;
  }
  .array-mode fieldset.disabled {
    opacity: 0.5;
  }
  .mode-option {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.875rem;
    color: #374151;
  }
  .section-label {
    font-size: 0.875rem; /* same or larger than radio labels */
    color: #6b7280;
    font-weight: 400; /* not bold */
    text-align: left;
    margin-bottom: 0.25rem;
  }
  .btns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.375rem 0.5rem;
    margin: 0.25rem 0;
    padding: 0.5rem;
    width: 100%;
  }
  .btns :global(button) {
    width: 100%;
    justify-content: center;
  }
</style>

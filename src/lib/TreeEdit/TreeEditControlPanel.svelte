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
  import { DEFAULT_ARRAY_WEIGHT } from '$lib/constants'
  import { parseWeightDirective } from '$lib/utils/tagExpansion'
  import { canGroupSelected } from './operations'
  import WheelAdjustableInput from '../WheelAdjustableInput.svelte'
  import { getParentOf, isConsistentRandomArray } from './utils'
  import { renameNode } from './model'
  import DisablesEditor from './DisablesEditor.svelte'
  import { m } from '$lib/paraglide/messages'

  let {
    model,
    selectedIds,
    onExpandAll,
    onCollapseAll,
    collapseSiblings,
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
    onExpandAll?: () => void
    onCollapseAll?: () => void
    collapseSiblings?: () => void
    setSelectedArrayMode: (mode: 'random' | 'consistent-random') => void
    togglePinSelected: () => void
    groupSelected: () => void
    duplicateBySelection: () => void
    addBySelection: () => void
    deleteBySelection: () => void
    onModelChanged?: () => void
    setAutoEditChildId?: (id: string | null, behavior?: 'selectAll' | 'caretEnd') => void
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

  function isSelectedArrayInObject(): boolean {
    const n = getSelectedNode()
    if (!n || n.kind !== 'array') return false

    // Check if parent is object
    const parentId = n.parentId
    if (!parentId) return false

    const parent = model.nodes[parentId]
    return !!parent && parent.kind === 'object'
  }

  function canCollapseSiblings(): boolean {
    if (selectedIds.length !== 1) return false
    const selectedId = selectedIds[0]
    const node = model.nodes[selectedId]
    if (!node) return false
    // Enable for container nodes, and also for leaves that have a container parent
    if (node.kind === 'array' || node.kind === 'object') return true
    if (node.kind === 'leaf') {
      const parentId = node.parentId
      if (!parentId) return false
      const parent = model.nodes[parentId]
      return !!parent && (parent.kind === 'array' || parent.kind === 'object')
    }
    return false
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

  function getSelectedLeafWeight(): number | null {
    if (selectedIds.length !== 1) return null
    const selectedId = selectedIds[0]
    const node = model.nodes[selectedId]
    if (!node || node.kind !== 'leaf') return null

    return parseWeightDirective(String(node.value || ''))
  }

  function updateSelectedWeight(newWeight: number) {
    if (selectedIds.length !== 1) return
    const selectedId = selectedIds[0]
    const node = model.nodes[selectedId]
    if (!node || node.kind !== 'leaf') return

    // Clamp weight between 0.1 and 10000
    const clampedWeight = Math.max(0.1, Math.min(10000, newWeight))

    const currentValue = String(node.value || '').trim()

    // Remove existing weight directive if any
    let cleaned = currentValue.replace(/,?\s*weight=\d+(?:\.\d+)?/gi, '')
    cleaned = cleaned.replace(/^\s*,\s*|\s*,\s*$/g, '').trim()

    // Add new weight directive if not default
    if (clampedWeight !== DEFAULT_ARRAY_WEIGHT) {
      const newValue = cleaned ? `${cleaned}, weight=${clampedWeight}` : `weight=${clampedWeight}`
      node.value = newValue
    } else {
      node.value = cleaned || ''
    }

    onModelChanged?.()
  }

  function getSelectedLeafProbability(): string | null {
    if (selectedIds.length !== 1) return null
    const selectedId = selectedIds[0]
    const node = model.nodes[selectedId]
    if (!node || node.kind !== 'leaf') return null

    // Find the parent array node
    let parentId = node.parentId
    let parentNode = parentId ? model.nodes[parentId] : null

    // If parent is not an array, look for the nearest array ancestor
    while (parentNode && parentNode.kind !== 'array') {
      parentId = parentNode.parentId
      parentNode = parentId ? model.nodes[parentId] : null
    }

    if (!parentNode || parentNode.kind !== 'array') {
      return null // Not inside an array, no probability to calculate
    }

    // Calculate weights for all siblings in the array
    const siblings = parentNode.children || []
    let totalWeight = 0
    let currentWeight = 0

    for (const siblingId of siblings) {
      const siblingNode = model.nodes[siblingId]
      if (!siblingNode) continue

      let weight = DEFAULT_ARRAY_WEIGHT
      if (siblingNode.kind === 'leaf') {
        weight = parseWeightDirective(String(siblingNode.value || ''))
      }

      totalWeight += weight
      if (siblingId === selectedId) {
        currentWeight = weight
      }
    }

    if (totalWeight === 0) return '0%'

    const probability = (currentWeight / totalWeight) * 100
    return `${probability.toFixed(1)}%`
  }

  function getSelectedArrayWeight(): number | null {
    if (!isSelectedArrayInObject()) return null
    const selectedId = selectedIds[0]
    const node = model.nodes[selectedId]
    if (!node || node.kind !== 'array') return null
    return parseWeightDirective(node.name)
  }

  function updateSelectedArrayWeight(newWeight: number) {
    if (!isSelectedArrayInObject()) return
    const selectedId = selectedIds[0]
    const node = model.nodes[selectedId]
    if (!node || node.kind !== 'array') return

    // Clamp weight between 0.1 and 10000
    const clampedWeight = Math.max(0.1, Math.min(10000, newWeight))

    const currentName = node.name.trim()

    // Remove existing weight directive if any
    let cleaned = currentName.replace(/,?\s*weight=\d+(?:\.\d+)?/gi, '')
    cleaned = cleaned.replace(/^\s*,\s*|\s*,\s*$/g, '').trim()

    // Add new weight directive if not default
    if (clampedWeight !== DEFAULT_ARRAY_WEIGHT) {
      const newName = cleaned ? `${cleaned}, weight=${clampedWeight}` : `weight=${clampedWeight}`
      node.name = newName
    } else {
      node.name = cleaned || ''
    }

    onModelChanged?.()
  }

  function getSelectedArrayProbability(): string {
    if (!isSelectedArrayInObject()) return ''
    const selectedId = selectedIds[0]
    const node = model.nodes[selectedId]
    if (!node || node.kind !== 'array') return ''

    const parentId = node.parentId
    if (!parentId) return ''

    const parent = model.nodes[parentId]
    if (!parent || parent.kind !== 'object') return ''

    // Get all sibling arrays in the object
    const arrayChildren = []
    const stack = [...(parent.children || [])]
    const seen = new Set<string>()

    while (stack.length) {
      const childId = stack.pop()!
      if (seen.has(childId)) continue
      seen.add(childId)

      const child = model.nodes[childId]
      if (!child) continue

      if (child.kind === 'array') {
        const weight = parseWeightDirective(child.name)
        arrayChildren.push({ id: childId, weight })
      } else if (child.kind === 'object') {
        stack.push(...(child.children || []))
      }
    }

    if (arrayChildren.length === 0) return '0%'

    const totalWeight = arrayChildren.reduce((sum, child) => sum + child.weight, 0)
    const currentArray = arrayChildren.find((child) => child.id === selectedId)

    if (!currentArray || totalWeight === 0) return '0%'

    const probability = (currentArray.weight / totalWeight) * 100
    return `${probability.toFixed(1)}%`
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
  <div class="array-mode" aria-label={m['treeEdit.arrayModeAria']()}>
    <fieldset class:disabled={!isSelectedArrayNode()} disabled={!isSelectedArrayNode()}>
      <legend class="section-label">{m['treeEdit.nodeTypeLegend']()}</legend>
      <label class="mode-option">
        <input
          type="radio"
          name="arrayMode"
          value="random"
          checked={isSelectedArrayNode() && !isSelectedConsistentRandom()}
          onchange={() => setSelectedArrayMode('random')}
        />
        <span>{m['treeEdit.randomMode']()}</span>
      </label>
      <label class="mode-option">
        <input
          type="radio"
          name="arrayMode"
          value="consistent-random"
          checked={isSelectedConsistentRandom()}
          onchange={() => setSelectedArrayMode('consistent-random')}
        />
        <span>{m['treeEdit.consistentRandomMode']()}</span>
      </label>
    </fieldset>
  </div>

  <!-- Directives section -->
  {#if isSelectedLeafNode()}
    <div class="directives" aria-label={m['treeEdit.directivesAria']()}>
      <fieldset>
        <legend class="section-label">{m['treeEdit.directivesLegend']()}</legend>
        <div class="directive-row">
          <label for="composition-select" class="directive-label">
            {m['treeEdit.compositionLabel']()}
          </label>
          <select
            id="composition-select"
            class="directive-select"
            value={getSelectedLeafComposition() || ''}
            onchange={(e) => updateSelectedComposition(e.currentTarget.value)}
          >
            <option value="">{m['treeEdit.compositionNone']()}</option>
            <option value="all">{m['treeEdit.compositionAll']()}</option>
            <option value="2h">{m['treeEdit.composition2h']()}</option>
            <option value="2v">{m['treeEdit.composition2v']()}</option>
          </select>
        </div>
        <div class="directive-row">
          <label for="weight-input" class="directive-label">{m['treeEdit.weightLabel']()}</label>
          <div class="weight-info">
            <WheelAdjustableInput
              value={getSelectedLeafWeight() ?? DEFAULT_ARRAY_WEIGHT}
              min={0.1}
              max={10000}
              step={0.1}
              wheelStep={10}
              ctrlWheelStep={1}
              arrowStep={0.1}
              class=""
              onchange={updateSelectedWeight}
            />
            {#if getSelectedLeafProbability()}
              <span class="probability-display">
                ({getSelectedLeafProbability()})
              </span>
            {/if}
          </div>
        </div>
        <div class="directive-row stacked">
          <label class="directive-label" for="disables-input">{m['treeEdit.disablesLabel']()}</label
          >
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

  <!-- Array node weight section (when array is child of object) -->
  {#if isSelectedArrayInObject()}
    <div class="directives" aria-label={m['treeEdit.arrayWeightAria']()}>
      <fieldset>
        <legend class="section-label">{m['treeEdit.arrayWeightLegend']()}</legend>
        <div class="directive-row">
          <label for="array-weight-input" class="directive-label"
            >{m['treeEdit.weightLabel']()}</label
          >
          <div class="weight-info">
            <WheelAdjustableInput
              value={getSelectedArrayWeight() ?? DEFAULT_ARRAY_WEIGHT}
              min={0.1}
              max={10000}
              step={0.1}
              wheelStep={10}
              ctrlWheelStep={1}
              arrowStep={0.1}
              class=""
              onchange={updateSelectedArrayWeight}
            />
            {#if getSelectedArrayProbability()}
              <span class="probability-display">
                ({getSelectedArrayProbability()})
              </span>
            {/if}
          </div>
        </div>
      </fieldset>
    </div>
  {/if}

  <div class="btns">
    <ActionButton
      onclick={() => onExpandAll?.()}
      variant="gray"
      size="md"
      icon={ChevronDown}
      title={m['treeEdit.expandAllTitle']()}
    >
      {m['treeEdit.expandAll']()}
    </ActionButton>
    <ActionButton
      onclick={() => onCollapseAll?.()}
      variant="gray"
      size="md"
      icon={ChevronRight}
      title={m['treeEdit.collapseAllTitle']()}
    >
      {m['treeEdit.collapseAll']()}
    </ActionButton>
    <ActionButton
      onclick={() => collapseSiblings?.()}
      variant="gray"
      size="md"
      icon={ChevronRight}
      title={m['treeEdit.collapseSiblingsTitle']()}
      disabled={!canCollapseSiblings()}
    >
      {m['treeEdit.collapseSiblings']()}
    </ActionButton>
    <ActionButton
      onclick={togglePinSelected}
      variant="gray"
      size="md"
      icon={LockClosed}
      title={selectedIds.length === 1
        ? isLeafPinned(model, selectedIds[0])
          ? m['tagDisplay.unpin']()
          : m['tagDisplay.pin']()
        : m['tagDisplay.pin']()}
      disabled={!canPinSelected()}
    >
      {selectedIds.length === 1
        ? isLeafPinned(model, selectedIds[0])
          ? m['treeEdit.unpinButton']()
          : m['treeEdit.pinButton']()
        : m['treeEdit.pinButton']()}
    </ActionButton>
    <ActionButton
      onclick={startRenaming}
      variant="gray"
      size="md"
      icon={PencilSquare}
      title={m['treeEdit.renameTitle']()}
      disabled={!canRenameSelected()}
    >
      {m['treeEdit.rename']()}
    </ActionButton>
    <ActionButton
      onclick={duplicateBySelection}
      variant="gray"
      size="md"
      icon={DocumentDuplicate}
      title={m['treeEdit.duplicateTitle']()}
      disabled={!canDuplicateSelected()}
    >
      {m['treeEdit.duplicate']()}
    </ActionButton>
    <ActionButton
      onclick={groupSelected}
      variant="blue"
      size="md"
      icon={RectangleGroup}
      title={m['treeEdit.groupTitle']()}
      disabled={!canGroupSelected(model, selectedIds)}
    >
      {m['treeEdit.group']()}
    </ActionButton>
    <ActionButton
      onclick={addBySelection}
      variant="green"
      size="md"
      icon={Plus}
      title={selectedIds.length === 1
        ? m['treeEdit.addChildTitle']()
        : m['treeEdit.addTopLevelTitle']()}
      disabled={isAddDisabled()}
    >
      {selectedIds.length === 1 ? m['treeEdit.addChild']() : m['treeEdit.addTopLevel']()}
    </ActionButton>
    <ActionButton
      onclick={deleteBySelection}
      variant="red"
      size="md"
      icon={Trash}
      title={m['treeEdit.deleteTitle']()}
      disabled={selectedIds.length === 0 || selectedIds.includes(model.rootId)}
    >
      {m['treeEdit.delete']()}
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
  .directives {
    width: 100%;
    max-width: 520px;
  }
  .directive-row {
    display: grid;
    grid-template-columns: 8rem minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
    width: 100%;
  }
  .directive-row.stacked {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    width: 100%;
  }
  .directive-label {
    font-size: 0.875rem;
    color: #374151;
    font-weight: 500;
    justify-self: start;
  }
  .directive-row.stacked > .directive-label {
    width: 100%;
    text-align: left;
  }
  .directive-row.stacked > :global(.directive-multiedit) {
    width: 100%;
  }
  .directive-select {
    font-size: 0.875rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    background-color: white;
    color: #374151;
    min-width: 80px;
    justify-self: start;
    width: auto;
  }
  .directive-select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 1px #3b82f6;
  }
  .weight-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-self: start;
  }
  .probability-display {
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 500;
    font-family: monospace;
    padding: 0.125rem 0.375rem;
    background-color: #e5e7eb;
    border-radius: 0.25rem;
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

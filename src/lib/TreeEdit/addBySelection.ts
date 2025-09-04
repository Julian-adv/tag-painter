import type { ArrayNode, LeafNode, TreeModel } from './model'
import { addChild, convertLeafToArray, isContainer, uid, rebuildPathSymbols } from './model'

export type AutoEditBehavior = 'selectAll' | 'caretEnd'

export interface AddBySelectionResult {
  changed: boolean
  selectedId: string | null
  autoEditChildId: string | null
  newlyAddedRootChildId: string | null
  autoEditBehavior: AutoEditBehavior
}

function expandAncestors(model: TreeModel, id: string) {
  let cur = model.nodes[id] || null
  while (cur && cur.parentId) {
    const p = model.nodes[cur.parentId]
    if (p && isContainer(p)) p.collapsed = false
    cur = p || null
  }
}

export function addBySelectionAction(
  model: TreeModel,
  selectedIds: string[]
): AddBySelectionResult {
  // Default no-op result
  const base: AddBySelectionResult = {
    changed: false,
    selectedId: null,
    autoEditChildId: null,
    newlyAddedRootChildId: null,
    autoEditBehavior: 'selectAll'
  }

  // No selection: add an Array node at root with one empty item
  if (selectedIds.length === 0) {
    const rootId = model.rootId
    const root = model.nodes[rootId]
    if (!root || !isContainer(root)) return base

    const arrayNode: ArrayNode = {
      id: uid(),
      name: 'newKey',
      kind: 'array',
      parentId: rootId,
      children: [],
      collapsed: false
    }
    addChild(model, rootId, arrayNode)

    const firstItem: LeafNode = {
      id: uid(),
      name: '0',
      kind: 'leaf',
      parentId: arrayNode.id,
      value: ''
    }
    addChild(model, arrayNode.id, firstItem)

    expandAncestors(model, arrayNode.id)
    rebuildPathSymbols(model)

    return {
      changed: true,
      selectedId: arrayNode.id,
      autoEditChildId: arrayNode.id,
      newlyAddedRootChildId: arrayNode.id,
      autoEditBehavior: 'selectAll'
    }
  }

  // Single selection only; ignore multi-select
  const targetId = selectedIds.length === 1 ? selectedIds[0] : null
  if (!targetId) return base
  const parent = model.nodes[targetId]
  if (!parent) return base
  if (parent.kind === 'ref') return base

  // If leaf, convert to array
  if (parent.kind === 'leaf') {
    const convertedFirstChildId = convertLeafToArray(model, targetId)
    if (!convertedFirstChildId) return base
  }

  const freshParent = model.nodes[targetId]
  if (!freshParent || !isContainer(freshParent)) return base

  if (freshParent.kind === 'object') {
    // Create an array child with one default item
    const arrayNode: ArrayNode = {
      id: uid(),
      name: 'new_parent',
      kind: 'array',
      parentId: targetId,
      children: [],
      collapsed: false
    }
    addChild(model, targetId, arrayNode)

    const firstItem: LeafNode = {
      id: uid(),
      name: '0',
      kind: 'leaf',
      parentId: arrayNode.id,
      value: 'new_child'
    }
    addChild(model, arrayNode.id, firstItem)

    expandAncestors(model, arrayNode.id)
    rebuildPathSymbols(model)

    return {
      changed: true,
      selectedId: arrayNode.id,
      autoEditChildId: arrayNode.id,
      newlyAddedRootChildId: arrayNode.id,
      autoEditBehavior: 'selectAll'
    }
  }

  // freshParent.kind === 'array': add a leaf child
  const nextIndex = String((freshParent.children?.length ?? 0))
  const child: LeafNode = {
    id: uid(),
    name: nextIndex,
    kind: 'leaf',
    parentId: targetId,
    value: ''
  }
  addChild(model, targetId, child)

  expandAncestors(model, child.id)
  rebuildPathSymbols(model)

  return {
    changed: true,
    selectedId: child.id,
    autoEditChildId: child.id,
    newlyAddedRootChildId: child.id,
    autoEditBehavior: 'selectAll'
  }
}

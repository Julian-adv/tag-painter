/**
 * Advanced TreeEdit operations for complex model manipulations
 */

import type { TreeModel, ArrayNode, ObjectNode, LeafNode, RefNode } from './model'
import { uid, isContainer, addChild, moveChild } from './model'
import { getParentOf } from './utils'

/**
 * Group selected leaf nodes under a new parent array
 * @param model The TreeModel to modify
 * @param selectedIds Array of selected node IDs to group
 * @returns Object with success status and optional new group ID
 */
export function groupSelectedNodes(
  model: TreeModel,
  selectedIds: string[]
): { success: boolean; newGroupId?: string; error?: string } {
  if (selectedIds.length === 0) {
    return { success: false, error: 'No nodes selected' }
  }

  // Validate all selected nodes are leaves with the same array parent
  let parentId: string | null = null
  for (const id of selectedIds) {
    const n = model.nodes[id]
    if (!n || n.kind !== 'leaf') {
      return { success: false, error: 'All selected nodes must be leaves' }
    }
    const pid = getParentOf(model, id)
    if (!pid) {
      return { success: false, error: 'Selected nodes must have a parent' }
    }
    const p = model.nodes[pid]
    if (!p || p.kind !== 'array') {
      return { success: false, error: 'Parent must be an array node' }
    }
    if (parentId === null) {
      parentId = pid
    } else if (parentId !== pid) {
      return { success: false, error: 'All selected nodes must have the same parent' }
    }
  }

  if (!parentId) {
    return { success: false, error: 'No valid parent found' }
  }

  const parent = model.nodes[parentId] as ArrayNode
  const selectedSet = new Set(selectedIds)
  const picked: string[] = []
  const tempParents: ArrayNode[] = []

  // Walk original order, create a temp_parent per unselected child
  let tempCounter = 0
  for (const cid of parent.children) {
    if (selectedSet.has(cid)) {
      picked.push(cid)
    } else {
      const tempArrId = uid()
      const tempArr: ArrayNode = {
        id: tempArrId,
        name: `temp_parent${++tempCounter}`,
        kind: 'array',
        parentId: parentId,
        children: [],
        collapsed: false
      }
      // Reparent this single child into its own temp array
      const child = model.nodes[cid]
      if (child) {
        child.parentId = tempArrId
        child.name = '0'
        tempArr.children.push(cid)
      }
      tempParents.push(tempArr)
    }
  }

  // Create the new group array for all picked children
  const newArrId = uid()
  const newArr: ArrayNode = {
    id: newArrId,
    name: 'new_parent',
    kind: 'array',
    parentId: parentId,
    children: [],
    collapsed: false
  }

  picked.forEach((cid, idx) => {
    const c = model.nodes[cid]
    if (!c) return
    c.parentId = newArrId
    c.name = String(idx)
    newArr.children.push(cid)
  })

  // Replace the original array with an object node under the same id
  const objectChildren: string[] = []
  for (const t of tempParents) {
    objectChildren.push(t.id)
    model.nodes[t.id] = t
  }
  objectChildren.push(newArrId)

  const newObject: ObjectNode = {
    id: parent.id,
    name: parent.name,
    kind: 'object',
    parentId: parent.parentId,
    children: objectChildren,
    collapsed: false
  }

  model.nodes[newArrId] = newArr
  model.nodes[parent.id] = newObject

  return { success: true, newGroupId: newArrId }
}

/**
 * Check if selected nodes can be grouped
 * @param model The TreeModel to check
 * @param selectedIds Array of selected node IDs
 * @returns True if nodes can be grouped
 */
export function canGroupSelected(model: TreeModel, selectedIds: string[]): boolean {
  if (selectedIds.length === 0) return false

  // All selected must be leaves with the same array parent
  let parentId: string | null = null
  for (const id of selectedIds) {
    const n = model.nodes[id]
    if (!n || n.kind !== 'leaf') return false
    const pid = getParentOf(model, id)
    if (!pid) return false
    const p = model.nodes[pid]
    if (!p || p.kind !== 'array') return false
    if (parentId === null) parentId = pid
    else if (parentId !== pid) return false
  }
  return true
}

/**
 * Expand all container nodes in the tree
 * @param model The TreeModel to modify
 */
export function expandAll(model: TreeModel): void {
  for (const node of Object.values(model.nodes)) {
    if (node && isContainer(node)) node.collapsed = false
  }
}

/**
 * Collapse all container nodes except root
 * @param model The TreeModel to modify
 */
export function collapseAll(model: TreeModel): void {
  for (const node of Object.values(model.nodes)) {
    if (node && isContainer(node) && node.id !== model.rootId) node.collapsed = true
  }
}

/**
 * Clone a subtree under a given parent with a provided name and return the new root id.
 */
export function cloneSubtreeUnderParent(
  model: TreeModel,
  srcId: string,
  tgtParentId: string,
  newName: string
): string {
  const src = model.nodes[srcId]
  if (!src) return ''

  if (src.kind === 'leaf') {
    const newId = uid()
    const cloned: LeafNode = {
      id: newId,
      name: newName,
      kind: 'leaf',
      parentId: tgtParentId,
      value: (src as LeafNode).value
    }
    addChild(model, tgtParentId, cloned)
    return newId
  }

  if (src.kind === 'ref') {
    const newId = uid()
    const cloned: RefNode = {
      id: newId,
      name: src.name,
      kind: 'ref',
      parentId: tgtParentId,
      refName: src.refName
    }
    addChild(model, tgtParentId, cloned)
    return newId
  }

  // container
  const newId = uid()
  const container: ObjectNode | ArrayNode = {
    id: newId,
    name: newName,
    kind: src.kind,
    parentId: tgtParentId,
    children: [] as string[],
    collapsed: !!src.collapsed
  } as ObjectNode | ArrayNode
  addChild(model, tgtParentId, container)

  for (const childId of (src as ObjectNode | ArrayNode).children) {
    const child = model.nodes[childId]
    if (!child) continue
    const childName = child.name
    cloneSubtreeUnderParent(model, childId, newId, childName)
  }
  return newId
}

/**
 * Duplicate a node subtree next to its source (inserted right after the source sibling position).
 * Returns the id of the duplicated root when successful.
 */
export function duplicateSubtreeNextToSource(
  model: TreeModel,
  sourceId: string
): { success: boolean; newRootId?: string; error?: string } {
  if (sourceId === model.rootId) return { success: false, error: 'Cannot duplicate root' }
  const source = model.nodes[sourceId]
  if (!source) return { success: false, error: 'Source not found' }
  const parentId = source.parentId
  if (!parentId) return { success: false, error: 'Source has no parent' }
  const parent = model.nodes[parentId]
  if (!parent || !isContainer(parent)) return { success: false, error: 'Invalid parent' }

  const siblings = parent.children
  const srcIndex = siblings.indexOf(sourceId)
  if (srcIndex === -1) return { success: false, error: 'Source not in parent children' }
  const insertIndex = srcIndex + 1

  const newName = parent.kind === 'array' ? String(siblings.length) : source.name
  const newRootId = cloneSubtreeUnderParent(model, sourceId, parentId, newName)
  if (!newRootId) return { success: false, error: 'Clone failed' }

  const appendedIndex = siblings.length - 1
  let targetIndex = insertIndex
  if (appendedIndex < insertIndex) {
    targetIndex = Math.min(insertIndex, siblings.length - 1)
  }
  moveChild(model, parentId, appendedIndex, targetIndex)
  return { success: true, newRootId }
}

import type { ArrayNode, ObjectNode, TreeModel } from './model'
import { isContainer, addChild, moveChild, uid } from './model'

export type DropPosition = 'before' | 'after' | null

export function computeDropPosition(event: DragEvent): DropPosition {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const y = event.clientY - rect.top
  const height = rect.height
  return y < height / 2 ? 'before' : 'after'
}

function isAncestor(model: TreeModel, ancestorId: string, nodeId: string): boolean {
  let cur = model.nodes[nodeId]
  while (cur && cur.parentId) {
    if (cur.parentId === ancestorId) return true
    cur = model.nodes[cur.parentId]
  }
  return false
}

function detachFromParent(model: TreeModel, nodeId: string): void {
  const node = model.nodes[nodeId]
  if (!node) return
  const pid = node.parentId
  if (!pid) return
  const parent = model.nodes[pid]
  if (!parent || !isContainer(parent)) return
  const children = (parent as ObjectNode | ArrayNode).children
  const idx = children.indexOf(nodeId)
  if (idx !== -1) children.splice(idx, 1)
}

/**
 * Handle dropping a dragged node onto a target row.
 * Returns true when the drop was handled and a mutation occurred.
 */
export function dropOnNode(
  model: TreeModel,
  targetId: string,
  draggedId: string,
  dropPosition: DropPosition,
  onMutate: (structural: boolean) => void
): boolean {
  if (draggedId === targetId) return false

  const targetNode = model.nodes[targetId]
  const draggedNode = model.nodes[draggedId]
  if (!targetNode || !draggedNode) return false

  // Insert as sibling under a collapsed container when applicable
  let siblingParentId: string | null = null
  if (isContainer(targetNode) && targetNode.collapsed) {
    siblingParentId = targetNode.parentId
  } else {
    const targetParentId0 = model.nodes[targetId]?.parentId ?? null
    if (targetParentId0) {
      const targetParent0 = model.nodes[targetParentId0]
      if (targetParent0 && isContainer(targetParent0) && targetParent0.collapsed) {
        siblingParentId = targetParentId0
      }
    }
  }
  if (siblingParentId) {
    if (isAncestor(model, draggedId, siblingParentId)) return false
    const siblings = (model.nodes[siblingParentId] as ObjectNode | ArrayNode).children
    const targetIndex = siblings.indexOf(targetId)
    if (targetIndex !== -1) {
      let newIndex = targetIndex
      if (dropPosition === 'after') newIndex = targetIndex + 1

      const currentParentId = model.nodes[draggedId]?.parentId ?? null
      if (currentParentId === siblingParentId) {
        const fromIndex = siblings.indexOf(draggedId)
        if (fromIndex !== -1) {
          if (fromIndex < newIndex) newIndex -= 1
          moveChild(model, siblingParentId, fromIndex, newIndex)
          onMutate(true)
          return true
        }
      } else {
        detachFromParent(model, draggedId)
        if (newIndex < 0) newIndex = 0
        if (newIndex > siblings.length) newIndex = siblings.length
        siblings.splice(newIndex, 0, draggedId)
        draggedNode.parentId = siblingParentId
        onMutate(true)
        return true
      }
    }
  }

  // Drop a container onto a child within an array: split or wrap
  const targetParentIdEarly = model.nodes[targetId]?.parentId ?? null
  const draggedParentIdEarly = model.nodes[draggedId]?.parentId ?? null
  if (targetParentIdEarly && isContainer(draggedNode)) {
    const targetParentEarly = model.nodes[targetParentIdEarly]
    if (targetParentEarly && targetParentEarly.kind === 'array') {
      const children = (targetParentEarly as ArrayNode).children
      const targetIndex = children.indexOf(targetId)
      if (targetIndex !== -1) {
        let insertIndex = targetIndex
        if (dropPosition === 'after') insertIndex = targetIndex + 1
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

          const newB: ObjectNode = {
            id: bId,
            name: bName,
            kind: 'object',
            parentId: bParentId,
            children: [],
            collapsed: false
          }

          if (draggedParentIdEarly) detachFromParent(model, draggedId)

          model.nodes[leftId] = leftArr
          model.nodes[rightId] = rightArr

          newB.children.push(leftId)
          draggedNode.parentId = bId
          newB.children.push(draggedId)
          newB.children.push(rightId)

          model.nodes[bId] = newB

          onMutate(true)
          return true
        } else {
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

          if (draggedParentIdEarly) detachFromParent(model, draggedId)

          model.nodes[cId] = cNode

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
          onMutate(true)
          return true
        }
      }
    }
  }

  // Drop a container onto another container
  if (isContainer(targetNode) && isContainer(draggedNode)) {
    if (isAncestor(model, draggedId, targetId)) return false

    if (targetNode.kind === 'object') {
      detachFromParent(model, draggedId)
      addChild(model, targetNode.id, draggedNode)
      onMutate(true)
      return true
    }

    if (targetNode.kind === 'array') {
      const bId = targetNode.id
      const bName = targetNode.name
      const bParentId = targetNode.parentId
      const prevChildren = [...targetNode.children]

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
        children: [cId],
        collapsed: false
      }

      model.nodes[cId] = cNode
      model.nodes[bId] = newB

      detachFromParent(model, draggedId)
      addChild(model, bId, draggedNode)

      onMutate(true)
      return true
    }
  }

  // Default: reorder within same parent or move across parents
  const targetParentId = model.nodes[targetId]?.parentId ?? null
  const draggedParentId = model.nodes[draggedId]?.parentId ?? null
  if (!targetParentId) return false
  const targetParent = model.nodes[targetParentId]
  if (!targetParent || !isContainer(targetParent)) return false
  const children = (targetParent as ObjectNode | ArrayNode).children
  const targetIndex = children.indexOf(targetId)
  if (targetIndex === -1) return false

  let newIndex = targetIndex
  if (dropPosition === 'after') newIndex = targetIndex + 1

  if (draggedParentId === targetParentId) {
    const draggedIndex = children.indexOf(draggedId)
    if (draggedIndex === -1) return false
    if (draggedIndex < newIndex) newIndex -= 1
    moveChild(model, targetParentId, draggedIndex, newIndex)
    onMutate(true)
    return true
  }

  if (!draggedNode) return false
  detachFromParent(model, draggedId)
  children.splice(newIndex, 0, draggedId)
  draggedNode.parentId = targetParentId
  onMutate(true)
  return true
}

import type { TreeModel } from './model'
import { isContainer } from './model'
import { shouldNodeBeVisible } from './utils'

export function flattenVisibleNodeIds(model: TreeModel, filterText: string): string[] {
  const result: string[] = []
  function dfs(curId: string) {
    const n = model.nodes[curId]
    if (!n) return
    if (!shouldNodeBeVisible(model, curId, filterText)) return
    if (curId !== model.rootId) result.push(curId)
    if (isContainer(n) && !n.collapsed) {
      for (const cid of n.children || []) dfs(cid)
    }
  }
  dfs(model.rootId)
  return result
}

export function findNearestVisibleAncestorId(model: TreeModel, id: string): string {
  const start = model.nodes[id]
  if (!start) return model.rootId
  let current = start
  while (current.parentId) {
    const parent = model.nodes[current.parentId]
    if (!parent) break
    if (isContainer(parent) && parent.collapsed) {
      current = parent
      continue
    }
    break
  }
  return current.id
}

export function getNextSelectionId(
  model: TreeModel,
  currentId: string | null,
  delta: number,
  filterText: string
): string {
  const visible = flattenVisibleNodeIds(model, filterText)
  if (visible.length === 0) return ''

  if (!currentId) return visible[0]

  let idx = visible.indexOf(currentId)
  if (idx === -1) {
    const newId = findNearestVisibleAncestorId(model, currentId)
    const found = visible.indexOf(newId)
    idx = found >= 0 ? found : 0
  }

  const next = Math.min(visible.length - 1, Math.max(0, idx + delta))
  return visible[next] || ''
}

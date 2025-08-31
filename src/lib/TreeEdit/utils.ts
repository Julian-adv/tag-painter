import type { AnyNode, NodeId, TreeModel } from './model'
import { CONSISTENT_RANDOM_MARKER } from '$lib/constants'
import { testModeStore } from '../stores/testModeStore.svelte'

export function isConsistentRandomArray(model: TreeModel, id: NodeId): boolean {
  const node = model.nodes[id]
  if (!node || node.kind !== 'array') return false
  const firstId = node.children?.[0]
  if (!firstId) return false
  const first = model.nodes[firstId]
  if (first && first.kind === 'leaf' && typeof first.value === 'string') {
    return first.value === CONSISTENT_RANDOM_MARKER
  }
  return false
}

export function isLeafPinned(model: TreeModel, id: NodeId): boolean {
  const node = model.nodes[id]
  if (!node || node.kind !== 'leaf') return false
  const pid = node.parentId
  if (!pid) return false
  const parent = model.nodes[pid]
  if (!parent || parent.kind !== 'array') return false
  const parentName = parent.name
  const val = String(node.value ?? '')
  return testModeStore[parentName]?.overrideTag === val
}

export function findNodeByName(model: TreeModel, name: string): AnyNode | undefined {
  const q = String(name).trim()
  const bySym = model.symbols[q] || model.pathSymbols[q]
  if (bySym) return model.nodes[bySym]
  for (const n of Object.values(model.nodes)) {
    if (n.name === q) return n
  }
  return undefined
}

export function getParentOf(model: TreeModel, nodeId: string): string | null {
  return model.nodes[nodeId]?.parentId ?? null
}

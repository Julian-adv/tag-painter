import type { NodeId, TreeModel } from './model'
import { CONSISTENT_RANDOM_MARKER } from '$lib/constants'

export function isConsistentRandomArray(
  model: TreeModel,
  id: NodeId
): boolean {
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

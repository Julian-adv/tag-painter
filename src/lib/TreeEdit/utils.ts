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
  const parentName = getTopLevelAncestorName(model, id)
  if (!parentName) return false
  const store = testModeStore[parentName]
  if (!store || !store.enabled) return false
  if (store.pinnedLeafId) {
    return store.pinnedLeafId === id
  }
  const val = String(node.value ?? '')
  return store.overrideTag === val
}

// Return the highest ancestor on the path that is a direct child of the root,
// and return its name. If the starting node itself is a direct child of root,
// returns that node's name. Otherwise null if no such ancestor is found.
export function getTopLevelAncestorName(model: TreeModel, nodeId: string): string | null {
  let current = model.nodes[nodeId]
  while (current && current.parentId) {
    const parent = model.nodes[current.parentId]
    if (!parent) break
    if (parent.id === model.rootId) {
      return current.name
    }
    current = parent
  }
  return null
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

/**
 * Extract composition directive from leaf node content
 * @param leafValue The string value of a leaf node
 * @returns The composition value (e.g., 'all', '2h', '2v') or null if none found
 */
export function extractCompositionDirective(leafValue: string): string | null {
  if (typeof leafValue !== 'string') return null

  // Match composition=xxx pattern (case-insensitive)
  const match = leafValue.toLowerCase().match(/composition=([a-z0-9_-]+)/)
  return match ? match[1] : null
}

/**
 * Update composition directive in leaf node content
 * @param leafValue The current string value of a leaf node
 * @param newComposition The new composition value (e.g., 'all', '2h', '2v') or empty string to remove
 * @returns Updated string with new composition directive
 */
export function updateCompositionDirective(leafValue: string, newComposition: string): string {
  if (typeof leafValue !== 'string') leafValue = ''

  const compositionPattern = /composition=[a-z0-9_-]+/gi

  if (!newComposition) {
    // Remove composition directive
    let result = leafValue.replace(compositionPattern, '')
    // Clean up extra commas and whitespace
    result = result
      .replace(/,\s*,/g, ',')
      .replace(/^,\s*|,\s*$/g, '')
      .replace(/\s+,/g, ',')
      .replace(/,\s+/g, ', ')
    return result.trim()
  }

  const newDirective = `composition=${newComposition}`

  if (compositionPattern.test(leafValue)) {
    // Replace existing composition directive
    return leafValue.replace(compositionPattern, newDirective)
  } else {
    // Add new composition directive
    const trimmed = leafValue.trim()
    return trimmed ? `${trimmed}, ${newDirective}` : newDirective
  }
}

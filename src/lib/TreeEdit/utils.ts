import type { AnyNode, NodeId, TreeModel } from './model'
import { CONSISTENT_RANDOM_MARKER } from '$lib/constants'
import { testModeStore } from '../stores/testModeStore.svelte'
import { isContainer } from './model'

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

/**
 * Check if a node matches the filter criteria
 * @param model TreeModel containing all nodes
 * @param nodeId ID of the node to check
 * @param filter Filter string (case-insensitive)
 * @returns True if the node or any of its descendants match the filter
 */
// Lightweight per-model, per-filter caches to avoid repeated subtree scans
type VisibilityCache = {
  filterLower: string
  nodeMatches: Map<string, boolean>
  subtreeMatches: Map<string, boolean>
  hasMatchingAncestor: Map<string, boolean>
}

const cacheByModel = new WeakMap<TreeModel, VisibilityCache>()

function getVisibilityCache(model: TreeModel, filter: string): VisibilityCache {
  const filterLower = filter.trim().toLowerCase()
  let cache = cacheByModel.get(model)
  if (!cache || cache.filterLower !== filterLower) {
    cache = {
      filterLower,
      nodeMatches: new Map(),
      subtreeMatches: new Map(),
      hasMatchingAncestor: new Map()
    }
    cacheByModel.set(model, cache)
  }
  return cache
}

function matchesSelf(model: TreeModel, nodeId: string, cache: VisibilityCache): boolean {
  if (cache.nodeMatches.has(nodeId)) return cache.nodeMatches.get(nodeId) as boolean
  const node = model.nodes[nodeId]
  if (!node) {
    cache.nodeMatches.set(nodeId, false)
    return false
  }
  const result = nodeMatches(node, cache.filterLower)
  cache.nodeMatches.set(nodeId, result)
  return result
}

function computeSubtreeMatches(model: TreeModel, nodeId: string, cache: VisibilityCache): boolean {
  if (cache.subtreeMatches.has(nodeId)) return cache.subtreeMatches.get(nodeId) as boolean
  const node = model.nodes[nodeId]
  if (!node) {
    cache.subtreeMatches.set(nodeId, false)
    return false
  }
  // Self match
  if (matchesSelf(model, nodeId, cache)) {
    cache.subtreeMatches.set(nodeId, true)
    return true
  }
  // Any descendant match
  if (isContainer(node)) {
    for (const childId of node.children) {
      if (computeSubtreeMatches(model, childId, cache)) {
        cache.subtreeMatches.set(nodeId, true)
        return true
      }
    }
  }
  cache.subtreeMatches.set(nodeId, false)
  return false
}

function computeHasMatchingAncestor(
  model: TreeModel,
  nodeId: string,
  cache: VisibilityCache
): boolean {
  if (cache.hasMatchingAncestor.has(nodeId)) return cache.hasMatchingAncestor.get(nodeId) as boolean
  const node = model.nodes[nodeId]
  if (!node || !node.parentId) {
    cache.hasMatchingAncestor.set(nodeId, false)
    return false
  }
  const parentId = node.parentId
  const result = matchesSelf(model, parentId, cache) || computeHasMatchingAncestor(model, parentId, cache)
  cache.hasMatchingAncestor.set(nodeId, result)
  return result
}

export function nodeMatchesFilter(model: TreeModel, nodeId: string, filter: string): boolean {
  if (!filter.trim()) return true // Show all if no filter
  const cache = getVisibilityCache(model, filter)
  return computeSubtreeMatches(model, nodeId, cache)
}

/**
 * Check if a node should be visible based on filter criteria
 * A node is visible if:
 * 1. The node itself matches the filter, OR
 * 2. Any of its descendants match the filter, OR
 * 3. Any of its ancestors match the filter, OR
 * 4. It's a descendant of a matching container node
 * @param model TreeModel containing all nodes
 * @param nodeId ID of the node to check
 * @param filter Filter string (case-insensitive)
 * @returns True if the node should be visible
 */
export function shouldNodeBeVisible(model: TreeModel, nodeId: string, filter: string): boolean {
  if (!filter.trim()) return true // Show all if no filter
  const cache = getVisibilityCache(model, filter)
  // Visible if self/descendants match, or any ancestor matches
  return (
    computeSubtreeMatches(model, nodeId, cache) || computeHasMatchingAncestor(model, nodeId, cache)
  )
}

/**
 * Check if a single node matches the filter criteria (name or value)
 */
function nodeMatches(node: AnyNode, filterLower: string): boolean {
  // Check if node name matches
  if (node.name.toLowerCase().includes(filterLower)) {
    return true
  }
  
  // For leaf nodes, also check the value
  if (node.kind === 'leaf' && typeof node.value === 'string') {
    if (node.value.toLowerCase().includes(filterLower)) {
      return true
    }
  }
  
  return false
}

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
  // Find nearest array ancestor and use its path as the pin key
  let parentId: string | null = node.parentId
  let arrayAncestorId: string | null = null
  while (parentId) {
    const p = model.nodes[parentId]
    if (!p) break
    if (p.kind === 'array') {
      arrayAncestorId = p.id
      break
    }
    parentId = p.parentId ?? null
  }
  if (!arrayAncestorId) return false
  const pinKey = getNodePath(model, arrayAncestorId)
  const store = testModeStore[pinKey]
  if (!store || !store.enabled) return false
  // If we have an exact pinned leaf id and it matches, it's pinned.
  // If it doesn't match (e.g., model reloaded and ids changed), fall back to value match.
  if (store.pinnedLeafId === id) return true
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
  const bySym = model.symbols[q]
  const byPath = model.pathSymbols[q]
  if (bySym || byPath) {
    const id = bySym || byPath
    const n = id ? model.nodes[id] : undefined
    return n
  }
  // Path-based lookup covered by model.pathSymbols; no manual walk needed
  return undefined
}

// Build full path (without leading 'root') for a node id
export function getNodePath(model: TreeModel, nodeId: string): string {
  const parts: string[] = []
  let cur = model.nodes[nodeId]
  while (cur && cur.parentId) {
    parts.push(cur.name)
    cur = model.nodes[cur.parentId]
  }
  parts.reverse()
  if (parts[0] === 'root') parts.shift()
  return parts.join('/')
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
 * Extract disables directive from leaf node content
 * Format: disables=[a, b, c]
 * Returns an array of items (trimmed), or empty array if none
 */
export function extractDisablesDirective(leafValue: string): string[] {
  if (typeof leafValue !== 'string') return []
  const m = leafValue.match(/disables=\[([^\]]*)\]/i)
  if (!m) return []
  const inner = m[1]
  return inner
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Update disables directive list in leaf node content
 * When items is empty, removes the directive and cleans commas/spaces
 */
export function updateDisablesDirective(leafValue: string, items: string[]): string {
  if (typeof leafValue !== 'string') leafValue = ''
  const directiveRe = /\s*disables=\[[^\]]*\]\s*/gi
  let result = leafValue.replace(directiveRe, ' ')
  result = result.replace(/\s{2,}/g, ' ').trim()
  // Collapse any duplicate commas introduced by removal (e.g., "x, , y" -> "x, y")
  result = result.replace(/,\s*,/g, ', ')

  if (!items || items.length === 0) {
    // Clean up stray commas similar to composition removal
    result = result
      .replace(/,\s*,/g, ',')
      .replace(/^,\s*|,\s*$/g, '')
      .replace(/\s+,/g, ',')
      .replace(/,\s+/g, ', ')
      .trim()
    return result
  }

  const list = items.join(', ')
  // Append or place with proper comma separation
  if (!result) return `disables=[${list}]`
  // Ensure single comma separation
  result = result
    .replace(/\s*,\s*/g, ', ')
    .replace(/,\s*,/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (result.endsWith(',')) return `${result} disables=[${list}]`
  return `${result}, disables=[${list}]`
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
  const result =
    matchesSelf(model, parentId, cache) || computeHasMatchingAncestor(model, parentId, cache)
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

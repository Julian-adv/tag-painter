// Shared store for auto-completion tags
import { get, writable } from 'svelte/store'
import { fromYAML } from '../TreeEdit/yaml-io'
import type { AnyNode, TreeModel } from '../TreeEdit/model'

let tags: string[] = []
// Index: wildcard name -> predominant kind ('array' > 'object' > 'leaf')
let wildcardNameIndex: Map<string, 'array' | 'object' | 'leaf'> = new Map()
// Keep parsed TreeModel to query node kinds directly (for advanced features)
let wildcardModel: TreeModel = fromYAML('')
export const combinedTags = writable<string[]>([])
let initPromise: Promise<void> | null = null

export async function initTags(): Promise<void> {
  // Return cached tags if already loaded
  const currentCombinedTags = get(combinedTags)
  if (tags.length > 0 && currentCombinedTags.length > 0) {
    return
  }

  // If already initializing, return the existing promise
  if (initPromise) {
    return initPromise
  }

  // Create and cache the initialization promise
  initPromise = (async () => {
    try {
      // Load both danbooru tags and wildcards.yaml
      const [tagsRes, wcRes] = await Promise.allSettled([
        fetch('/api/tags'),
        fetch('/api/wildcards')
      ])

      if (tagsRes.status === 'fulfilled' && tagsRes.value.ok) {
        try {
          tags = await tagsRes.value.json()
        } catch (e) {
          console.error('Failed to parse /api/tags response as JSON:', e)
          tags = []
        }
      } else {
        console.error('Failed to load tags:', tagsRes.status === 'rejected' ? tagsRes.reason : tagsRes.value.status)
        tags = []
      }

      if (wcRes.status === 'fulfilled' && wcRes.value.ok) {
        try {
          const text = await wcRes.value.text()
          const info = extractWildcardIndexAndModel(text)
          wildcardNameIndex = info.index
          wildcardModel = info.model
        } catch (e) {
          console.error('Failed to parse wildcards.yaml:', e)
          wildcardNameIndex = new Map()
          wildcardModel = fromYAML('')
        }
      } else {
        // If not found or failed, fall back to empty
        wildcardNameIndex = new Map()
        wildcardModel = fromYAML('')
        if (wcRes.status === 'rejected') {
          console.error('Failed to load wildcards.yaml:', wcRes.reason)
        }
      }

      updateCombinedTags()
    } catch (error) {
      console.error('Failed to initialize tags:', error)
      updateCombinedTags()
    } finally {
      initPromise = null // Reset promise after completion
    }
  })()

  return initPromise
}

export function updateCombinedTags(): string[] {
  // Build combined tags from wildcard names + danbooru tags
  // Allow duplicates: concatenate wildcards and danbooru tags
  const newCombinedTags = [...wildcardNameIndex.keys(), ...(tags || [])]

  // Update the store and notify subscribers
  combinedTags.set(newCombinedTags)

  return newCombinedTags
}

// Check if a tag is a custom tag
export function isCustomTag(tag: string): boolean {
  return wildcardNameIndex.has(tag)
}

// Extract wildcard name → kind index from wildcards.yaml text, and return with the parsed model
function extractWildcardIndexAndModel(
  text: string
): { index: Map<string, 'array' | 'object' | 'leaf'>; model: TreeModel } {
  try {
    const model: TreeModel = fromYAML(text ?? '')
    const nodes = model.nodes
    const index = new Map<string, 'array' | 'object' | 'leaf'>()

    const isObject = (n: AnyNode) => n.kind === 'object'
    const isArray = (n: AnyNode) => n.kind === 'array'
    const isLeaf = (n: AnyNode) => n.kind === 'leaf'

    for (const node of Object.values(nodes)) {
      // Skip root placeholder
      if (node.name === 'root') continue
      // Exclude ref nodes from suggestions
      if (node.kind === 'ref') continue

      // Always include keys for object/array containers
      if (isObject(node) || isArray(node)) {
        // Prefer 'array' over existing kind, then 'object', then 'leaf'
        const prev = index.get(node.name)
        if (isArray(node)) {
          index.set(node.name, 'array')
        } else if (!prev || prev === 'leaf') {
          index.set(node.name, 'object')
        }
        continue
      }

      // For leaf nodes, include only if parent is an object (i.e., a real key),
      // and exclude array indices like '0', '1', ...
      if (isLeaf(node) && node.parentId) {
        const parent = nodes[node.parentId]
        if (parent && parent.kind === 'object') {
          if (!index.has(node.name)) index.set(node.name, 'leaf')
        }
      }
    }

    return { index, model }
  } catch (e) {
    console.error('extractWildcardNames error:', e)
    return { index: new Map(), model: fromYAML('') }
  }
}

// Public helper to refresh wildcards from provided YAML text
export function updateWildcardsFromText(text: string) {
  try {
    const info = extractWildcardIndexAndModel(text)
    wildcardNameIndex = info.index
    wildcardModel = info.model
  } catch (e) {
    console.error('updateWildcardsFromText failed:', e)
    wildcardNameIndex = new Map()
    wildcardModel = fromYAML('')
  }
  updateCombinedTags()
}

// Public helper to re-fetch wildcards from server and refresh combined tags
export async function refreshWildcardsFromServer() {
  try {
    const res = await fetch('/api/wildcards')
    const text = await res.text()
    // Reuse common updater to parse and set state
    updateWildcardsFromText(text)
  } catch (e) {
    console.error('refreshWildcardsFromServer failed:', e)
    // On fetch failure, reset state
    wildcardNameIndex = new Map()
    wildcardModel = fromYAML('')
    updateCombinedTags()
  }
}

// Expose the parsed TreeModel for consumers that need structure-based logic
export function getWildcardModel(): TreeModel {
  return wildcardModel
}

// Public helper to check if a wildcard name corresponds to an array node
export function isWildcardArray(tag: string): boolean {
  // Fast path using the name → kind index
  return wildcardNameIndex.get(tag) === 'array'
}

// Shared store for auto-completion tags
import { get, writable } from 'svelte/store'
import { fromYAML } from '../TreeEdit/yaml-io'
import type { AnyNode, TreeModel } from '../TreeEdit/model'

let tags: string[] = []
let wildcardNames: string[] = []
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
          wildcardNames = extractWildcardNames(text)
        } catch (e) {
          console.error('Failed to parse wildcards.yaml:', e)
          wildcardNames = []
        }
      } else {
        // If not found or failed, fall back to empty
        wildcardNames = []
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
  const newCombinedTags = [...new Set([...(wildcardNames || []), ...(tags || [])])]

  // Update the store and notify subscribers
  combinedTags.set(newCombinedTags)

  return newCombinedTags
}

// Check if a tag is a custom tag
export function isCustomTag(tag: string): boolean {
  return (wildcardNames || []).includes(tag)
}

// Extract wildcard names from wildcards.yaml text
function extractWildcardNames(text: string): string[] {
  try {
    const model: TreeModel = fromYAML(text ?? '')
    const nodes = model.nodes
    const names = new Set<string>()

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
        names.add(node.name)
        continue
      }

      // For leaf nodes, include only if parent is an object (i.e., a real key),
      // and exclude array indices like '0', '1', ...
      if (isLeaf(node) && node.parentId) {
        const parent = nodes[node.parentId]
        if (parent && parent.kind === 'object') {
          names.add(node.name)
        }
      }
    }

    return Array.from(names)
  } catch (e) {
    console.error('extractWildcardNames error:', e)
    return []
  }
}

// Public helper to refresh wildcards from provided YAML text
export function updateWildcardsFromText(text: string) {
  try {
    wildcardNames = extractWildcardNames(text)
  } catch (e) {
    console.error('updateWildcardsFromText failed:', e)
    wildcardNames = []
  }
  updateCombinedTags()
}

// Public helper to re-fetch wildcards from server and refresh combined tags
export async function refreshWildcardsFromServer() {
  try {
    const res = await fetch('/api/wildcards')
    const text = await res.text()
    wildcardNames = extractWildcardNames(text)
  } catch (e) {
    console.error('refreshWildcardsFromServer failed:', e)
    wildcardNames = []
  }
  updateCombinedTags()
}

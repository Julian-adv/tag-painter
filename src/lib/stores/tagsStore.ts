// Shared store for auto-completion tags
import { get, writable } from 'svelte/store'
import { fromYAML } from '../TreeEdit/yaml-io'
import { fetchWildcardsText } from '../api/wildcards'
import type { AnyNode, TreeModel } from '../TreeEdit/model'
import type { TagType } from '$lib/types'
import { CONSISTENT_RANDOM_MARKER } from '$lib/constants'

let tags: string[] = []
// Names present in wildcards.yaml (containers + selected leaf keys)
let wildcardNameSet: Set<string> = new Set()
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
        fetchWildcardsText()
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

      if (wcRes.status === 'fulfilled') {
        try {
          const text = wcRes.value ?? ''
          wildcardModel = fromYAML(text)
          wildcardNameSet = computeWildcardNames(wildcardModel)
        } catch (e) {
          console.error('Failed to parse wildcards.yaml:', e)
          wildcardNameSet = new Set()
          wildcardModel = fromYAML('')
        }
      } else {
        // If failed, fall back to empty
        wildcardNameSet = new Set()
        wildcardModel = fromYAML('')
        console.error('Failed to load wildcards.yaml:', wcRes.reason)
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
  const newCombinedTags = [...wildcardNameSet, ...(tags || [])]

  // Update the store and notify subscribers
  combinedTags.set(newCombinedTags)

  return newCombinedTags
}

// Check if a tag is a custom tag
export function isCustomTag(tag: string): boolean {
  return wildcardNameSet.has(tag)
}

// Compute wildcard names from the model: include container keys and leaf keys under objects
function computeWildcardNames(model: TreeModel): Set<string> {
  const names = new Set<string>()
  const nodes = model.nodes
  for (const node of Object.values(nodes)) {
    if (node.name === 'root') continue
    if (node.kind === 'ref') continue
    if (node.kind === 'object' || node.kind === 'array') {
      names.add(node.name)
      continue
    }
    if (node.kind === 'leaf' && node.parentId) {
      const parent = nodes[node.parentId]
      if (parent && parent.kind === 'object') names.add(node.name)
    }
  }
  return names
}

// Public helper to refresh wildcards from provided YAML text
export function updateWildcardsFromText(text: string) {
  try {
    wildcardModel = fromYAML(text ?? '')
    wildcardNameSet = computeWildcardNames(wildcardModel)
  } catch (e) {
    console.error('updateWildcardsFromText failed:', e)
    wildcardNameSet = new Set()
    wildcardModel = fromYAML('')
  }
  updateCombinedTags()
}

// Public helper to re-fetch wildcards from server and refresh combined tags
export async function refreshWildcardsFromServer() {
  try {
    const text = await fetchWildcardsText()
    updateWildcardsFromText(text)
  } catch (e) {
    console.error('refreshWildcardsFromServer failed:', e)
    wildcardNameSet = new Set()
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
  const symId = wildcardModel.symbols[tag]
  const node = symId ? wildcardModel.nodes[symId] : undefined
  return !!node && node.kind === 'array'
}

// Determine tag type using wildcards.yaml structure
export function wildcardTagType(name: string): TagType {
  // If not an array node, treat as regular
  const symId = wildcardModel.symbols[name]
  let node: AnyNode | undefined = symId ? wildcardModel.nodes[symId] : undefined
  if (!node) {
    for (const n of Object.values(wildcardModel.nodes)) {
      if (n.name === name) {
        node = n
        break
      }
    }
  }
  if (!node || node.kind !== 'array') return 'regular'

  // Check first child for consistent-random directive
  const children = node.children
  if (children && children.length > 0) {
    const first = wildcardModel.nodes[children[0]]
    if (first && first.kind === 'leaf' && typeof first.value === 'string') {
      if (first.value === CONSISTENT_RANDOM_MARKER) return 'consistent-random'
    }
  }
  return 'random'
}

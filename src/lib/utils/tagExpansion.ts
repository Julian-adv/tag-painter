/**
 * Tag expansion utilities using TreeModel (wildcards.yaml)
 */

import type { AnyNode, TreeModel } from '$lib/TreeEdit/model'
import { testModeStore } from '../stores/testModeStore.svelte'

/**
 * Generate a cryptographically secure random number for better randomness
 */
function getSecureRandomIndex(max: number): number {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return array[0] % max
}

/**
 * Helper function to handle random tag selection and expansion
 */
// CustomTag branch removed — we only support TreeModel-driven expansion.

/**
 * Parse weight from tag string
 */
function parseTagWithWeight(tagString: string): { name: string; weight?: number } {
  const weightMatch = tagString.match(/^(.+):(\d+(?:\.\d+)?)$/)
  if (weightMatch) {
    const [, name, weightStr] = weightMatch
    const weight = parseFloat(weightStr)
    return { name, weight: weight !== 1.0 ? weight : undefined }
  }
  return { name: tagString }
}

/**
 * Apply weight formatting to a tag name
 */
function applyWeight(tagName: string, weight?: number): string {
  if (!weight || weight === 1.0) {
    return tagName
  }
  return `(${tagName}:${weight})`
}

/**
 * Expand custom tags to their constituent tags recursively
 */
export function expandCustomTags(
  tags: string[],
  model: TreeModel,
  visitedTags: Set<string> = new Set(),
  existingRandomResolutions: Record<string, string> = {},
  previousZoneRandomResults: Record<string, string> = {}
): {
  expandedTags: string[]
  randomTagResolutions: Record<string, string>
} {
  const expandedTags: string[] = []
  const randomTagResolutions: Record<string, string> = {}
  // Model is the sole source of truth

  function findNodeByName(m: TreeModel, name: string): AnyNode | undefined {
    // Prefer a direct symbol match first (objects), fallback to first node with the same name
    const symId = m.symbols[name]
    if (symId) return m.nodes[symId]
    for (const n of Object.values(m.nodes)) {
      if (n.name === name) return n
    }
    return undefined
  }

  function expandNodeOnce(m: TreeModel, node: AnyNode): string[] {
    if (node.kind === 'leaf') {
      const val = node.value
      return [String(val)]
    }
    if (node.kind === 'ref') {
      const refName = node.refName
      const target = findNodeByName(m, refName)
      if (!target) return [refName]
      return expandNodeOnce(m, target)
    }
    // For object/array nodes that are not directly expanded here, return their name as a regular tag
    return [node.name]
  }

  function expandRandomArrayTag(
    tag: string,
    m: TreeModel,
    visited: Set<string>
  ): { expandedTags: string[]; resolution: string } {
    // Check overrides or previous results
    let selected: string | null = null
    const overrideTag = testModeStore[tag]?.overrideTag
    if (overrideTag) {
      selected = overrideTag
    } else if (previousZoneRandomResults[tag]) {
      const previousResult = previousZoneRandomResults[tag]
      const previousTags = previousResult.split(', ')
      return { expandedTags: previousTags, resolution: previousResult }
    }

    // Compute candidate options from array children
    const arrNode = findNodeByName(m, tag)
    if (!arrNode || arrNode.kind !== 'array') {
      // Fallback to regular behavior
      return { expandedTags: [tag], resolution: tag }
    }
    const children = arrNode.children
    let startIndex = 0
    let isConsistent = false
    if (children.length > 0) {
      const first = m.nodes[children[0]]
      if (first && first.kind === 'leaf' && typeof first.value === 'string') {
        if (first.value === '__consistent-random__') {
          isConsistent = true
          startIndex = 1
        }
      }
    }
    const options: string[] = []
    for (let i = startIndex; i < children.length; i++) {
      const cid = children[i]
      const childNode = m.nodes[cid]
      if (!childNode) continue
      const tokens = expandNodeOnce(m, childNode)
      // Join tokens for a single option (keeps comma-containing strings intact as single unit)
      options.push(tokens.join(', '))
    }
    if (options.length === 0) return { expandedTags: [], resolution: '' }

    // Select option if not fixed by override/previous
    if (!selected) {
      // For consistent-random, reuse existing resolution if provided
      if (isConsistent && existingRandomResolutions[tag]) {
        selected = existingRandomResolutions[tag]
      }
    }

    if (!selected) {
      const idx = getSecureRandomIndex(options.length)
      selected = options[idx]
    }

    // Recursively expand the selected option (to resolve any nested wildcard names)
    const recursive = expandCustomTags(
      [selected!],
      m,
      visited,
      existingRandomResolutions,
      previousZoneRandomResults
    )
    return { expandedTags: recursive.expandedTags, resolution: recursive.expandedTags.join(', ') }
  }

  for (const tagString of tags) {
    const { name: tag, weight: tagWeight } = parseTagWithWeight(tagString)

    // Prevent infinite recursion by tracking visited tags
    if (visitedTags.has(tag)) {
      console.warn(`Circular reference detected for tag: ${tag}`)
      continue
    }

    // Branch: TreeModel-driven expansion
    const node = findNodeByName(model, tag)
    if (node && node.kind === 'array') {
      visitedTags.add(tag)
      const result = expandRandomArrayTag(tag, model, visitedTags)
      if (tagWeight) {
        const weightedExpansion = applyWeight(result.expandedTags.join(', '), tagWeight)
        expandedTags.push(weightedExpansion)
        randomTagResolutions[tag] = result.expandedTags.join(', ')
      } else {
        expandedTags.push(...result.expandedTags)
        randomTagResolutions[tag] = result.resolution
      }
      visitedTags.delete(tag)
      continue
    }

    // Not an array wildcard or not found: treat as regular tag for now
    if (tagWeight) {
      expandedTags.push(applyWeight(tag, tagWeight))
    } else {
      expandedTags.push(tag)
    }
  }

  return { expandedTags, randomTagResolutions }
}

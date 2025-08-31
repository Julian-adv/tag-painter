/**
 * Tag expansion utilities using TreeModel (wildcards.yaml)
 */

import type { AnyNode, TreeModel } from '$lib/TreeEdit/model'
import { CONSISTENT_RANDOM_MARKER } from '$lib/constants'
import { testModeStore } from '../stores/testModeStore.svelte'
import { findNodeByName } from '$lib/TreeEdit/utils'

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
 * Expand custom tags to their constituent tags recursively.
 *
 * Parameters:
 * - tags: Input tag strings (may include weights like "name:1.2" and placeholders like "__Name__").
 * - model: TreeModel from wildcards.yaml; source of array/ref/leaf structures.
 * - visitedTags: Tracks tags during this call to prevent circular references. Pass a fresh Set().
 * - existingRandomResolutions: Decisions made earlier in this run (e.g., ALL → FIRST/SECOND). Used to
 *   keep consistent-random tags identical across zones in the same generation. Only applied when the
 *   target array is marked consistent (CONSISTENT_RANDOM_MARKER).
 * - previousRunResults: Decisions from a previous generation pass (regen). Used to keep the
 *   same zone stable across regenerations; takes precedence after explicit overrides.
 *
 * Returns:
 * - expandedTags: Final list of tags after full placeholder expansion.
 * - randomTagResolutions: Map of array tag name → fully-expanded chosen value (no placeholders).
 */
export function expandCustomTags(
  tags: string[],
  model: TreeModel,
  visitedTags: Set<string> = new Set(),
  existingRandomResolutions: Record<string, string> = {},
  previousRunResults: Record<string, string> = {}
): {
  expandedTags: string[]
  randomTagResolutions: Record<string, string>
} {
  let expandedTags: string[] = []
  const randomTagResolutions: Record<string, string> = {}
  // Model is the sole source of truth

  // Recursively expand placeholders like __Name__ in a set of strings until stable.
  function expandPlaceholdersDeep(
    inputs: string[],
    m: TreeModel,
    visited: Set<string>,
    existing: Record<string, string>,
    previousRun: Record<string, string>,
    resolutionsAcc: Record<string, string>
  ): string[] {
    const placeholderAny = /__([\p{L}\p{N}_\- ]+)__/gu
    let out = inputs.slice()
    let safetyCounter = 0
    while (safetyCounter < 100) {
      safetyCounter++
      let changed = false
      const next: string[] = []
      for (const t of out) {
        if (placeholderAny.test(t)) {
          let merged = t
          placeholderAny.lastIndex = 0
          merged = merged.replace(placeholderAny, (_full, name: string) => {
            const nested = expandCustomTags(
              [name],
              m,
              visited,
              { ...existing, ...resolutionsAcc },
              previousRun
            )
            for (const [k, v] of Object.entries(nested.randomTagResolutions)) {
              resolutionsAcc[k] = v
            }
            changed = true
            return nested.expandedTags.join(', ')
          })
          next.push(merged)
        } else {
          next.push(t)
        }
      }
      out = next
      if (!changed) break
    }
    return out
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
    m: TreeModel
  ): { expandedTags: string[]; resolution: string } {
    // Check overrides or previous results
    let selected: string | null = null
    const overrideTag = testModeStore[tag]?.overrideTag
    if (overrideTag) {
      selected = overrideTag
    } else if (previousRunResults[tag]) {
      const previousResult = previousRunResults[tag]
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
        if (first.value === CONSISTENT_RANDOM_MARKER) {
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
      // Only reuse prior zone decisions for consistent-random arrays
      if (isConsistent && existingRandomResolutions[tag]) {
        selected = existingRandomResolutions[tag]
      }
      // Within the same expansion call, keep consistent-random stable if already chosen
      if (!selected && isConsistent && randomTagResolutions[tag]) {
        selected = randomTagResolutions[tag]
      }
    }

    if (!selected) {
      const idx = getSecureRandomIndex(options.length)
      selected = options[idx]
    }

    // Defer placeholder expansion; return raw selection and let caller fully expand
    return { expandedTags: [selected!], resolution: selected! }
  }

  function expandRandomObjectOfArraysTag(
    tag: string,
    m: TreeModel
  ): { expandedTags: string[]; resolution: string } {
    // Try previous run resolution for this object tag
    if (previousRunResults[tag]) {
      const previousResult = previousRunResults[tag]
      const previousTags = previousResult.split(', ')
      return { expandedTags: previousTags, resolution: previousResult }
    }

    const node = findNodeByName(m, tag)
    if (!node || node.kind !== 'object') return { expandedTags: [tag], resolution: tag }

    // Collect all descendant arrays (depth-first) under this object
    const arrays: AnyNode[] = []
    const seen = new Set<string>()
    const stack: string[] = [...(node.children || [])]
    while (stack.length) {
      const cid = stack.pop() as string
      if (seen.has(cid)) continue
      seen.add(cid)
      const child = m.nodes[cid]
      if (!child) continue
      if (child.kind === 'array') {
        arrays.push(child)
      } else if (child.kind === 'object') {
        stack.push(...(child.children || []))
      }
    }
    if (arrays.length === 0) return { expandedTags: [tag], resolution: tag }

    // Choose one descendant array at random and expand it using the array logic
    const idx = getSecureRandomIndex(arrays.length)
    const chosenArray = arrays[idx]
    const result = expandRandomArrayTag(chosenArray.name, m)
    return { expandedTags: result.expandedTags, resolution: result.resolution }
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
      const result = expandRandomArrayTag(tag, model)
      // 2. Fully expand placeholders like __b__ inside the chosen option(s)
      const finalized = expandPlaceholdersDeep(
        result.expandedTags,
        model,
        visitedTags,
        { ...existingRandomResolutions, ...randomTagResolutions },
        previousRunResults,
        randomTagResolutions
      )
      if (tagWeight) {
        const weightedExpansion = applyWeight(finalized.join(', '), tagWeight)
        expandedTags.push(weightedExpansion)
        // 3. Remember fully expanded text for this tag
        randomTagResolutions[tag] = finalized.join(', ')
      } else {
        expandedTags.push(...finalized)
        // 3. Remember fully expanded text for this tag
        randomTagResolutions[tag] = finalized.join(', ')
      }
      visitedTags.delete(tag)
      continue
    }
    // Treat any object as a random tag by choosing from its descendant arrays
    if (node && node.kind === 'object') {
      visitedTags.add(tag)
      const result = expandRandomObjectOfArraysTag(tag, model)
      const finalized = expandPlaceholdersDeep(
        result.expandedTags,
        model,
        visitedTags,
        { ...existingRandomResolutions, ...randomTagResolutions },
        previousRunResults,
        randomTagResolutions
      )
      if (tagWeight) {
        const weightedExpansion = applyWeight(finalized.join(', '), tagWeight)
        expandedTags.push(weightedExpansion)
        randomTagResolutions[tag] = finalized.join(', ')
      } else {
        expandedTags.push(...finalized)
        randomTagResolutions[tag] = finalized.join(', ')
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

  // 4. Final global pass for any regular tags that may contain placeholders
  expandedTags = expandPlaceholdersDeep(
    expandedTags,
    model,
    visitedTags,
    { ...existingRandomResolutions, ...randomTagResolutions },
    previousRunResults,
    randomTagResolutions
  )

  return { expandedTags, randomTagResolutions }
}

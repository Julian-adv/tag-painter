/**
 * Tag expansion utilities using TreeModel (wildcards.yaml)
 */

import type { AnyNode, TreeModel } from '$lib/TreeEdit/model'
import { CONSISTENT_RANDOM_MARKER, DEFAULT_ARRAY_WEIGHT } from '$lib/constants'
import { testModeStore } from '../stores/testModeStore.svelte'
import { findNodeByName, extractDisablesDirective } from '$lib/TreeEdit/utils'

// Core context and helpers extracted for clarity
type DisabledContext = { names: Set<string>; patterns: string[] }
type TagExpansionCtx = {
  model: TreeModel
  visitedTags: Set<string>
  existingRandomResolutions: Record<string, string>
  previousRunResults: Record<string, string>
  randomTagResolutions: Record<string, string>
  disables: DisabledContext
  overrideMap: Record<string, string>
}

function getLeafValueById(model: TreeModel, leafId: string): string {
  const n = model.nodes[leafId]
  if (n && n.kind === 'leaf') return String(n.value)
  return ''
}

function getNodePath(model: TreeModel, id: string): string {
  const parts: string[] = []
  let cur = model.nodes[id]
  while (cur && cur.parentId) {
    parts.push(cur.name)
    cur = model.nodes[cur.parentId]
  }
  parts.reverse()
  if (parts[0] === 'root') parts.shift()
  return parts.join('/')
}

// Check if a tag is disabled by name or path
function isTagDisabled(disabledNames: Set<string>, tagOrPath: string): boolean {
  const tagLower = tagOrPath.toLowerCase()
  if (disabledNames.has(tagLower)) return true

  for (const d of disabledNames) {
    if (d && tagLower.startsWith(d + '/')) {
      return true
    }
  }
  return false
}

// Common function to process array/object node expansion
function processNodeExpansion(
  ctx: TagExpansionCtx,
  tag: string,
  tagWeight: number | undefined,
  expandFn: (ctx: TagExpansionCtx, tag: string) => { expandedTags: string[]; resolution: string },
  out: string[]
): void {
  ctx.visitedTags.add(tag)
  const result = expandFn(ctx, tag)
  // Pass ctx.randomTagResolutions by reference so nested placeholder
  // expansions contribute their resolutions to the shared map.
  const finalized = expandPlaceholders(ctx, result.expandedTags, ctx.randomTagResolutions)
  // Extract disables info without removing directives
  extractDisablesInfo(ctx, finalized)
  // Store the placeholder-expanded resolution WITH disables directive
  ctx.randomTagResolutions[tag] = finalized.join(', ')
  // Add to output WITHOUT removing disables directive
  const finalizedText = finalized.join(', ')
  if (tagWeight) out.push(applyWeight(finalizedText, tagWeight))
  else out.push(finalizedText)
  ctx.visitedTags.delete(tag)
}

// Build a unified override map from testModeStore pins/overrides and previous run results
function buildOverrideMap(
  model: TreeModel,
  previousRunResults: Record<string, string>
): Record<string, string> {
  const map: Record<string, string> = {}
  // 1) Path-scoped pins/overrides from test mode
  for (const key of Object.keys(testModeStore)) {
    const s = testModeStore[key]
    if (!s || !s.enabled) {
      continue
    }
    let v: string | undefined = undefined
    if (s.overrideTag) {
      const overrideStr = String(s.overrideTag).trim()
      if (overrideStr) v = overrideStr
    } else if (s.pinnedLeafId) {
      v = getLeafValueById(model, s.pinnedLeafId)
    }
    if (v && v.trim()) {
      map[key] = v
    }
  }
  // 2) Previous run results (do not override explicit pins)
  for (const [k, v] of Object.entries(previousRunResults || {})) {
    if (map[k]) continue
    if (v && String(v).trim()) map[k] = String(v)
  }
  return map
}

function extractDisablesInfo(ctx: TagExpansionCtx, values: string[]): void {
  // Only extract disables information without removing directives
  for (const val of values) {
    const items = extractDisablesDirective(String(val))
    if (items.length) {
      for (const it of items) {
        const maybeNode = findNodeByName(ctx.model, it)
        if (maybeNode) {
          ctx.disables.names.add(it)
        } else {
          ctx.disables.names.add(it)
          ctx.disables.patterns.push(it)
        }
      }
    }
  }
}

/**
 * Clean all directives (disables, composition, etc.) from expanded tag strings before sending to ComfyUI
 */
export function cleanDirectivesFromTags(tagsText: string): string {
  if (!tagsText) return tagsText

  // Remove disables directives
  let cleaned = tagsText.replace(/,?\s*disables=\[[^\]]*\]/g, '')

  // Remove composition directives
  cleaned = cleaned.replace(/,?\s*composition=\w+/g, '')

  // Remove weight directives
  cleaned = cleaned.replace(/,?\s*weight=\d+(?:\.\d+)?/gi, '')

  // Clean up any double commas or extra spaces
  cleaned = cleaned.replace(/,\s*,/g, ',')
  cleaned = cleaned.replace(/^\s*,\s*|\s*,\s*$/g, '')
  cleaned = cleaned.replace(/\s+/g, ' ')

  return cleaned.trim()
}

function expandNodeOnce(ctx: TagExpansionCtx, node: AnyNode): string[] {
  if (node.kind === 'leaf') {
    // Return raw value including weight directives; they will be cleaned later before ComfyUI
    return [String(node.value)]
  }
  if (node.kind === 'ref') {
    const target = findNodeByName(ctx.model, node.refName)
    if (!target) return [node.refName]
    return expandNodeOnce(ctx, target)
  }
  return [node.name]
}

function expandPlaceholders(
  ctx: TagExpansionCtx,
  inputs: string[],
  resolutionsAcc: Record<string, string>
): string[] {
  const placeholderAny = /__([\p{L}\p{N}_\- /]+)__/gu
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
            ctx.model,
            ctx.visitedTags,
            { ...ctx.existingRandomResolutions, ...resolutionsAcc },
            ctx.previousRunResults,
            ctx.disables
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

function expandArrayNode(
  ctx: TagExpansionCtx,
  tag: string
): { expandedTags: string[]; resolution: string } {
  let selected: string | null = null
  // Exact path/name override from unified map
  if (ctx.overrideMap[tag]) selected = ctx.overrideMap[tag]
  if (!selected && ctx.existingRandomResolutions[tag]) {
    // Use existing resolution from consistent-random, which may contain disables
    const existingResult = ctx.existingRandomResolutions[tag]
    const existingTags = existingResult.split(', ')
    return { expandedTags: existingTags, resolution: existingResult }
  }
  if (!selected && ctx.previousRunResults[tag]) {
    const previousResult = ctx.previousRunResults[tag]
    const previousTags = previousResult.split(', ')
    return { expandedTags: previousTags, resolution: previousResult }
  }
  const arrNode = findNodeByName(ctx.model, tag)
  if (!arrNode || arrNode.kind !== 'array') return { expandedTags: [tag], resolution: tag }
  const children = arrNode.children
  let startIndex = 0
  let isConsistent = false
  if (children.length > 0) {
    const first = ctx.model.nodes[children[0]]
    if (first && first.kind === 'leaf' && typeof first.value === 'string') {
      const v = String(first.value)
      if (v === CONSISTENT_RANDOM_MARKER || v === '__CONSISTENT_RANDOM_MARKER__') {
        isConsistent = true
        startIndex = 1
      }
    }
  }
  const options: { content: string; weight: number }[] = []
  for (let i = startIndex; i < children.length; i++) {
    const cid = children[i]
    const childNode = ctx.model.nodes[cid]
    if (!childNode) continue
    const tokens = expandNodeOnce(ctx, childNode)
    const candidate = tokens.join(', ')
    if (ctx.disables.patterns.length) {
      const lower = candidate.toLowerCase()
      const blocked = ctx.disables.patterns.some((p) => lower.includes(p.toLowerCase()))
      if (blocked) continue
    }
    const weight = getOptionWeight(ctx, childNode)
    options.push({ content: candidate, weight })
  }
  if (options.length === 0) return { expandedTags: [], resolution: '' }
  if (!selected) {
    if (isConsistent && ctx.existingRandomResolutions[tag])
      selected = ctx.existingRandomResolutions[tag]
    if (!selected && isConsistent && ctx.randomTagResolutions[tag])
      selected = ctx.randomTagResolutions[tag]
  }
  if (!selected) {
    const idx = getWeightedRandomIndex(options)
    selected = options[idx].content
  }
  return { expandedTags: [selected!], resolution: selected! }
}

function expandObjectNode(
  ctx: TagExpansionCtx,
  tag: string
): { expandedTags: string[]; resolution: string } {
  if (ctx.overrideMap[tag])
    return { expandedTags: [ctx.overrideMap[tag]], resolution: ctx.overrideMap[tag] }
  if (ctx.previousRunResults[tag]) {
    const previousResult = ctx.previousRunResults[tag]
    const previousTags = previousResult.split(', ')
    return { expandedTags: previousTags, resolution: previousResult }
  }
  const node = findNodeByName(ctx.model, tag)
  if (!node || node.kind !== 'object') return { expandedTags: [tag], resolution: tag }
  const arrays: AnyNode[] = []
  const seen = new Set<string>()
  const stack: string[] = [...(node.children || [])]
  while (stack.length) {
    const cid = stack.pop() as string
    if (seen.has(cid)) continue
    seen.add(cid)
    const child = ctx.model.nodes[cid]
    if (!child) continue
    if (child.kind === 'array') arrays.push(child)
    else if (child.kind === 'object') stack.push(...(child.children || []))
  }
  if (arrays.length === 0) return { expandedTags: [tag], resolution: tag }
  // Prefer descendant array whose full path has an explicit override/pin
  for (const arr of arrays) {
    const preferredPath = getNodePath(ctx.model, arr.id)
    if (ctx.overrideMap[preferredPath]) {
      const preferred = expandArrayNode(ctx, preferredPath)
      return { expandedTags: preferred.expandedTags, resolution: preferred.resolution }
    }
  }
  if (ctx.disables.names.size > 0) {
    const disabledLower = new Set(Array.from(ctx.disables.names, (s) => s.toLowerCase()))
    for (let i = arrays.length - 1; i >= 0; i--) {
      const arr = arrays[i]
      const p = getNodePath(ctx.model, arr.id)
      // Remove if the exact array path is disabled or any ancestor container is disabled
      if (isTagDisabled(disabledLower, p)) {
        arrays.splice(i, 1)
      }
    }
  }
  if (arrays.length === 0) return { expandedTags: [tag], resolution: tag }
  const idx = getSecureRandomIndex(arrays.length)
  const chosenArray = arrays[idx]
  const chosenPath = getNodePath(ctx.model, chosenArray.id)
  const result = expandArrayNode(ctx, chosenPath)
  return { expandedTags: result.expandedTags, resolution: result.resolution }
}

/**
 * Parse weight directive from text content
 */
export function parseWeightDirective(content: string): number {
  const trimmed = String(content || '').trim()
  if (!trimmed) return DEFAULT_ARRAY_WEIGHT

  // Look for weight=xx directive
  const weightMatch = trimmed.match(/weight=(\d+(?:\.\d+)?)/i)

  if (weightMatch) {
    return parseFloat(weightMatch[1])
  }

  return DEFAULT_ARRAY_WEIGHT
}

/**
 * Get the weight for an array option
 */
function getOptionWeight(ctx: TagExpansionCtx, childNode: AnyNode): number {
  if (childNode.kind === 'leaf') {
    return parseWeightDirective(String(childNode.value))
  }
  return DEFAULT_ARRAY_WEIGHT
}

/**
 * Perform weighted random selection from array options
 */
function getWeightedRandomIndex(options: { content: string; weight: number }[]): number {
  if (options.length === 0) return 0
  if (options.length === 1) return 0

  // Calculate total weight
  const totalWeight = options.reduce((sum, option) => sum + option.weight, 0)
  if (totalWeight <= 0) {
    // Fallback to uniform random if all weights are zero
    return getSecureRandomIndex(options.length)
  }

  // Generate random number between 0 and totalWeight
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  const random = (array[0] / 0xffffffff) * totalWeight

  // Find the selected option
  let accumulator = 0
  for (let i = 0; i < options.length; i++) {
    accumulator += options[i].weight
    if (random <= accumulator) {
      return i
    }
  }

  // Fallback (should not happen with proper weights)
  return options.length - 1
}

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
 * Detect composition type from expanded tags
 */
export function detectCompositionFromTags(expandedTags: string[]): string | null {
  // Join all tags into a single string for pattern matching
  const allTagsText = expandedTags.join(', ').toLowerCase()

  // Check for composition patterns in the expanded tags
  if (allTagsText.includes('composition=all')) {
    return 'all'
  }
  if (allTagsText.includes('composition=2h')) {
    return 'left-horizontal'
  }
  if (allTagsText.includes('composition=2v')) {
    return 'top-vertical'
  }

  return null
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
 * - disabledContext: Accumulator for the disables directive discovered during expansion.
 *   - names: exact node names to blank when those tags are expanded.
 *   - patterns: case-insensitive substrings to avoid when choosing random array options.
 *   If undefined, a fresh context is created and shared with nested expansions.
 *
 * Returns:
 * - expandedTags: Final list of tags after full placeholder expansion (directives removed).
 * - randomTagResolutions: Map of array tag name → fully-expanded chosen value (no placeholders).
 */
export function expandCustomTags(
  tags: string[],
  model: TreeModel,
  visitedTags: Set<string> = new Set(),
  existingRandomResolutions: Record<string, string> = {},
  previousRunResults: Record<string, string> = {},
  disabledContext: { names: Set<string>; patterns: string[] } | undefined = undefined
): { expandedTags: string[]; randomTagResolutions: Record<string, string> } {
  const ctx: TagExpansionCtx = {
    model,
    visitedTags,
    existingRandomResolutions,
    previousRunResults,
    randomTagResolutions: {},
    disables: disabledContext || { names: new Set<string>(), patterns: [] },
    overrideMap: buildOverrideMap(model, previousRunResults)
  }

  // Extract disables from existingRandomResolutions to handle cross-zone disabling
  if (existingRandomResolutions) {
    Object.values(existingRandomResolutions).forEach((resolution) => {
      extractDisablesInfo(ctx, [resolution])
    })
  }

  let out: string[] = []
  for (const tagString of tags) {
    const { name: tag, weight: tagWeight } = parseTagWithWeight(tagString)

    // Early skip: if this tag name or any of its descendant paths are disabled
    // Recompute disablesLower each time since ctx.disables.names can be updated by nested calls
    const currentDisablesLower = new Set(Array.from(ctx.disables.names, (s) => s.toLowerCase()))
    if (isTagDisabled(currentDisablesLower, tag)) {
      continue
    }
    if (ctx.visitedTags.has(tag)) {
      console.warn(`Circular reference detected for tag: ${tag}`)
      continue
    }

    const node = findNodeByName(model, tag)
    if (node && node.kind === 'array') {
      processNodeExpansion(ctx, tag, tagWeight, expandArrayNode, out)
      continue
    }

    if (node && node.kind === 'object') {
      processNodeExpansion(ctx, tag, tagWeight, expandObjectNode, out)
      continue
    }

    if (tagWeight) out.push(applyWeight(tag, tagWeight))
    else out.push(tag)
  }

  out = out.filter((t) => String(t ?? '').trim().length > 0)

  return { expandedTags: out, randomTagResolutions: ctx.randomTagResolutions }
}

/**
 * Tag expansion utilities using TreeModel (wildcards.yaml)
 */

import type { AnyNode, TreeModel } from '$lib/TreeEdit/model'
import {
  CONSISTENT_RANDOM_MARKER,
  DEFAULT_ARRAY_WEIGHT,
  createPlaceholderRegex
} from '$lib/constants'
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

function getLeafValueByPath(model: TreeModel, leafPath: string): string {
  // Split path into parts and traverse manually
  const parts = leafPath.split('/')
  let currentNode = model.nodes[model.rootId]

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]

    if (!currentNode || (currentNode.kind !== 'array' && currentNode.kind !== 'object')) {
      return ''
    }

    const children = currentNode.children || []

    // Find child by name
    let foundChildId: string | null = null
    for (const childId of children) {
      const childNode = model.nodes[childId]
      if (childNode && childNode.name === part) {
        foundChildId = childId
        break
      }
    }

    if (!foundChildId) {
      return ''
    }

    currentNode = model.nodes[foundChildId]
  }

  if (currentNode && currentNode.kind === 'leaf') {
    return String(currentNode.value)
  }

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

// Check if a tag/container has any descendant array with an explicit override/pin
function hasPinnedDescendant(ctx: TagExpansionCtx, tagOrPath: string): boolean {
  const node = findNodeByName(ctx.model, tagOrPath)
  if (!node) return false
  // Only containers can have descendants
  if (!(node.kind === 'array' || node.kind === 'object')) return false
  const seen = new Set<string>()
  const stack: string[] = [...(node.children || [])]
  while (stack.length) {
    const cid = stack.pop() as string
    if (seen.has(cid)) continue
    seen.add(cid)
    const child = ctx.model.nodes[cid]
    if (!child) continue
    if (child.kind === 'array') {
      const p = getNodePath(ctx.model, child.id)
      if (ctx.overrideMap[p]) return true
    } else if (child.kind === 'object') {
      stack.push(...(child.children || []))
    }
  }
  return false
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
  expandFn: (ctx: TagExpansionCtx, tag: string) => { expandedTags: string[]; resolution: string }
): string {
  ctx.visitedTags.add(tag)
  const result = expandFn(ctx, tag)
  // Pass ctx.randomTagResolutions by reference so nested placeholder
  // expansions contribute their resolutions to the shared map.
  const finalized = expandPlaceholders(ctx, result.expandedTags.join(', '), ctx.randomTagResolutions)
  // Extract disables info without removing directives
  extractDisablesInfo(ctx, finalized)

  // Store the placeholder-expanded resolution WITH disables directive
  ctx.randomTagResolutions[tag] = finalized
  // Create final text WITHOUT removing disables directive
  const resultText = tagWeight ? applyWeight(finalized, tagWeight) : finalized
  ctx.visitedTags.delete(tag)

  return resultText
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
    if (s.overrideTag && s.overrideTag.trim()) {
      const overrideStr = String(s.overrideTag).trim()
      v = overrideStr
    } else if (s.pinnedLeafPath) {
      v = getLeafValueByPath(model, s.pinnedLeafPath)
    }
    if (v && v.trim()) {
      map[key] = v
    }
  }
  // 2) Previous run results (do not override explicit pins)
  for (const [k, v] of Object.entries(previousRunResults || {})) {
    if (map[k]) continue
    if (v && String(v).trim()) map[k] = replaceWildcardsFromCache(String(v))
  }
  return map
}

function extractDisablesInfo(ctx: TagExpansionCtx, value: string): void {
  // Only extract disables information without removing directives
  const items = extractDisablesDirective(value)
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

  // Remove any unexpanded wildcards directives just in case
  cleaned = cleaned.replace(/,?\s*wildcards=[^,\s]+/gi, '')

  // Clean up any double commas or extra spaces
  cleaned = cleaned.replace(/,\s*,/g, ',')
  cleaned = cleaned.replace(/^\s*,\s*|\s*,\s*$/g, '')
  cleaned = cleaned.replace(/\s+/g, ' ')

  return cleaned.trim()
}

// --- Wildcard file lines caching (module-level) ---
const wildcardFileLinesCache = new Map<string, string[]>()
const wildcardFileLinesInFlight = new Map<string, Promise<string[]>>()

async function loadWildcardLines(name: string): Promise<string[]> {
  const cached = wildcardFileLinesCache.get(name)
  if (cached) return cached
  const inflight = wildcardFileLinesInFlight.get(name)
  if (inflight) return inflight
  const p = (async () => {
    try {
      const res = await fetch(`/api/wildcard-file?name=${encodeURIComponent(name)}`)
      if (!res.ok) return []
      const body = await res.text()
      const lines = body
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'))
      wildcardFileLinesCache.set(name, lines)
      return lines
    } catch {
      return []
    } finally {
      wildcardFileLinesInFlight.delete(name)
    }
  })()
  wildcardFileLinesInFlight.set(name, p)
  return p
}

function replaceWildcardsFromCache(text: string): string {
  if (!text || !/wildcards=/i.test(text)) return text
  const re = /wildcards=([^,\s]+)/gi
  return text.replace(re, (_full, name: string) => {
    const lines = wildcardFileLinesCache.get(name) || []
    if (lines.length === 0) return ''
    const idx = getSecureRandomIndex(lines.length)
    return lines[idx]
  })
}

function extractWildcardFilesFromText(text: string, out: Set<string>) {
  const re = /wildcards=([^,\s]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m[1]) out.add(m[1])
  }
}

function resolveLeafContent(ctx: TagExpansionCtx, rawValue: unknown): string {
  const text = String(rawValue ?? '')
  const expanded = expandChoicePatterns(text, ctx.disables)
  return replaceWildcardsFromCache(expanded)
}

function collectWildcardFilesFromNode(
  model: TreeModel,
  node: AnyNode | undefined,
  files: Set<string>,
  seen: Set<string>
) {
  if (!node) return
  if (seen.has(node.id)) return
  seen.add(node.id)

  if (node.kind === 'leaf') {
    const v = String(node.value)
    extractWildcardFilesFromText(v, files)
    return
  }
  if (node.kind === 'ref') {
    const target = findNodeByName(model, node.refName)
    collectWildcardFilesFromNode(model, target, files, seen)
    return
  }
  if (node.kind === 'array' || node.kind === 'object') {
    for (const cid of node.children || []) {
      collectWildcardFilesFromNode(model, model.nodes[cid], files, seen)
    }
  }
}

export async function prefetchWildcardFilesForTags(
  tags: string[],
  model: TreeModel
): Promise<void> {
  const files = new Set<string>()
  const seen = new Set<string>()
  for (const t of tags || []) {
    // Also collect files referenced directly in freeform tag strings
    extractWildcardFilesFromText(String(t), files)
    const node = findNodeByName(model, t)
    collectWildcardFilesFromNode(model, node, files, seen)
  }
  const toLoad = Array.from(files)
  await Promise.all(toLoad.map((f) => loadWildcardLines(f)))
}

export async function prefetchWildcardFilesFromTexts(texts: string[]): Promise<void> {
  const files = new Set<string>()
  for (const t of texts || []) {
    extractWildcardFilesFromText(String(t), files)
  }
  const toLoad = Array.from(files)
  await Promise.all(toLoad.map((f) => loadWildcardLines(f)))
}

/**
 * Resolve occurrences of "wildcards=filename.txt" by fetching data/filename.txt
 * and replacing each directive with a random non-empty, non-comment line.
 */
export async function resolveWildcardDirectives(
  text: string,
  presetChoices: Record<string, string> = {}
): Promise<string> {
  if (!text || !/wildcards=/i.test(text)) return text

  // Compile regex once
  const re = /wildcards=([^,\s]+)/gi

  // In-memory cache for wildcard file lines (per app session)
  // Key: file name, Value: array of non-empty, non-comment lines
  const linesCache: Record<string, string[]> = {}

  // Collect unique file names first so we can fetch each file only once
  const files: string[] = []
  {
    const seen = new Set<string>()
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const name = m[1]
      if (name && !seen.has(name)) {
        seen.add(name)
        files.push(name)
      }
    }
  }
  if (files.length === 0) return text

  // Fetch and cache file contents (trimmed, comments removed)
  await Promise.all(
    files.map(async (name) => {
      const lines = await loadWildcardLines(name)
      if (lines.length > 0) linesCache[name] = lines
    })
  )

  // Replace each occurrence independently:
  // - If presetChoices has a value for this file, use it.
  // - Otherwise, choose a random line per occurrence.
  re.lastIndex = 0
  return text.replace(re, (_full, name: string) => {
    const preset = presetChoices[name]
    if (preset) return preset
    const lines = linesCache[name] || []
    if (lines.length === 0) return ''
    const idx = getSecureRandomIndex(lines.length)
    return lines[idx]
  })
}

function expandNodeOnce(ctx: TagExpansionCtx, node: AnyNode): string[] {
  if (node.kind === 'leaf') {
    // Apply choice pattern and wildcard expansion to leaf values before returning
    return [resolveLeafContent(ctx, node.value)]
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
  input: string,
  resolutionsAcc: Record<string, string>
): string {
  // Match placeholders like __name__ using shared factory (non-greedy)
  const placeholderAny = createPlaceholderRegex()
  let result = input
  let safetyCounter = 0
  while (safetyCounter < 100) {
    safetyCounter++
    let changed = false

    if (placeholderAny.test(result)) {
      placeholderAny.lastIndex = 0
      result = result.replace(placeholderAny, (_full, name: string) => {
        const nested = expandCustomTags(
          name,
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
        return nested.expandedText
      })
    }

    if (!changed) break
  }
  return result
}

function expandArrayNode(
  ctx: TagExpansionCtx,
  tag: string
): { expandedTags: string[]; resolution: string } {
  // Check if this tag name is disabled
  if (ctx.disables.names.has(tag)) {
    return { expandedTags: [], resolution: '' }
  }

  let selected: string | null = null
  // Exact path/name override from unified map
  if (ctx.overrideMap[tag]) {
    selected = ctx.overrideMap[tag]
  }
  if (!selected && ctx.previousRunResults[tag]) {
    const previousResult = resolveLeafContent(ctx, ctx.previousRunResults[tag])
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

  // If no direct override selected, prefer options that lead to a pinned descendant
  if (!selected) {
    const placeholderAny = createPlaceholderRegex()

    function optionLeadsToPinned(content: string): boolean {
      // Check placeholders within the content
      if (placeholderAny.test(content)) {
        placeholderAny.lastIndex = 0
        let leads = false
        content.replace(placeholderAny, (full, name: string) => {
          if (leads) return full
          if (hasPinnedDescendant(ctx, name)) {
            leads = true
          }
          return full
        })
        if (leads) return true
      }
      // If content itself is a tag/container name, check it as well
      return hasPinnedDescendant(ctx, content)
    }

    const pinnedLeading = options
      .map((opt, idx) => ({ ...opt, idx }))
      .filter((opt) => optionLeadsToPinned(opt.content))

    if (pinnedLeading.length > 0) {
      // Choose among pinned-leading options using weights
      const idx = getWeightedRandomIndex(pinnedLeading)
      selected = pinnedLeading[idx].content
      return { expandedTags: [selected], resolution: selected }
    }
  }
  if (!selected && isConsistent) {
    if (ctx.existingRandomResolutions[tag]) selected = ctx.existingRandomResolutions[tag]
    if (!selected && ctx.randomTagResolutions[tag]) selected = ctx.randomTagResolutions[tag]
  }
  if (!selected) {
    const idx = getWeightedRandomIndex(options)
    selected = options[idx].content
  }
  const resolvedSelected = resolveLeafContent(ctx, selected!)
  return { expandedTags: [resolvedSelected], resolution: resolvedSelected }
}

function expandObjectNode(
  ctx: TagExpansionCtx,
  tag: string
): { expandedTags: string[]; resolution: string } {
  if (ctx.overrideMap[tag]) {
    const resolved = resolveLeafContent(ctx, ctx.overrideMap[tag])
    return { expandedTags: [resolved], resolution: resolved }
  }
  if (ctx.previousRunResults[tag]) {
    const previousResult = resolveLeafContent(ctx, ctx.previousRunResults[tag])
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
  // Prefer descendant arrays whose full path has an explicit override/pin.
  // If multiple, choose among them using weights.
  const pinnedArrays = arrays
    .map((arr) => ({
      arr,
      path: getNodePath(ctx.model, arr.id),
      weight: parseWeightDirective(arr.name)
    }))
    .filter(({ path }) => !!ctx.overrideMap[path])
  if (pinnedArrays.length > 0) {
    const idx = getWeightedRandomIndex(pinnedArrays)
    const chosen = pinnedArrays[idx]
    const preferred = expandArrayNode(ctx, chosen.path)
    return { expandedTags: preferred.expandedTags, resolution: preferred.resolution }
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

  // Use weighted selection for object children
  const options: { array: AnyNode; path: string; weight: number }[] = []
  for (const arr of arrays) {
    const path = getNodePath(ctx.model, arr.id)
    const weight = parseWeightDirective(arr.name)
    options.push({ array: arr, path, weight })
  }

  const idx = getWeightedRandomIndex(options)
  const chosenOption = options[idx]
  const result = expandArrayNode(ctx, chosenOption.path)
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
function getWeightedRandomIndex<T extends { weight: number }>(options: T[]): number {
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
 * Expand {a|b|c} patterns in leaf node values by randomly selecting one option
 */
function expandChoicePatterns(text: string, disables?: DisabledContext): string {
  const choicePattern = /\{([^}]+)\}/g

  return text.replace(choicePattern, (match, choices) => {
    const allOptions = choices.split('|')

    if (allOptions.length === 0) {
      return match // Return original if no valid options
    }

    if (allOptions.length === 1) {
      return allOptions[0] // Return single option directly
    }

    // Filter out disabled options if disables context is provided
    let validOptions = allOptions
    if (disables && disables.patterns.length > 0) {
      validOptions = allOptions.filter((option: string) => {
        const optionLower = option.toLowerCase()
        return !disables.patterns.some((pattern) => optionLower.includes(pattern.toLowerCase()))
      })
    }

    // If all options are disabled, return empty string
    if (validOptions.length === 0) {
      return ''
    }

    // Use secure random selection
    const randomIndex = getSecureRandomIndex(validOptions.length)
    return validOptions[randomIndex]
  })
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
 * - text: Input text string (may include tags separated by commas, weights like "name:1.2", placeholders like "__Name__", and choice patterns like "{a|b|c}").
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
 * - expandedText: Final text after full expansion (choice patterns, placeholders expanded, directives removed).
 * - randomTagResolutions: Map of array tag name → fully-expanded chosen value (no placeholders).
 */
export function expandCustomTags(
  text: string,
  model: TreeModel,
  visitedTags: Set<string> = new Set(),
  existingRandomResolutions: Record<string, string> = {},
  previousRunResults: Record<string, string> = {},
  disabledContext: { names: Set<string>; patterns: string[] } | undefined = undefined
): { expandedText: string; randomTagResolutions: Record<string, string> } {
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
      extractDisablesInfo(ctx, resolution)
    })
  }

  // Check if the text matches a single node name (for placeholder expansion)
  const trimmedText = text.trim()
  const node = findNodeByName(model, trimmedText)

  if (node && node.kind === 'array') {
    // Handle array node expansion using processNodeExpansion
    const result = processNodeExpansion(ctx, trimmedText, undefined, expandArrayNode)
    return { expandedText: result, randomTagResolutions: ctx.randomTagResolutions }
  }

  if (node && node.kind === 'object') {
    // Handle object node expansion using processNodeExpansion
    const result = processNodeExpansion(ctx, trimmedText, undefined, expandObjectNode)
    return { expandedText: result, randomTagResolutions: ctx.randomTagResolutions }
  }

  // Otherwise, treat as leaf node content - expand choice patterns and placeholders
  const expandedText = expandChoicePatterns(text, ctx.disables)
  const finalExpanded = expandPlaceholders(ctx, expandedText, ctx.randomTagResolutions)

  // Return the expanded result
  return { expandedText: finalExpanded, randomTagResolutions: ctx.randomTagResolutions }
}

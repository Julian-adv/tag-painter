/**
 * Tag expansion utilities using TreeModel (wildcards.yaml)
 */

import type { AnyNode, TreeModel } from '$lib/TreeEdit/model'
import type { TagResolution, TagResolutionMap } from '$lib/types'
import {
  CONSISTENT_RANDOM_MARKER,
  DEFAULT_ARRAY_WEIGHT,
  createPlaceholderRegex,
  createChoiceRegex
} from '$lib/constants'
import { testModeStore } from '../stores/testModeStore.svelte'
import { findNodeByName, extractDisablesDirective } from '$lib/TreeEdit/utils'
import {
  loadWildcardLines,
  loadWildcardYamlTree,
  getCachedWildcardLines,
  getCachedWildcardYamlTree
} from './wildcards'
import { getSecureRandomIndex, getWeightedRandomIndex } from './random'

// Core context and helpers extracted for clarity
type DisabledContext = { names: Set<string>; patterns: string[] }
type TagExpansionCtx = {
  model: TreeModel
  visitedTags: Set<string>
  existingRandomResolutions: TagResolutionMap
  previousRunResults: Record<string, string>
  randomTagResolutions: TagResolutionMap
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

// Check if a tag/container itself is pinned, or has any descendant array with an explicit override/pin.
// Delegates to checkPlaceholderLeadsToPinned with context's overrideMap.
function hasPinnedDescendant(
  ctx: TagExpansionCtx,
  tagOrPath: string,
  visited: Set<string> = new Set()
): boolean {
  return checkPlaceholderLeadsToPinned(ctx.model, tagOrPath, ctx.overrideMap, visited)
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

  // Capture intermediate text BEFORE placeholder expansion
  const intermediateText = result.expandedTags.join(', ')

  // Pass ctx.randomTagResolutions by reference so nested placeholder
  // expansions contribute their resolutions to the shared map.
  // Also pass current tag as parent for child tracking
  const finalized = expandPlaceholders(ctx, intermediateText, ctx.randomTagResolutions, tag)

  // Extract disables info without removing directives
  extractDisablesInfo(ctx, finalized)

  // Store as TagResolution with intermediate text and children
  ctx.randomTagResolutions[tag] = {
    finalText: finalized,
    intermediateText: intermediateText !== finalized ? intermediateText : undefined,
    children: ctx.randomTagResolutions[tag]?.children
  }

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
  const map = buildOverrideMapFromStore(model)
  // 2) Previous run results (do not override explicit pins)
  for (const [k, v] of Object.entries(previousRunResults || {})) {
    if (map[k]) continue
    if (v && String(v).trim()) map[k] = replaceWildcardsFromCache(String(v))
  }
  return map
}

/**
 * Build override map from testModeStore only (without previous run results)
 * Exported for use by wildcardZones.ts
 */
export function buildOverrideMapFromStore(model: TreeModel): Record<string, string> {
  const map: Record<string, string> = {}
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
  return map
}

/**
 * Check if a placeholder name leads to a pinned node (directly or through nested placeholders)
 * Exported for use by wildcardZones.ts
 */
export function checkPlaceholderLeadsToPinned(
  model: TreeModel,
  placeholderName: string,
  overrideMap: Record<string, string>,
  visited: Set<string> = new Set()
): boolean {
  if (visited.has(placeholderName)) return false
  visited.add(placeholderName)

  const node = findNodeByName(model, placeholderName)
  if (!node) return false

  // Check if the node itself is a pinned array
  if (node.kind === 'array') {
    const path = getNodePath(model, node.id)
    if (overrideMap[path]) return true
  }

  // Check children for nested placeholders
  if (node.kind === 'array' || node.kind === 'object') {
    const placeholderRegex = createPlaceholderRegex()
    for (const childId of node.children || []) {
      const child = model.nodes[childId]
      if (!child) continue

      if (child.kind === 'array') {
        const childPath = getNodePath(model, child.id)
        if (overrideMap[childPath]) return true
      } else if (child.kind === 'leaf') {
        const value = String(child.value || '')
        placeholderRegex.lastIndex = 0
        let match
        while ((match = placeholderRegex.exec(value)) !== null) {
          if (checkPlaceholderLeadsToPinned(model, match[1], overrideMap, visited)) {
            return true
          }
        }
      }
    }
  }

  return false
}

export type ArraySelectionResult = {
  index: number
  content: string
}

/**
 * Select a child from an array node, respecting pins, weights, and placeholder-to-pinned detection.
 * Returns both the selected index and the content string.
 * Exported for use by wildcardZones.ts
 */
export function selectFromArrayNode(
  model: TreeModel,
  arrayNodeId: string,
  overrideMap?: Record<string, string>
): ArraySelectionResult | null {
  const node = model.nodes[arrayNodeId]
  if (!node || node.kind !== 'array') return null

  const children = node.children
  if (!children || children.length === 0) return null

  // Build override map if not provided
  const effectiveOverrideMap = overrideMap ?? buildOverrideMapFromStore(model)

  // Check for CONSISTENT_RANDOM_MARKER
  let startIndex = 0
  if (children.length > 0) {
    const first = model.nodes[children[0]]
    if (first && first.kind === 'leaf') {
      const v = String(first.value)
      if (v === CONSISTENT_RANDOM_MARKER || v === '__CONSISTENT_RANDOM_MARKER__') {
        startIndex = 1
      }
    }
  }

  const arrayPath = getNodePath(model, arrayNodeId)
  const options: { index: number; weight: number; content: string }[] = []
  let pinnedMatchIndex: number | null = null
  let overrideMatchIndex: number | null = null
  const pinnedLeadingIndices: number[] = []

  const placeholderRegex = createPlaceholderRegex()

  for (let i = startIndex; i < children.length; i++) {
    const childId = children[i]
    const childNode = model.nodes[childId]
    if (!childNode || childNode.kind !== 'leaf') continue

    const value = childNode.value
    const asString =
      typeof value === 'string'
        ? value
        : value !== null && value !== undefined
          ? String(value)
          : ''
    const weight = parseWeightDirective(asString)

    options.push({ index: i, weight, content: asString })

    // Check if this option contains placeholders that lead to pinned nodes
    placeholderRegex.lastIndex = 0
    let match
    while ((match = placeholderRegex.exec(asString)) !== null) {
      if (checkPlaceholderLeadsToPinned(model, match[1], effectiveOverrideMap)) {
        pinnedLeadingIndices.push(i)
        break
      }
    }

    // Check for direct pin match
    const pinnedValue = effectiveOverrideMap[arrayPath]
    if (pinnedValue) {
      const childPath = getNodePath(model, childId)
      // Check if pinnedLeafPath matches
      const store = testModeStore[arrayPath]
      if (store?.enabled && store.pinnedLeafPath === childPath) {
        pinnedMatchIndex = i
      }
      // Check if overrideTag matches
      if (asString.trim() === pinnedValue.trim()) {
        overrideMatchIndex = i
      }
    }
  }

  if (options.length === 0) return null

  // Priority 1: Direct pin on this array
  if (pinnedMatchIndex !== null) {
    const opt = options.find((o) => o.index === pinnedMatchIndex)!
    return { index: pinnedMatchIndex, content: opt.content }
  }
  if (overrideMatchIndex !== null) {
    const opt = options.find((o) => o.index === overrideMatchIndex)!
    return { index: overrideMatchIndex, content: opt.content }
  }

  // Priority 2: Options that lead to pinned descendants via placeholders
  if (pinnedLeadingIndices.length > 0) {
    const pinnedOptions = options.filter((opt) => pinnedLeadingIndices.includes(opt.index))
    if (pinnedOptions.length > 0) {
      const selected = getWeightedRandomIndex(pinnedOptions)
      const chosen = pinnedOptions[selected]
      return { index: chosen.index, content: chosen.content }
    }
  }

  // Priority 3: Weighted random selection
  const selected = getWeightedRandomIndex(options)
  const chosen = options[selected]
  return chosen ? { index: chosen.index, content: chosen.content } : null
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

  // Remove prob directives (new syntax)
  cleaned = cleaned.replace(/,?\s*prob=\d+(?:\.\d+)?/gi, '')

  // Remove weight directives (legacy syntax)
  cleaned = cleaned.replace(/,?\s*weight=\d+(?:\.\d+)?/gi, '')

  // Remove any unexpanded wildcards directives just in case
  cleaned = cleaned.replace(/,?\s*wildcards=[^,\s]+/gi, '')

  // Clean up any double commas or extra spaces
  cleaned = cleaned.replace(/,\s*,/g, ',')
  cleaned = cleaned.replace(/^\s*,\s*|\s*,\s*$/g, '')
  cleaned = cleaned.replace(/\s+/g, ' ')

  return cleaned.trim()
}

function getRandomChildFromNode(model: TreeModel, node: AnyNode): string {
  if (node.kind === 'array') {
    const children = node.children || []
    if (children.length === 0) return ''

    // Skip CONSISTENT_RANDOM_MARKER if present
    let startIndex = 0
    if (children.length > 0) {
      const first = model.nodes[children[0]]
      if (first && first.kind === 'leaf') {
        const v = String(first.value)
        if (v === CONSISTENT_RANDOM_MARKER || v === '__CONSISTENT_RANDOM_MARKER__') {
          startIndex = 1
        }
      }
    }

    const validChildren = children.slice(startIndex)
    if (validChildren.length === 0) return ''

    const idx = getSecureRandomIndex(validChildren.length)
    const childNode = model.nodes[validChildren[idx]]
    if (!childNode) return ''

    if (childNode.kind === 'leaf') {
      return String(childNode.value)
    }
    return childNode.name
  }

  if (node.kind === 'object') {
    const children = node.children || []
    if (children.length === 0) return ''

    // Collect all array children
    const arrays: string[] = []
    for (const childId of children) {
      const child = model.nodes[childId]
      if (child && child.kind === 'array') {
        arrays.push(childId)
      }
    }

    if (arrays.length === 0) return ''

    const idx = getSecureRandomIndex(arrays.length)
    const arrayNode = model.nodes[arrays[idx]]
    if (!arrayNode) return ''

    return getRandomChildFromNode(model, arrayNode)
  }

  return ''
}

function navigateToNodeByPath(tree: TreeModel, nodePath: string): AnyNode | null {
  const parts = nodePath.split('/')
  let currentNode = tree.nodes[tree.rootId]

  // Try to match progressively longer path segments
  // This handles cases where node names contain slashes (e.g., "Vision/Female-Appearance")
  let i = 0
  while (i < parts.length) {
    if (!currentNode || (currentNode.kind !== 'array' && currentNode.kind !== 'object')) {
      return null
    }

    const children = currentNode.children || []
    let foundChildId: string | null = null
    let matchedParts = 0

    // Try matching with progressively more parts joined
    for (let j = parts.length; j > i; j--) {
      const candidateKey = parts.slice(i, j).join('/')

      for (const childId of children) {
        const childNode = tree.nodes[childId]
        if (childNode && childNode.name === candidateKey) {
          foundChildId = childId
          matchedParts = j - i
          break
        }
      }

      if (foundChildId) break
    }

    if (!foundChildId) {
      return null
    }

    currentNode = tree.nodes[foundChildId]
    i += matchedParts
  }

  return currentNode
}

function replaceWildcardsFromCache(text: string): string {
  if (!text || !/wildcards=/i.test(text)) return text
  const re = /wildcards=([^,\s]+)/gi
  return text.replace(re, (_full, spec: string) => {
    // Check if it's a YAML path pattern (filename.yaml:path/to/node)
    const yamlPathMatch = spec.match(/^(.+\.yaml):(.+)$/)
    if (yamlPathMatch) {
      const [, filename, nodePath] = yamlPathMatch
      const tree = getCachedWildcardYamlTree(filename)
      if (!tree) return ''

      // Navigate to the node
      const node = navigateToNodeByPath(tree, nodePath)
      if (!node) return ''

      // Select random child from the found node
      return getRandomChildFromNode(tree, node)
    }

    // Original text file handling
    const lines = getCachedWildcardLines(spec)
    if (lines.length === 0) return ''
    const idx = getSecureRandomIndex(lines.length)
    return lines[idx]
  })
}

function extractWildcardFilesFromText(text: string, out: Set<string>) {
  const re = /wildcards=([^,\s]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m[1]) {
      const spec = m[1]
      // Check if it's a YAML path pattern
      const yamlPathMatch = spec.match(/^(.+\.yaml):(.+)$/)
      if (yamlPathMatch) {
        out.add(yamlPathMatch[1]) // Add only the filename part
      } else {
        out.add(spec)
      }
    }
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
  await Promise.all(
    toLoad.map((f) => {
      if (f.endsWith('.yaml')) {
        return loadWildcardYamlTree(f)
      } else {
        return loadWildcardLines(f)
      }
    })
  )
}

export async function prefetchWildcardFilesFromTexts(
  model: TreeModel,
  texts?: string[]
): Promise<void> {
  const files = new Set<string>()
  for (const t of texts || []) {
    extractWildcardFilesFromText(String(t), files)
  }

  // Collect wildcard files from the entire tree
  const seen = new Set<string>()
  collectWildcardFilesFromNode(model, model.nodes[model.rootId], files, seen)

  const toLoad = Array.from(files)
  await Promise.all(
    toLoad.map((f) => {
      if (f.endsWith('.yaml')) {
        return loadWildcardYamlTree(f)
      } else {
        return loadWildcardLines(f)
      }
    })
  )
}

/**
 * Resolve occurrences of "wildcards=filename.txt" or "wildcards=filename.yaml:path/to/node"
 * by fetching the file and replacing each directive with a random line or node child.
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
      const spec = m[1]
      if (spec && !seen.has(spec)) {
        seen.add(spec)
        // Extract filename (either spec itself or part before colon)
        const yamlPathMatch = spec.match(/^(.+\.yaml):(.+)$/)
        const filename = yamlPathMatch ? yamlPathMatch[1] : spec
        files.push(filename)
      }
    }
  }
  if (files.length === 0) return text

  // Fetch and cache file contents (trimmed, comments removed)
  await Promise.all(
    files.map(async (filename) => {
      if (filename.endsWith('.yaml')) {
        await loadWildcardYamlTree(filename)
      } else {
        const lines = await loadWildcardLines(filename)
        if (lines.length > 0) linesCache[filename] = lines
      }
    })
  )

  // Replace each occurrence independently:
  // - If presetChoices has a value for this spec, use it.
  // - Otherwise, choose a random line per occurrence.
  re.lastIndex = 0
  return text.replace(re, (_full, spec: string) => {
    const preset = presetChoices[spec]
    if (preset) return preset

    // Check if it's a YAML path pattern
    const yamlPathMatch = spec.match(/^(.+\.yaml):(.+)$/)
    if (yamlPathMatch) {
      const [, filename, nodePath] = yamlPathMatch
      const tree = getCachedWildcardYamlTree(filename)
      if (!tree) return ''

      // Navigate to the node
      const node = navigateToNodeByPath(tree, nodePath)
      if (!node) return ''

      // Select random child from the found node
      return getRandomChildFromNode(tree, node)
    }

    // Original text file handling
    const lines = linesCache[spec] || []
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
  resolutionsAcc: TagResolutionMap,
  parentTag?: string
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
        // Merge nested resolutions
        for (const [k, v] of Object.entries(nested.randomTagResolutions)) {
          resolutionsAcc[k] = v
        }

        // Track parent-child relationship for nested chip display
        if (parentTag) {
          if (!resolutionsAcc[parentTag]) {
            resolutionsAcc[parentTag] = { finalText: '' }
          }
          if (!resolutionsAcc[parentTag].children) {
            resolutionsAcc[parentTag].children = {}
          }
          resolutionsAcc[parentTag].children[name] =
            nested.randomTagResolutions[name] ?? { finalText: nested.expandedText }
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

  // Helper to check if an option leads to a pinned descendant
  const placeholderAny = createPlaceholderRegex()
  function optionLeadsToPinned(content: string): boolean {
    // Check placeholders within the content (e.g., "__whole__")
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
    // Only check content as node name if it looks like a valid node reference (not plain text)
    // Skip this check for plain text content that contains spaces or commas
    if (!content.includes(' ') && !content.includes(',') && findNodeByName(ctx.model, content)) {
      return hasPinnedDescendant(ctx, content)
    }
    return false
  }

  // If no direct override selected, prefer options that lead to a pinned descendant
  // This takes priority over previousRunResults to ensure pins are respected
  if (!selected) {
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

  // Use previous run results only if no pinned descendant options exist
  if (!selected && ctx.previousRunResults[tag]) {
    const previousResult = resolveLeafContent(ctx, ctx.previousRunResults[tag])
    const previousTags = previousResult.split(', ')
    return { expandedTags: previousTags, resolution: previousResult }
  }
  if (!selected && isConsistent) {
    if (ctx.existingRandomResolutions[tag]) selected = ctx.existingRandomResolutions[tag].finalText
    if (!selected && ctx.randomTagResolutions[tag]) selected = ctx.randomTagResolutions[tag].finalText
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
  if (arrays.length === 0) return { expandedTags: [], resolution: '' }
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
  if (arrays.length === 0) return { expandedTags: [], resolution: '' }

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
 * Parse probability/weight directive from text content
 * Supports both prob=xx (0-100%) and weight=xx (legacy) syntax
 * Returns:
 *   -1: No explicit probability set (use default equal distribution)
 *   0: Explicitly set to 0% (exclude from selection)
 *   1-100: Explicit probability percentage
 */
export function parseWeightDirective(content: string): number {
  const trimmed = String(content || '').trim()
  if (!trimmed) return -1

  // Look for prob=xx directive (new syntax)
  const probMatch = trimmed.match(/prob=(\d+(?:\.\d+)?)/i)
  if (probMatch) {
    return parseFloat(probMatch[1])
  }

  // Look for weight=xx directive (legacy syntax, treat as probability)
  const weightMatch = trimmed.match(/weight=(\d+(?:\.\d+)?)/i)
  if (weightMatch) {
    return parseFloat(weightMatch[1])
  }

  return -1
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
 * Expand {a|b|c} patterns in leaf node values by randomly selecting one option
 * Requires at least one | to be treated as a choice pattern (to avoid matching JSON-like syntax)
 */
function expandChoicePatterns(text: string, disables?: DisabledContext): string {
  const choicePattern = createChoiceRegex()

  return text.replace(choicePattern, (match, choices) => {
    const allOptions = choices.split('|')

    if (allOptions.length === 0) {
      return match // Return original if no valid options
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
  existingRandomResolutions: TagResolutionMap = {},
  previousRunResults: Record<string, string> = {},
  disabledContext: { names: Set<string>; patterns: string[] } | undefined = undefined
): { expandedText: string; randomTagResolutions: TagResolutionMap } {
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
      extractDisablesInfo(ctx, resolution.finalText)
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
  extractDisablesInfo(ctx, finalExpanded)

  // Return the expanded result
  return { expandedText: finalExpanded, randomTagResolutions: ctx.randomTagResolutions }
}

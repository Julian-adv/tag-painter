/**
 * Tag expansion utilities using TreeModel (wildcards.yaml)
 */

import type { AnyNode, TreeModel } from '$lib/TreeEdit/model'
import { CONSISTENT_RANDOM_MARKER } from '$lib/constants'
import { testModeStore } from '../stores/testModeStore.svelte'
import {
  findNodeByName,
  getTopLevelAncestorName,
  extractDisablesDirective,
  updateDisablesDirective
} from '$lib/TreeEdit/utils'

// Core context and helpers extracted for clarity
type DisabledContext = { names: Set<string>; patterns: string[] }
type TagExpansionCtx = {
  model: TreeModel
  visitedTags: Set<string>
  existingRandomResolutions: Record<string, string>
  previousRunResults: Record<string, string>
  randomTagResolutions: Record<string, string>
  disables: DisabledContext
}

function isDescendantOf(model: TreeModel, ancestorId: string, nodeId: string): boolean {
  let cur = model.nodes[nodeId]
  while (cur && cur.parentId) {
    if (cur.parentId === ancestorId) return true
    cur = model.nodes[cur.parentId]
  }
  return false
}

function getLeafValueById(model: TreeModel, leafId: string): string {
  const n = model.nodes[leafId]
  if (n && n.kind === 'leaf') return String(n.value)
  return ''
}

function collectDisablesFromStrings(ctx: TagExpansionCtx, values: string[]): string[] {
  const out: string[] = []
  for (let val of values) {
    const items = extractDisablesDirective(String(val))
    if (items.length) {
      for (const it of items) {
        const maybeNode = findNodeByName(ctx.model, it)
        if (maybeNode) ctx.disables.names.add(it)
        else {
          ctx.disables.names.add(it)
          ctx.disables.patterns.push(it)
        }
      }
      val = updateDisablesDirective(String(val), [])
    }
    out.push(val)
  }
  return out
}

function expandNodeOnce(ctx: TagExpansionCtx, node: AnyNode): string[] {
  if (node.kind === 'leaf') {
    let val = String(node.value)
    const items = extractDisablesDirective(val)
    if (items.length) {
      for (const it of items) {
        const maybeNode = findNodeByName(ctx.model, it)
        if (maybeNode) ctx.disables.names.add(it)
        else ctx.disables.patterns.push(it)
      }
      val = updateDisablesDirective(val, [])
    }
    return [val]
  }
  if (node.kind === 'ref') {
    const target = findNodeByName(ctx.model, node.refName)
    if (!target) return [node.refName]
    return expandNodeOnce(ctx, target)
  }
  return [node.name]
}

function expandPlaceholdersDeepWithCtx(
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

function expandRandomArrayTagWithCtx(
  ctx: TagExpansionCtx,
  tag: string
): { expandedTags: string[]; resolution: string } {
  let selected: string | null = null
  const exact = testModeStore[tag]
  if (exact && exact.overrideTag) selected = exact.overrideTag
  if (!selected && exact && exact.pinnedLeafId) {
    const node = findNodeByName(ctx.model, tag)
    if (node && node.kind === 'array') {
      const pinnedId = exact.pinnedLeafId
      if (isDescendantOf(ctx.model, node.id, pinnedId)) {
        selected = getLeafValueById(ctx.model, pinnedId)
      }
    }
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
  const options: string[] = []
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
    options.push(candidate)
  }
  if (options.length === 0) return { expandedTags: [], resolution: '' }
  if (!selected) {
    if (isConsistent && ctx.existingRandomResolutions[tag]) selected = ctx.existingRandomResolutions[tag]
    if (!selected && isConsistent && ctx.randomTagResolutions[tag]) selected = ctx.randomTagResolutions[tag]
  }
  if (!selected) {
    const idx = getSecureRandomIndex(options.length)
    selected = options[idx]
  }
  return { expandedTags: [selected!], resolution: selected! }
}

function expandRandomObjectOfArraysTagWithCtx(
  ctx: TagExpansionCtx,
  tag: string
): { expandedTags: string[]; resolution: string } {
  const s = testModeStore[tag]
  if (s && s.overrideTag) return { expandedTags: [s.overrideTag], resolution: s.overrideTag }
  if (s && s.pinnedLeafId) {
    const objNode = findNodeByName(ctx.model, tag)
    if (objNode && objNode.kind === 'object') {
      if (isDescendantOf(ctx.model, objNode.id, s.pinnedLeafId)) {
        const val = getLeafValueById(ctx.model, s.pinnedLeafId)
        if (val) return { expandedTags: [val], resolution: val }
      }
    }
  }
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
    const preferredPath = (function getNodePath(model: TreeModel, id: string): string {
      const parts: string[] = []
      let cur = model.nodes[id]
      while (cur && cur.parentId) {
        parts.push(cur.name)
        cur = model.nodes[cur.parentId]
      }
      parts.reverse()
      if (parts[0] === 'root') parts.shift()
      return parts.join('/')
    })(ctx.model, arr.id)
    const sDesc = testModeStore[preferredPath]
    if (sDesc && (sDesc.overrideTag || sDesc.pinnedLeafId)) {
      const preferred = expandRandomArrayTagWithCtx(ctx, preferredPath)
      return { expandedTags: preferred.expandedTags, resolution: preferred.resolution }
    }
  }
  if (ctx.disables.names.size > 0) {
    const disabledLower = new Set(Array.from(ctx.disables.names, (s) => s.toLowerCase()))
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
    for (let i = arrays.length - 1; i >= 0; i--) {
      const arr = arrays[i]
      const p = getNodePath(ctx.model, arr.id).toLowerCase()
      if (disabledLower.has(p)) arrays.splice(i, 1)
    }
  }
  if (arrays.length === 0) return { expandedTags: [tag], resolution: tag }
  const idx = getSecureRandomIndex(arrays.length)
  const chosenArray = arrays[idx]
  const chosenPath = (function getNodePath(model: TreeModel, id: string): string {
    const parts: string[] = []
    let cur = model.nodes[id]
    while (cur && cur.parentId) {
      parts.push(cur.name)
      cur = model.nodes[cur.parentId]
    }
    parts.reverse()
    if (parts[0] === 'root') parts.shift()
    return parts.join('/')
  })(ctx.model, chosenArray.id)
  const result = expandRandomArrayTagWithCtx(ctx, chosenPath)
  return { expandedTags: result.expandedTags, resolution: result.resolution }
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
    disables: disabledContext || { names: new Set<string>(), patterns: [] }
  }

  let out: string[] = []
  for (const tagString of tags) {
    const { name: tag, weight: tagWeight } = parseTagWithWeight(tagString)

    if (ctx.disables.names.has(tag)) {
      out.push('')
      continue
    }
    if (ctx.visitedTags.has(tag)) {
      console.warn(`Circular reference detected for tag: ${tag}`)
      continue
    }

    const node = findNodeByName(model, tag)
    if (node && node.kind === 'array') {
      ctx.visitedTags.add(tag)
      const result = expandRandomArrayTagWithCtx(ctx, tag)
      const finalized = expandPlaceholdersDeepWithCtx(
        ctx,
        result.expandedTags,
        { ...ctx.existingRandomResolutions, ...ctx.randomTagResolutions }
      )
      const cleaned = collectDisablesFromStrings(ctx, finalized)
      const cleanedText = cleaned.join(', ')
      if (tagWeight) out.push(applyWeight(cleanedText, tagWeight))
      else out.push(...cleaned)
      ctx.randomTagResolutions[tag] = cleanedText
      ctx.visitedTags.delete(tag)
      continue
    }

    if (node && node.kind === 'object') {
      ctx.visitedTags.add(tag)
      const result = expandRandomObjectOfArraysTagWithCtx(ctx, tag)
      const finalized = expandPlaceholdersDeepWithCtx(
        ctx,
        result.expandedTags,
        { ...ctx.existingRandomResolutions, ...ctx.randomTagResolutions }
      )
      const cleaned = collectDisablesFromStrings(ctx, finalized)
      const cleanedText = cleaned.join(', ')
      if (tagWeight) out.push(applyWeight(cleanedText, tagWeight))
      else out.push(...cleaned)
      ctx.randomTagResolutions[tag] = cleanedText
      ctx.visitedTags.delete(tag)
      continue
    }

    if (tagWeight) out.push(applyWeight(tag, tagWeight))
    else out.push(tag)
  }

  out = expandPlaceholdersDeepWithCtx(
    ctx,
    out,
    { ...ctx.existingRandomResolutions, ...ctx.randomTagResolutions }
  )
  out = collectDisablesFromStrings(ctx, out)
  if (ctx.disables.names.size > 0) {
    const disabledOutputs = new Set<string>()
    for (const name of ctx.disables.names) {
      const resolved = ctx.randomTagResolutions[name]
      if (resolved && typeof resolved === 'string' && resolved.trim().length > 0) {
        disabledOutputs.add(resolved.toLowerCase())
      }
    }
    if (disabledOutputs.size > 0) {
      out = out.filter((item) => {
        const v = String(item || '').toLowerCase()
        return !disabledOutputs.has(v)
      })
    }
  }
  out = out.filter((t) => String(t ?? '').trim().length > 0)

  return { expandedTags: out, randomTagResolutions: ctx.randomTagResolutions }
}

import type { TreeModel, ArrayNode, ObjectNode, LeafNode } from '$lib/TreeEdit/model'
import { editSimilarity } from '$lib/utils/stringSimilarity'
import { updateDisablesDirective } from '$lib/TreeEdit/utils'

function normalize(s: string): string {
  const cleaned = s
    .replace(/disables=\[[^\]]*\]/gi, ' ')
    .replace(/composition=[a-z0-9_-]+/gi, ' ')
    .toLowerCase()
  return cleaned.replace(/[^a-z0-9]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

function tokens(s: string): Set<string> {
  const arr = normalize(s).split(' ').filter((t) => t.length > 0)
  return new Set(arr)
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  const union = a.size + b.size - inter
  if (union === 0) return 0
  return inter / union
}

export function findBestMatchingLeafId(
  model: TreeModel,
  parentName: string,
  targetText: string
): string | null {
  if (!parentName || !targetText) return null
  const baseId = model.symbols[parentName] || model.pathSymbols[parentName]
  if (!baseId) return null

  // If a nested path is provided (e.g., "pose/d"), widen the search to the
  // parent container ("pose") so siblings like gaze/expression are included.
  let searchRootId = baseId
  if (parentName.includes('/')) {
    const baseNode = model.nodes[baseId]
    if (baseNode && baseNode.parentId) {
      searchRootId = baseNode.parentId
    }
  }

  // Collect descendant leaf nodes under the chosen root
  const leaves: string[] = []
  const stack: string[] = [searchRootId]
  const seen = new Set<string>()
  while (stack.length) {
    const cid = stack.pop() as string
    if (seen.has(cid)) continue
    seen.add(cid)
    const n = model.nodes[cid]
    if (!n) continue
    if (n.kind === 'leaf') {
      leaves.push(cid)
    } else if (n.kind === 'object' || n.kind === 'array') {
      const kids = (n as ObjectNode | ArrayNode).children
      if (kids && kids.length) stack.push(...kids)
    }
  }
  if (leaves.length === 0) return null

  const targetTokens = tokens(targetText)
  const nt = normalize(targetText)

  let bestId: string | null = null
  let bestScore = -1
  for (const leafId of leaves) {
    const leaf = model.nodes[leafId]
    if (!leaf || leaf.kind !== 'leaf') continue
    let val = String((leaf as LeafNode).value ?? '')
    // Remove disables directive cleanly
    val = updateDisablesDirective(val, [])
    const candTokens = tokens(val)
    const j = jaccard(targetTokens, candTokens)
    const nv = normalize(val)
    const e = editSimilarity(nt, nv)
    // Combine token overlap and order-sensitive edit similarity
    const score = 0.5 * j + 0.5 * e
    if (score > bestScore) {
      bestScore = score
      bestId = leafId
    }
  }

  if (!bestId || bestScore <= 0) return null
  return bestId
}


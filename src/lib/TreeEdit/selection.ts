import type { TreeModel, ArrayNode, ObjectNode } from './model'
import { isContainer } from './model'

// Compute which node(s) should be selected after deleting the given ids.
// Preference order per each deleted id:
// 1) Next surviving sibling
// 2) Previous surviving sibling
// 3) Parent (if survives and not root)
// 4) Nearest surviving ancestor (excluding root)
export function computeNextSelectionAfterDelete(model: TreeModel, selectedIds: string[]): string[] {
  const validIds = selectedIds.filter((id) => id !== model.rootId)
  if (validIds.length === 0) return []

  const toDelete = new Set(validIds)
  const nextCandidates: string[] = []

  for (const id of validIds) {
    const node = model.nodes[id]
    if (!node) continue
    const pid = node.parentId
    if (!pid) continue

    const parent = model.nodes[pid]
    if (!parent || !isContainer(parent)) continue

    const children = (parent as ObjectNode | ArrayNode).children
    const idx = children.indexOf(id)

    // Try next siblings first
    let sibling: string | null = null
    for (let i = idx + 1; i < children.length; i++) {
      const cand = children[i]
      if (!toDelete.has(cand)) {
        sibling = cand
        break
      }
    }
    // Then previous siblings
    if (!sibling) {
      for (let i = idx - 1; i >= 0; i--) {
        const cand = children[i]
        if (!toDelete.has(cand)) {
          sibling = cand
          break
        }
      }
    }
    if (sibling) {
      nextCandidates.push(sibling)
      continue
    }

    // Fallback: parent if it survives
    if (!toDelete.has(pid) && pid !== model.rootId) {
      nextCandidates.push(pid)
      continue
    }

    // Fallback: nearest surviving ancestor
    let apid: string | null = pid
    while (apid) {
      if (!toDelete.has(apid) && apid !== model.rootId) {
        nextCandidates.push(apid)
        break
      }
      const p: { parentId: string | null } | undefined = model.nodes[apid]
      apid = p ? p.parentId : null
    }
  }

  // Deduplicate while preserving order
  const seen = new Set<string>()
  const unique = nextCandidates.filter((id) => {
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })

  return unique
}

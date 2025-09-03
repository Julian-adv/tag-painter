// Node types and helper utilities
export type NodeKind = 'object' | 'array' | 'leaf' | 'ref'

export type NodeId = string

export interface BaseNode {
  id: NodeId
  name: string // Key name (used for object keys / array item labels)
  kind: NodeKind
  parentId: NodeId | null // Parent node id (root is null)
  collapsed?: boolean // Collapsed state for UI
}

export interface LeafNode extends BaseNode {
  kind: 'leaf'
  value: string | number | boolean | null
}

export interface ObjectNode extends BaseNode {
  kind: 'object'
  children: NodeId[] // Key-value pairs represented as child node ids
}

export interface ArrayNode extends BaseNode {
  kind: 'array'
  children: NodeId[] // Array items represented as child node ids
}

export interface RefNode extends BaseNode {
  kind: 'ref'
  refName: string // Reference by symbol name
}

export type AnyNode = LeafNode | ObjectNode | ArrayNode | RefNode

export interface TreeModel {
  rootId: NodeId
  nodes: Record<NodeId, AnyNode>
  // Symbol name → defining node id (assumes single definition)
  symbols: Record<string, NodeId>
  // Full path (e.g., "a/b/c") → defining node id (unique per path)
  pathSymbols: Record<string, NodeId>
  // refName → list of ref node ids (reverse index)
  refIndex: Record<string, NodeId[]>
}

export const uid = () => Math.random().toString(36).slice(2, 10)

export const isContainer = (n: AnyNode): n is ObjectNode | ArrayNode =>
  n.kind === 'object' || n.kind === 'array'

export function addChild(model: TreeModel, parentId: NodeId, child: AnyNode) {
  const p = model.nodes[parentId]
  if (!p || !isContainer(p)) return
  ;(p as ObjectNode | ArrayNode).children.push(child.id)
  // Track parent on the child node
  child.parentId = parentId
  model.nodes[child.id] = child
  // Maintain ref reverse index
  if (child.kind === 'ref') {
    model.refIndex[child.refName] ||= []
    model.refIndex[child.refName].push(child.id)
  }
}

export function convertLeafToArray(model: TreeModel, id: NodeId): NodeId | null {
  const node = model.nodes[id]
  if (!node || node.kind !== 'leaf') return null
  const oldValue = (node as LeafNode).value
  // Create first child leaf using the previous value
  const childId = uid()
  const firstChild: LeafNode = {
    id: childId,
    name: '0',
    kind: 'leaf',
    parentId: id,
    value: oldValue
  }
  model.nodes[childId] = firstChild
  // Replace the current node with an array node, preserving name and id
  const newArray: ArrayNode = {
    id,
    name: node.name,
    kind: 'array',
    parentId: node.parentId,
    children: [childId],
    collapsed: false
  }
  model.nodes[id] = newArray
  return childId
}

export function removeNode(model: TreeModel, id: NodeId) {
  const target = model.nodes[id]
  if (!target) return
  // Do not allow removing the root
  if (id === model.rootId) return

  // Detach from parent (using node.parentId)
  const parentId = target.parentId
  if (parentId) {
    const parent = model.nodes[parentId]
    if (parent && isContainer(parent)) {
      const idx = parent.children.indexOf(id)
      if (idx !== -1) parent.children.splice(idx, 1)
    }
  }

  // Remove the entire subtree
  const queue = [id]
  while (queue.length) {
    const cur = queue.pop()!
    const node = model.nodes[cur]
    if (!node) continue

    if (isContainer(node)) queue.push(...node.children)

    if (node.kind === 'ref') {
      const arr = model.refIndex[node.refName]
      if (arr) model.refIndex[node.refName] = arr.filter((x) => x !== node.id)
    }
    if (node.kind !== 'ref') {
      // If a defining node is removed, drop it from the symbol table
      if (model.symbols[node.name] === node.id) delete model.symbols[node.name]
    }

    delete model.nodes[cur]
  }
}

export function setLeafValue(model: TreeModel, id: NodeId, value: string) {
  const node = model.nodes[id]
  if (node && node.kind === 'leaf') {
    ;(node as LeafNode).value = value
  }
}

export function toggle(model: TreeModel, id: NodeId) {
  const node = model.nodes[id]
  if (node && isContainer(node)) {
    node.collapsed = !node.collapsed
  }
}

export function renameNode(model: TreeModel, id: NodeId, newName: string) {
  const node = model.nodes[id]
  if (node) {
    const oldName = node.name
    node.name = newName

    // Update the symbol table (exclude ref nodes which are not definitions)
    if (node.kind !== 'ref' && model.symbols[oldName] === id) {
      delete model.symbols[oldName]
      model.symbols[newName] = id
    }
  }
}

export function upsertRef(model: TreeModel, parentId: NodeId, refName: string) {
  const refNode: RefNode = {
    id: uid(),
    name: `ref_${refName}`,
    kind: 'ref',
    parentId,
    refName
  }
  addChild(model, parentId, refNode)
}

export function moveChild(model: TreeModel, parentId: NodeId, fromIndex: number, toIndex: number) {
  const parent = model.nodes[parentId]
  if (!parent || !isContainer(parent)) return

  const children = parent.children
  if (fromIndex < 0 || fromIndex >= children.length || toIndex < 0 || toIndex >= children.length)
    return

  const [moved] = children.splice(fromIndex, 1)
  children.splice(toIndex, 0, moved)
}

/**
 * Rebuild the pathSymbols map from the current tree structure.
 * Stores container paths without the implicit 'root/' prefix.
 */
export function rebuildPathSymbols(model: TreeModel): void {
  // Build map: path -> id
  const map: Record<string, NodeId> = {}
  function dfs(id: NodeId, parentPath: string) {
    const n = model.nodes[id]
    if (!n) return
    const currentPath = parentPath ? `${parentPath}/${n.name}` : n.name
    if (n.kind === 'object' || n.kind === 'array') {
      if (n.name !== 'root') {
        const displayPath = currentPath.startsWith('root/')
          ? currentPath.slice(5)
          : currentPath
        map[displayPath] = id
      }
      for (const cid of (n.children || [])) dfs(cid, currentPath)
    }
  }
  dfs(model.rootId, '')
  model.pathSymbols = map
}

import { parse, stringify } from 'yaml'
import type { AnyNode, ArrayNode, LeafNode, NodeId, ObjectNode, RefNode, TreeModel } from './model'
import { uid } from './model'

export function fromYAML(text: string): TreeModel {
  const data = parse(text ?? '') ?? {}
  const nodes: Record<NodeId, AnyNode> = {}
  const symbols: Record<string, NodeId> = {}
  const pathSymbols: Record<string, NodeId> = {}
  const refIndex: Record<string, NodeId[]> = {}

  function build(
    name: string,
    value: unknown,
    parentId: NodeId | null,
    parentPath: string
  ): AnyNode {
    const currentPath = parentPath ? `${parentPath}/${name}` : name
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const id = uid()
      const n: ObjectNode = { id, name, kind: 'object', parentId, children: [], collapsed: false }
      nodes[id] = n
      for (const [k, v] of Object.entries(value)) {
        if (k === '$ref' && typeof v === 'string') {
          const rid = uid()
          const r: RefNode = { id: rid, name: v, kind: 'ref', parentId: id, refName: v }
          nodes[rid] = r
          refIndex[v] ||= []
          refIndex[v].push(rid)
          n.children.push(rid)
        } else {
          const c = build(k, v, id, currentPath)
          n.children.push(c.id)
        }
      }
      // Treat as a symbol definition (assumes a single definition per name)
      symbols[name] = id
      if (name !== 'root') {
        const displayPath = currentPath.startsWith('root/') ? currentPath.slice(5) : currentPath
        pathSymbols[displayPath] = id
      }
      return n
    }
    if (Array.isArray(value)) {
      const id = uid()
      const n: ArrayNode = { id, name, kind: 'array', parentId, children: [], collapsed: false }
      nodes[id] = n
      value.forEach((v, i) => {
        const c = build(String(i), v, id, currentPath)
        n.children.push(c.id)
      })
      // Treat array containers as symbol definitions too (by key name)
      symbols[name] = id
      if (name !== 'root') {
        const displayPath = currentPath.startsWith('root/') ? currentPath.slice(5) : currentPath
        pathSymbols[displayPath] = id
      }
      return n
    }
    // Distinguish between object key (name: value) and array item context
    // If parent is an array, keep this as a plain leaf item
    const parentNode = parentId ? nodes[parentId] : undefined
    const leafValue =
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
        ? value
        : String(value)
    if (parentNode && parentNode.kind === 'array') {
      const id = uid()
      const n: LeafNode = { id, name, kind: 'leaf', parentId, value: leafValue }
      nodes[id] = n
      return n
    }

    // For object key context (name: value), treat as an array with a single child
    const arrId = uid()
    const arr: ArrayNode = {
      id: arrId,
      name,
      kind: 'array',
      parentId,
      children: [],
      collapsed: false
    }
    nodes[arrId] = arr

    const leafId = uid()
    const child: LeafNode = {
      id: leafId,
      name: '0',
      kind: 'leaf',
      parentId: arrId,
      value: leafValue
    }
    nodes[leafId] = child
    arr.children.push(leafId)

    // Register as symbols and pathSymbols like other containers
    symbols[name] = arrId
    if (name !== 'root') {
      const displayPath = currentPath.startsWith('root/') ? currentPath.slice(5) : currentPath
      pathSymbols[displayPath] = arrId
    }
    return arr
  }

  const root = build('root', data, null, '')
  return { rootId: root.id, nodes, symbols, pathSymbols, refIndex }
}

export function toYAML(model: TreeModel): string {
  function materialize(nodeId: NodeId): unknown {
    const n = model.nodes[nodeId]
    if (!n) return null
    if (n.kind === 'leaf') {
      const value = (n as LeafNode).value
      // Convert null to empty string "" to preserve empty values in YAML
      return value === null ? '' : value
    }
    if (n.kind === 'ref') return { $ref: (n as RefNode).refName }
    if (n.kind === 'object') {
      const obj: Record<string, unknown> = {}
      for (const cid of (n as ObjectNode).children) {
        const c = model.nodes[cid]
        if (!c) continue
        obj[c.name] = materialize(cid)
      }
      return obj
    }
    if (n.kind === 'array') {
      const arr: unknown[] = []
      for (const cid of (n as ArrayNode).children) arr.push(materialize(cid))
      return arr
    }
  }

  const root = materialize(model.rootId)
  return stringify(root ?? {})
}

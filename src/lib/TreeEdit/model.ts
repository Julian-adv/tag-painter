// 노드 타입 및 편의 유틸
export type NodeKind = 'object' | 'array' | 'leaf' | 'ref'

export type NodeId = string

export interface BaseNode {
  id: NodeId
  name: string // 키 이름 (object/array item 표시용)
  kind: NodeKind
  collapsed?: boolean // 접힘 상태
}

export interface LeafNode extends BaseNode {
  kind: 'leaf'
  value: string | number | boolean | null
}

export interface ObjectNode extends BaseNode {
  kind: 'object'
  children: NodeId[] // 키-값 쌍이 자식으로 들어감
}

export interface ArrayNode extends BaseNode {
  kind: 'array'
  children: NodeId[] // 배열 항목이 자식으로 들어감
}

export interface RefNode extends BaseNode {
  kind: 'ref'
  refName: string // 심볼 이름으로 참조
}

export type AnyNode = LeafNode | ObjectNode | ArrayNode | RefNode

export interface TreeModel {
  rootId: NodeId
  nodes: Record<NodeId, AnyNode>
  // 이름(심볼) → 정의 노드 id (단일 정의 가정)
  symbols: Record<string, NodeId>
  // refName → ref 노드 id[] (역인덱스)
  refIndex: Record<string, NodeId[]>
}

export const uid = () => Math.random().toString(36).slice(2, 10)

export const isContainer = (n: AnyNode): n is ObjectNode | ArrayNode =>
  n.kind === 'object' || n.kind === 'array'

export function addChild(model: TreeModel, parentId: NodeId, child: AnyNode) {
  const p = model.nodes[parentId]
  if (!p || !isContainer(p)) return
  ;(p as ObjectNode | ArrayNode).children.push(child.id)
  model.nodes[child.id] = child
  // ref 인덱스 관리
  if (child.kind === 'ref') {
    model.refIndex[child.refName] ||= []
    model.refIndex[child.refName].push(child.id)
  }
}

export function removeNode(model: TreeModel, id: NodeId) {
  const target = model.nodes[id]
  if (!target) return
  // 루트는 삭제 금지
  if (id === model.rootId) return

  // 부모에서 탈착
  for (const n of Object.values(model.nodes)) {
    if (isContainer(n)) {
      const idx = n.children.indexOf(id)
      if (idx !== -1) n.children.splice(idx, 1)
    }
  }

  // 하위 전체 제거
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
      // 정의 노드 삭제 시 심볼 테이블에서 제거
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

    // 심볼 테이블 업데이트 (정의 노드가 아닌 ref 노드는 제외)
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
    refName
  }
  addChild(model, parentId, refNode)
}

import { fetchWildcardsText, saveWildcardsText } from '$lib/api/wildcards'
import { fromYAML, toYAML } from '$lib/TreeEdit/yaml-io'
import {
  uid,
  addChild,
  type LeafNode,
  type ArrayNode,
  type ObjectNode,
  type TreeModel
} from '$lib/TreeEdit/model'
import { togglePinForLeaf } from '$lib/TreeEdit/operations'
import { refreshWildcardsFromServer } from '$lib/stores/tagsStore'
import type { PromptAnalysis } from '$lib/types'
import {
  FIELD_TO_YAML_NODE,
  SLOT_TO_YAML_NODE,
  type SubNodeOption,
  type SlotMapping
} from './promptAnalyzerTypes'

export function findNodeByName(model: TreeModel, name: string): string | null {
  if (model.symbols[name]) {
    return model.symbols[name]
  }
  if (model.pathSymbols[name]) {
    return model.pathSymbols[name]
  }
  for (const node of Object.values(model.nodes)) {
    if (node.name === name) {
      return node.id
    }
  }
  return null
}

export function valueExistsInArray(model: TreeModel, arrayNodeId: string, value: string): boolean {
  const node = model.nodes[arrayNodeId]
  if (!node || node.kind !== 'array') return false

  const normalizedValue = value.toLowerCase().trim()
  for (const childId of (node as ArrayNode).children) {
    const child = model.nodes[childId]
    if (child && child.kind === 'leaf') {
      const leafValue = String((child as LeafNode).value || '')
        .toLowerCase()
        .trim()
      if (leafValue === normalizedValue) {
        return true
      }
    }
  }
  return false
}

export function addLeafToArray(model: TreeModel, arrayNodeId: string, value: string): void {
  const arrayNode = model.nodes[arrayNodeId] as ArrayNode
  if (!arrayNode || arrayNode.kind !== 'array') return

  const newLeaf: LeafNode = {
    id: uid(),
    name: String(arrayNode.children.length),
    kind: 'leaf',
    parentId: arrayNodeId,
    value: value
  }
  addChild(model, arrayNodeId, newLeaf)
  togglePinForLeaf(model, newLeaf.id)
}

export function getContainerChildren(model: TreeModel, nodeId: string): SubNodeOption[] {
  const node = model.nodes[nodeId]
  if (!node || node.kind !== 'object') return []

  const options: SubNodeOption[] = []
  const objNode = node as ObjectNode
  for (const childId of objNode.children) {
    const child = model.nodes[childId]
    if (child && (child.kind === 'array' || child.kind === 'object')) {
      options.push({
        id: childId,
        name: child.name,
        path: `${node.name}/${child.name}`
      })
    }
  }
  return options
}

export function findTargetArrayNode(model: TreeModel, nodeId: string): string | null {
  const node = model.nodes[nodeId]
  if (!node) return null

  if (node.kind === 'array') {
    return nodeId
  }

  if (node.kind === 'object') {
    const objNode = node as ObjectNode
    for (const childId of objNode.children) {
      const child = model.nodes[childId]
      if (child && child.kind === 'array') {
        return childId
      }
    }
  }

  return null
}

export async function addValueToArrayNode(
  model: TreeModel,
  arrayNodeId: string,
  value: string,
  displayName: string,
  wildcardsFile: string | undefined,
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void
): Promise<boolean> {
  if (valueExistsInArray(model, arrayNodeId, value)) {
    onShowToast(`"${value}" already exists in ${displayName}.`, 'info')
    return false
  }

  addLeafToArray(model, arrayNodeId, value)

  const newYamlText = toYAML(model)
  await saveWildcardsText(newYamlText, wildcardsFile)
  await refreshWildcardsFromServer(wildcardsFile)

  onShowToast(`Added to ${displayName}.`, 'success')
  return true
}

export function isValidValue(value: string | undefined): boolean {
  if (!value) return false
  const lower = value.toLowerCase().trim()
  return lower !== 'n/a' && lower !== 'not specified' && lower !== ''
}

export function getSlotNodeName(slot: string): string {
  const node = SLOT_TO_YAML_NODE[slot]
  if (!node) return slot
  return Array.isArray(node) ? node.join('/') : node
}

export interface AddToYamlResult {
  success: boolean
  needsSubNodeSelect: boolean
  options?: SubNodeOption[]
  model?: TreeModel
}

export async function addAnalysisFieldToYaml(
  field: keyof PromptAnalysis,
  analysis: PromptAnalysis,
  wildcardsFile: string | undefined,
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void
): Promise<AddToYamlResult> {
  const value = analysis[field]
  if (!value || value === 'N/A' || value === 'Not specified') {
    onShowToast('No valid value to add.', 'info')
    return { success: false, needsSubNodeSelect: false }
  }

  const nodeNameConfig = FIELD_TO_YAML_NODE[field]
  const nodeNames = Array.isArray(nodeNameConfig) ? nodeNameConfig : [nodeNameConfig]

  try {
    const yamlText = await fetchWildcardsText(wildcardsFile)
    const model = fromYAML(yamlText)

    const allContainerChildren: SubNodeOption[] = []

    for (const nodeName of nodeNames) {
      const nodeId = findNodeByName(model, nodeName)
      if (!nodeId) continue

      const node = model.nodes[nodeId]
      if (!node) continue

      if (node.kind === 'array' && nodeNames.length === 1) {
        const success = await addValueToArrayNode(
          model,
          nodeId,
          value,
          nodeName,
          wildcardsFile,
          onShowToast
        )
        return { success, needsSubNodeSelect: false }
      }

      if (node.kind === 'array' && nodeNames.length > 1) {
        allContainerChildren.push({
          id: nodeId,
          name: nodeName,
          path: nodeName
        })
      }

      if (node.kind === 'object') {
        const containerChildren = getContainerChildren(model, nodeId)
        allContainerChildren.push(...containerChildren)
      }
    }

    if (allContainerChildren.length > 1) {
      return {
        success: false,
        needsSubNodeSelect: true,
        options: allContainerChildren,
        model
      }
    }

    if (allContainerChildren.length === 1) {
      const option = allContainerChildren[0]
      const targetArrayId = findTargetArrayNode(model, option.id)
      if (targetArrayId) {
        const success = await addValueToArrayNode(
          model,
          targetArrayId,
          value,
          option.path,
          wildcardsFile,
          onShowToast
        )
        return { success, needsSubNodeSelect: false }
      }
    }

    const firstNodeName = nodeNames[0]
    const firstNodeId = findNodeByName(model, firstNodeName)
    if (!firstNodeId) {
      onShowToast(`Node "${firstNodeName}" not found in wildcards.`, 'error')
      return { success: false, needsSubNodeSelect: false }
    }

    let targetArrayId = findTargetArrayNode(model, firstNodeId)
    if (!targetArrayId) {
      const newArrayId = uid()
      const newArray: ArrayNode = {
        id: newArrayId,
        name: 'other',
        kind: 'array',
        parentId: firstNodeId,
        children: [],
        collapsed: false
      }
      addChild(model, firstNodeId, newArray)
      targetArrayId = newArrayId
    }

    const success = await addValueToArrayNode(
      model,
      targetArrayId,
      value,
      firstNodeName,
      wildcardsFile,
      onShowToast
    )
    return { success, needsSubNodeSelect: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add to YAML.'
    onShowToast(message, 'error')
    return { success: false, needsSubNodeSelect: false }
  }
}

export async function handleSubNodeSelectAction(
  option: SubNodeOption,
  model: TreeModel,
  value: string,
  wildcardsFile: string | undefined,
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void
): Promise<boolean> {
  try {
    let targetArrayId = findTargetArrayNode(model, option.id)

    if (!targetArrayId) {
      const newArrayId = uid()
      const newArray: ArrayNode = {
        id: newArrayId,
        name: 'other',
        kind: 'array',
        parentId: option.id,
        children: [],
        collapsed: false
      }
      addChild(model, option.id, newArray)
      targetArrayId = newArrayId
    }

    return await addValueToArrayNode(
      model,
      targetArrayId,
      value,
      option.path,
      wildcardsFile,
      onShowToast
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add to YAML.'
    onShowToast(message, 'error')
    return false
  }
}

export async function addGeneralizedPromptToYaml(
  generalizedPrompt: string,
  wildcardsFile: string | undefined,
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void
): Promise<boolean> {
  try {
    const yamlText = await fetchWildcardsText(wildcardsFile)
    const model = fromYAML(yamlText)

    const allNodeId = findNodeByName(model, 'all')
    if (!allNodeId) {
      onShowToast('Node "all" not found in wildcards.', 'error')
      return false
    }

    const allNode = model.nodes[allNodeId]
    if (!allNode) {
      onShowToast('Node "all" not found in wildcards.', 'error')
      return false
    }

    if (allNode.kind !== 'array') {
      onShowToast('"all" node must be an array.', 'error')
      return false
    }

    if (valueExistsInArray(model, allNodeId, generalizedPrompt)) {
      onShowToast('This prompt already exists in "all".', 'info')
      return false
    }

    addLeafToArray(model, allNodeId, generalizedPrompt)

    const newYamlText = toYAML(model)
    await saveWildcardsText(newYamlText, wildcardsFile)
    await refreshWildcardsFromServer(wildcardsFile)

    onShowToast('Added to "all" node.', 'success')
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add to YAML.'
    onShowToast(message, 'error')
    return false
  }
}

export interface AddSlotMappingResult {
  success: boolean
  needsSubNodeSelect: boolean
  options?: SubNodeOption[]
  model?: TreeModel
}

export async function addSlotMappingToYaml(
  mapping: SlotMapping,
  wildcardsFile: string | undefined,
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void
): Promise<AddSlotMappingResult> {
  const nodeNameConfig = SLOT_TO_YAML_NODE[mapping.slot]
  if (!nodeNameConfig) {
    onShowToast(`No YAML node configured for ${mapping.slot}.`, 'error')
    return { success: false, needsSubNodeSelect: false }
  }

  const nodeNames = Array.isArray(nodeNameConfig) ? nodeNameConfig : [nodeNameConfig]

  try {
    const yamlText = await fetchWildcardsText(wildcardsFile)
    const model = fromYAML(yamlText)

    const allContainerChildren: SubNodeOption[] = []

    for (const nodeName of nodeNames) {
      const nodeId = findNodeByName(model, nodeName)
      if (!nodeId) continue

      const node = model.nodes[nodeId]
      if (!node) continue

      if (node.kind === 'array' && nodeNames.length === 1) {
        const success = await addValueToArrayNode(
          model,
          nodeId,
          mapping.original,
          nodeName,
          wildcardsFile,
          onShowToast
        )
        return { success, needsSubNodeSelect: false }
      }

      if (node.kind === 'array' && nodeNames.length > 1) {
        allContainerChildren.push({
          id: nodeId,
          name: nodeName,
          path: nodeName
        })
      }

      if (node.kind === 'object') {
        const containerChildren = getContainerChildren(model, nodeId)
        allContainerChildren.push(...containerChildren)
      }
    }

    if (allContainerChildren.length > 1) {
      return {
        success: false,
        needsSubNodeSelect: true,
        options: allContainerChildren,
        model
      }
    }

    if (allContainerChildren.length === 1) {
      const option = allContainerChildren[0]
      const targetArrayId = findTargetArrayNode(model, option.id)
      if (targetArrayId) {
        const success = await addValueToArrayNode(
          model,
          targetArrayId,
          mapping.original,
          option.path,
          wildcardsFile,
          onShowToast
        )
        return { success, needsSubNodeSelect: false }
      }
    }

    const firstNodeName = nodeNames[0]
    const firstNodeId = findNodeByName(model, firstNodeName)
    if (!firstNodeId) {
      onShowToast(`Node "${firstNodeName}" not found in wildcards.`, 'error')
      return { success: false, needsSubNodeSelect: false }
    }

    let targetArrayId = findTargetArrayNode(model, firstNodeId)
    if (!targetArrayId) {
      const newArrayId = uid()
      const newArray: ArrayNode = {
        id: newArrayId,
        name: 'other',
        kind: 'array',
        parentId: firstNodeId,
        children: [],
        collapsed: false
      }
      addChild(model, firstNodeId, newArray)
      targetArrayId = newArrayId
    }

    const success = await addValueToArrayNode(
      model,
      targetArrayId,
      mapping.original,
      firstNodeName,
      wildcardsFile,
      onShowToast
    )
    return { success, needsSubNodeSelect: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add to YAML.'
    onShowToast(message, 'error')
    return { success: false, needsSubNodeSelect: false }
  }
}

import { findNodeByTitle } from './workflowMapping'
import type { ComfyUIWorkflow, LoraWithWeight } from '$lib/types'
import { normalizeLoraPathForComfy } from '$lib/utils/loraPath'

export function applyQwenNunchakuLoraChain(
  workflow: ComfyUIWorkflow,
  loras: LoraWithWeight[]
): string | null {
  const nunchakuNode = findNodeByTitle(workflow, 'Nunchaku Qwen Image LoRA Stack')
  if (!nunchakuNode) {
    return 'Nunchaku Qwen Image LoRA Stack node not found in workflow'
  }

  const nodeId = nunchakuNode.nodeId
  workflow[nodeId].inputs.lora_count = loras.length

  for (let i = 0; i < 10; i++) {
    if (i < loras.length) {
      const lora = loras[i]
      const resolvedName = normalizeLoraPathForComfy(lora.name)
      workflow[nodeId].inputs[`lora_name_${i + 1}`] = resolvedName
      workflow[nodeId].inputs[`lora_strength_${i + 1}`] = lora.weight
    } else {
      // Clear out any unused lora slots up to 10
      workflow[nodeId].inputs[`lora_name_${i + 1}`] = 'None'
      workflow[nodeId].inputs[`lora_strength_${i + 1}`] = 0
    }
  }

  return null
}

export function attachLoraChainBetweenNodes(
  workflow: ComfyUIWorkflow,
  sourceTitle: string,
  sourceIndex: number,
  destTitle: string,
  destInput: string,
  loras: LoraWithWeight[],
  loadLoraNodeClass: string,
  loadLoraWeightName: string,
  startNodeId: number
): void {
  const sourceNode = findNodeByTitle(workflow, sourceTitle)
  if (!sourceNode) {
    throw new Error(`Workflow node not found: ${sourceTitle}`)
  }

  const destNode = findNodeByTitle(workflow, destTitle)
  if (!destNode) {
    throw new Error(`Workflow node not found: ${destTitle}`)
  }

  const destNodeData = workflow[destNode.nodeId]
  if (!destNodeData || !destNodeData.inputs || !(destInput in destNodeData.inputs)) {
    throw new Error(`Input "${destInput}" not found on node: ${destTitle}`)
  }

  if (!Array.isArray(loras) || loras.length === 0) {
    destNodeData.inputs[destInput] = [sourceNode.nodeId, sourceIndex]
    return
  }

  let previousOutput: [string, number] = [sourceNode.nodeId, sourceIndex]

  loras.forEach((lora, index) => {
    const nodeId = String(startNodeId + index)
    if (workflow[nodeId]) {
      throw new Error(`Workflow already contains node with id: ${nodeId}`)
    }

    const resolvedName = normalizeLoraPathForComfy(lora.name)

    workflow[nodeId] = {
      inputs: {
        model: previousOutput,
        lora_name: resolvedName
      },
      class_type: loadLoraNodeClass,
      _meta: {
        title: `Load LoRA ${index + 1}`
      }
    }
    workflow[nodeId].inputs[loadLoraWeightName] = lora.weight

    previousOutput = [nodeId, 0]
  })

  destNodeData.inputs[destInput] = previousOutput
}

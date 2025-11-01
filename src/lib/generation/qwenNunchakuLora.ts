import { findNodeByTitle } from './workflowMapping'
import type { ComfyUIWorkflow, LoraWithWeight } from '$lib/types'

export function applyQwenNunchakuLoraChain(workflow: ComfyUIWorkflow, loras: LoraWithWeight[]): string | null {
	const nunchakuNode = findNodeByTitle(workflow, 'Nunchaku Qwen Image LoRA Stack')
	if (!nunchakuNode) {
		return 'Nunchaku Qwen Image LoRA Stack node not found in workflow'
	}

	const nodeId = nunchakuNode.nodeId
	workflow[nodeId].inputs.lora_count = loras.length

	for (let i = 0; i < loras.length; i++) {
		const lora = loras[i]
		workflow[nodeId].inputs[`lora_name_${i + 1}`] = lora.name
		workflow[nodeId].inputs[`lora_strength_${i + 1}`] = lora.weight
	}

	return null
}
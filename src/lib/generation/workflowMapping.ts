// Workflow node mapping utilities using title matching
import type { ComfyUIWorkflow } from '$lib/types'

// Node role identifiers that can be used in workflow node titles
export const NODE_ROLES = {
  // Checkpoint loaders
  MAIN_CHECKPOINT: 'Load Checkpoint',
  FACE_DETAILER_CHECKPOINT: 'FaceDetailer Checkpoint',
  UPSCALE_CHECKPOINT: 'Upscale Checkpoint',

  // Text encoders (CLIP)
  POSITIVE_PROMPT: 'CLIP Text Encode (Positive)',
  NEGATIVE_PROMPT: 'CLIP Text Encode (Negative)',
  ZONE1_PROMPT: 'Zone1',
  ZONE2_PROMPT: 'Zone2',
  INPAINTING_PROMPT: 'Inpainting',
  FACE_DETAILER_POSITIVE: 'FaceDetailer CLIP Text Encode (Positive)',
  FACE_DETAILER_NEGATIVE: 'FaceDetailer CLIP Text Encode (Negative)',
  UPSCALE_POSITIVE: 'Upscale CLIP Text Encode (Positive)',
  UPSCALE_NEGATIVE: 'Upscale CLIP Text Encode (Negative)',

  // Samplers
  MAIN_SAMPLER: 'KSampler',
  FACE_DETAILER: 'FaceDetailer',
  UPSCALE_SAMPLER: 'KSampler (Upscale)',

  // Schedulers
  MAIN_SCHEDULER: 'BasicScheduler',

  // Image size
  EMPTY_LATENT: 'Empty Latent Image',

  // VAE
  VAE_LOADER: 'Load VAE',
  VAE_DECODE: 'VAE Decode',

  // CLIP Skip
  CLIP_SKIP: 'CLIP Set Last Layer',

  // Image loading (for inpainting)
  LOAD_INPUT_IMAGE: 'Load Input Image',
  LOAD_MASK_IMAGE: 'Load Mask Image',

  // Composition mask
  LOAD_COMPOSITION_MASK: 'Load Image',

  // Final output
  FINAL_SAVE: 'Final Save'
} as const

export interface NodeMapping {
  nodeId: string
  title: string
}

/**
 * Find nodes in workflow by title pattern (partial match)
 */
export function findNodesByTitle(workflow: ComfyUIWorkflow, titlePattern: string): NodeMapping[] {
  const results: NodeMapping[] = []
  for (const [nodeId, node] of Object.entries(workflow)) {
    const title = node._meta?.title || ''
    if (title.includes(titlePattern)) {
      results.push({ nodeId, title })
    }
  }
  return results
}

/**
 * Find first node matching a title pattern
 */
export function findNodeByTitle(
  workflow: ComfyUIWorkflow,
  titlePattern: string
): NodeMapping | undefined {
  // Exact title match only; no substring fallback to avoid collisions
  for (const [nodeId, node] of Object.entries(workflow)) {
    const title = node._meta?.title || ''
    if (title === titlePattern) return { nodeId, title }
  }
  return undefined
}

/**
 * Set text input for a node found by title pattern
 */
export function setNodeTextInput(
  workflow: ComfyUIWorkflow,
  titlePattern: string,
  text: string,
  inputKey: string = 'text'
): boolean {
  const node = findNodeByTitle(workflow, titlePattern)
  if (node && workflow[node.nodeId]) {
    workflow[node.nodeId].inputs[inputKey] = text
    return true
  }
  return false
}

/**
 * Set checkpoint name for a node found by title pattern
 */
export function setNodeCheckpoint(
  workflow: ComfyUIWorkflow,
  titlePattern: string,
  checkpointName: string
): boolean {
  const node = findNodeByTitle(workflow, titlePattern)
  if (node && workflow[node.nodeId]) {
    workflow[node.nodeId].inputs.ckpt_name = checkpointName
    return true
  }
  return false
}

/**
 * Set sampler settings for a node found by title pattern
 */
export function setNodeSampler(
  workflow: ComfyUIWorkflow,
  titlePattern: string,
  settings: {
    steps?: number
    cfg?: number
    sampler_name?: string
    scheduler?: string
    denoise?: number
    seed?: number
  }
): boolean {
  const node = findNodeByTitle(workflow, titlePattern)
  if (node && workflow[node.nodeId]) {
    const nodeInputs = workflow[node.nodeId].inputs
    if (settings.steps !== undefined) nodeInputs.steps = settings.steps
    if (settings.cfg !== undefined) nodeInputs.cfg = settings.cfg
    if (settings.sampler_name !== undefined) nodeInputs.sampler_name = settings.sampler_name
    if (settings.scheduler !== undefined) nodeInputs.scheduler = settings.scheduler
    if (settings.denoise !== undefined && ('denoise' in nodeInputs)) nodeInputs.denoise = settings.denoise
    if (settings.seed !== undefined) {
      // Support both 'seed' and 'noise_seed' input keys
      if ('seed' in nodeInputs) nodeInputs.seed = settings.seed
      if ('noise_seed' in nodeInputs) nodeInputs.noise_seed = settings.seed
    }
    return true
  }
  return false
}

/**
 * Set image size for Empty Latent Image node
 */
export function setNodeImageSize(
  workflow: ComfyUIWorkflow,
  titlePattern: string,
  width: number,
  height: number
): boolean {
  const node = findNodeByTitle(workflow, titlePattern)
  if (node && workflow[node.nodeId]) {
    workflow[node.nodeId].inputs.width = width
    workflow[node.nodeId].inputs.height = height
    return true
  }
  return false
}

/**
 * Set image path for LoadImage node
 */
export function setNodeImagePath(
  workflow: ComfyUIWorkflow,
  titlePattern: string,
  imagePath: string
): boolean {
  const node = findNodeByTitle(workflow, titlePattern)
  if (node && workflow[node.nodeId]) {
    workflow[node.nodeId].inputs.image = imagePath
    return true
  }
  return false
}

/**
 * Set VAE name for VAELoader node
 */
export function setNodeVae(
  workflow: ComfyUIWorkflow,
  titlePattern: string,
  vaeName: string
): boolean {
  const node = findNodeByTitle(workflow, titlePattern)
  if (node && workflow[node.nodeId]) {
    workflow[node.nodeId].inputs.vae_name = vaeName
    return true
  }
  return false
}

/**
 * Set CLIP skip layer for CLIPSetLastLayer node
 */
export function setNodeClipSkip(
  workflow: ComfyUIWorkflow,
  titlePattern: string,
  clipSkip: number
): boolean {
  const node = findNodeByTitle(workflow, titlePattern)
  if (node && workflow[node.nodeId]) {
    workflow[node.nodeId].inputs.stop_at_clip_layer = -clipSkip
    return true
  }
  return false
}

/**
 * Load custom workflow from API
 */
export async function loadCustomWorkflow(workflowPath: string): Promise<ComfyUIWorkflow> {
  const response = await fetch(`/api/workflow?name=${encodeURIComponent(workflowPath)}`)
  if (!response.ok) {
    throw new Error(`Failed to load custom workflow: ${response.statusText}`)
  }
  const { workflow } = await response.json()
  return workflow
}

/**
 * Return a list of titles that are missing from the workflow (exact match).
 */
export function findMissingNodeTitles(workflow: ComfyUIWorkflow, titles: string[]): string[] {
  const missing: string[] = []
  for (const t of titles) {
    const id = findNodeByTitle(workflow, t)?.nodeId
    if (!id) missing.push(t)
  }
  return missing
}

/**
 * Delete all nodes matching a title pattern
 */
export function deleteNodesByTitlePattern(
  workflow: ComfyUIWorkflow,
  titlePattern: string
): number {
  const nodesToDelete = findNodesByTitle(workflow, titlePattern)
  for (const node of nodesToDelete) {
    delete workflow[node.nodeId]
  }
  return nodesToDelete.length
}

/**
 * Set a required input for a node found by title
 * Throws an error if the node or input key is not found
 */
export function setRequiredNodeInput(
  workflow: ComfyUIWorkflow,
  title: string,
  inputKey: string,
  value: string | number | boolean | [string, number]
): void {
  const node = findNodeByTitle(workflow, title)
  if (node) {
    if (workflow[node.nodeId].inputs && inputKey in workflow[node.nodeId].inputs) {
      workflow[node.nodeId].inputs[inputKey] = value
    } else {
      throw new Error(`Workflow node "${title}" missing input key: "${inputKey}"`)
    }
  } else {
    throw new Error(`Workflow node not found: "${title}"`)
  }
}

/**
 * Set text input for a node found by title
 * Convenience wrapper around setRequiredNodeInput for 'text' inputs
 */
export function setRequiredNodeText(workflow: ComfyUIWorkflow, title: string, text: string): void {
  setRequiredNodeInput(workflow, title, 'text', text)
}

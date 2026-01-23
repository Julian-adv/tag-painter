import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getComfyDir, fileExists } from './comfy'

const HASH_CACHE_PATH = path.resolve(process.cwd(), 'data', 'model-hashes.json')

interface HashCache {
  checkpoints: Record<string, string>
  loras: Record<string, string>
}

let hashCache: HashCache | null = null

/**
 * Load hash cache from disk
 */
async function loadHashCache(): Promise<HashCache> {
  if (hashCache) {
    return hashCache
  }

  try {
    const data = await fs.readFile(HASH_CACHE_PATH, 'utf-8')
    hashCache = JSON.parse(data) as HashCache
  } catch {
    hashCache = { checkpoints: {}, loras: {} }
  }

  return hashCache
}

/**
 * Save hash cache to disk
 */
async function saveHashCache(): Promise<void> {
  if (!hashCache) return

  try {
    await fs.mkdir(path.dirname(HASH_CACHE_PATH), { recursive: true })
    await fs.writeFile(HASH_CACHE_PATH, JSON.stringify(hashCache, null, 2))
  } catch (error) {
    console.error('Failed to save hash cache:', error)
  }
}

/**
 * Calculate SHA256 hash of a file (first 10 characters, A1111 style)
 */
async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)

    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => {
      const fullHash = hash.digest('hex')
      // A1111 uses first 10 characters of SHA256
      resolve(fullHash.substring(0, 10))
    })
    stream.on('error', reject)
  })
}

/**
 * Search for a model file in a directory and its subdirectories
 */
async function searchInDirectory(
  modelsDir: string,
  baseName: string,
  extensions: string[]
): Promise<string | null> {
  for (const ext of extensions) {
    const fullPath = path.join(modelsDir, baseName + ext)
    if (await fileExists(fullPath)) {
      return fullPath
    }

    // Also check subdirectories (one level deep)
    try {
      const entries = await fs.readdir(modelsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subPath = path.join(modelsDir, entry.name, baseName + ext)
          if (await fileExists(subPath)) {
            return subPath
          }
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
  }

  return null
}

/**
 * Find model file path by name
 */
async function findModelPath(
  modelName: string,
  modelType: 'checkpoints' | 'loras'
): Promise<string | null> {
  const comfyDir = getComfyDir()

  // Normalize model name (remove extension if present)
  const baseName = modelName.replace(/\.(safetensors|ckpt|pt|gguf)$/i, '')

  // Common extensions to try
  const extensions = ['.safetensors', '.ckpt', '.pt', '.gguf']

  if (modelType === 'checkpoints') {
    // For checkpoints, search in multiple directories (checkpoints, diffusion_models, unet)
    const checkpointDirs = ['checkpoints', 'diffusion_models', 'unet']

    for (const dir of checkpointDirs) {
      const modelsDir = path.join(comfyDir, 'models', dir)
      const result = await searchInDirectory(modelsDir, baseName, extensions)
      if (result) {
        return result
      }
    }

    return null
  } else {
    // For LoRAs, search only in loras directory
    const modelsDir = path.join(comfyDir, 'models', modelType)
    return await searchInDirectory(modelsDir, baseName, extensions)
  }
}

/**
 * Get hash for a checkpoint model (with caching)
 */
export async function getCheckpointHash(modelName: string): Promise<string | null> {
  const cache = await loadHashCache()

  // Normalize model name for cache key
  const cacheKey = modelName.replace(/\.(safetensors|ckpt|pt)$/i, '')

  // Check cache first
  if (cache.checkpoints[cacheKey]) {
    return cache.checkpoints[cacheKey]
  }

  // Find and hash the file
  const filePath = await findModelPath(modelName, 'checkpoints')
  if (!filePath) {
    console.log(`Checkpoint not found: ${modelName}`)
    return null
  }

  try {
    console.log(`Calculating hash for checkpoint: ${modelName}`)
    const hash = await calculateFileHash(filePath)
    cache.checkpoints[cacheKey] = hash
    await saveHashCache()
    console.log(`Checkpoint hash calculated: ${modelName} -> ${hash}`)
    return hash
  } catch (error) {
    console.error(`Failed to calculate hash for ${modelName}:`, error)
    return null
  }
}

/**
 * Get hash for a LoRA model (with caching)
 */
export async function getLoraHash(loraName: string): Promise<string | null> {
  const cache = await loadHashCache()

  // Normalize lora name for cache key
  const cacheKey = loraName.replace(/\.(safetensors|ckpt|pt)$/i, '')

  // Check cache first
  if (cache.loras[cacheKey]) {
    return cache.loras[cacheKey]
  }

  // Find and hash the file
  const filePath = await findModelPath(loraName, 'loras')
  if (!filePath) {
    console.log(`LoRA not found: ${loraName}`)
    return null
  }

  try {
    console.log(`Calculating hash for LoRA: ${loraName}`)
    const hash = await calculateFileHash(filePath)
    cache.loras[cacheKey] = hash
    await saveHashCache()
    console.log(`LoRA hash calculated: ${loraName} -> ${hash}`)
    return hash
  } catch (error) {
    console.error(`Failed to calculate hash for ${loraName}:`, error)
    return null
  }
}

/**
 * Get hashes for multiple LoRAs
 */
export async function getLoraHashes(
  loras: { name: string; weight: number }[]
): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {}

  for (const lora of loras) {
    const hash = await getLoraHash(lora.name)
    if (hash) {
      // Use normalized name without extension
      const normalizedName = lora.name.replace(/\.(safetensors|ckpt|pt)$/i, '')
      hashes[normalizedName] = hash
    }
  }

  return hashes
}

/**
 * Clear the hash cache (useful for debugging or when models change)
 */
export async function clearHashCache(): Promise<void> {
  hashCache = { checkpoints: {}, loras: {} }
  await saveHashCache()
}

/**
 * Get all cached hashes (for debugging)
 */
export async function getAllCachedHashes(): Promise<HashCache> {
  return await loadHashCache()
}

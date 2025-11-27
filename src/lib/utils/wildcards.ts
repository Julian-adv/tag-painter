// Utility functions for wildcards file naming and management

import type { TreeModel } from '$lib/TreeEdit/model'
import { fromYAML } from '$lib/TreeEdit/yaml-io'

/**
 * Get the appropriate wildcards filename based on model type
 */
export function getWildcardsFileName(modelType?: string): string {
  return modelType === 'qwen' || modelType === 'chroma' || modelType === 'z_image'
    ? 'wildcards.new.yaml'
    : 'wildcards.yaml'
}

/**
 * Get a display-friendly name for the wildcards file
 */
export function getWildcardsDisplayName(modelType?: string): string {
  return modelType === 'qwen' || modelType === 'chroma' || modelType === 'z_image'
    ? 'new wildcards'
    : 'wildcards'
}

// --- Wildcard file caching (module-level) ---
const wildcardFileLinesCache = new Map<string, string[]>()
const wildcardFileLinesInFlight = new Map<string, Promise<string[]>>()
const wildcardYamlTreeCache = new Map<string, TreeModel>()
const wildcardYamlTreeInFlight = new Map<string, Promise<TreeModel | null>>()

/**
 * Load wildcard text file and cache the lines
 */
export async function loadWildcardLines(name: string): Promise<string[]> {
  const cached = wildcardFileLinesCache.get(name)
  if (cached) return cached
  const inflight = wildcardFileLinesInFlight.get(name)
  if (inflight) return inflight
  const p = (async () => {
    try {
      const res = await fetch(`/api/wildcard-file?name=${encodeURIComponent(name)}`)
      if (!res.ok) return []
      const body = await res.text()
      const lines = body
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'))
      wildcardFileLinesCache.set(name, lines)
      return lines
    } catch {
      return []
    } finally {
      wildcardFileLinesInFlight.delete(name)
    }
  })()
  wildcardFileLinesInFlight.set(name, p)
  return p
}

/**
 * Load wildcard YAML file and cache the parsed TreeModel
 */
export async function loadWildcardYamlTree(filename: string): Promise<TreeModel | null> {
  const cached = wildcardYamlTreeCache.get(filename)
  if (cached) return cached
  const inflight = wildcardYamlTreeInFlight.get(filename)
  if (inflight) return inflight
  const p = (async () => {
    try {
      const res = await fetch(`/api/wildcard-file?name=${encodeURIComponent(filename)}`)
      if (!res.ok) return null
      const body = await res.text()
      // Parse YAML to TreeModel
      const tree = fromYAML(body)
      if (tree) {
        wildcardYamlTreeCache.set(filename, tree)
      }
      return tree
    } catch {
      return null
    } finally {
      wildcardYamlTreeInFlight.delete(filename)
    }
  })()
  wildcardYamlTreeInFlight.set(filename, p)
  return p
}

/**
 * Get cached wildcard text file lines (synchronous, returns empty if not cached)
 */
export function getCachedWildcardLines(name: string): string[] {
  return wildcardFileLinesCache.get(name) || []
}

/**
 * Get cached wildcard YAML tree (synchronous, returns null if not cached)
 */
export function getCachedWildcardYamlTree(filename: string): TreeModel | null {
  return wildcardYamlTreeCache.get(filename) || null
}

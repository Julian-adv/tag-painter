// Shared store for auto-completion tags
import { promptsData } from './promptsStore'
import { get, writable } from 'svelte/store'

let tags: string[] = []
export const combinedTags = writable<string[]>([])

export async function initTags(): Promise<void> {
  // Return cached tags if already loaded
  const currentCombinedTags = get(combinedTags)
  if (tags.length > 0 && currentCombinedTags.length > 0) {
    return
  }

  // Fetch regular tags and cache them
  try {
    const response = await fetch('/api/tags')
    tags = await response.json()
    await updateCombinedTags()
  } catch (error) {
    console.error('Failed to load tags:', error)
    await updateCombinedTags()
  }
}

export async function updateCombinedTags(): Promise<string[]> {
  // Build combined tags
  const currentPromptsData = get(promptsData)
  const customTagNames = Object.keys(currentPromptsData.customTags)
  const newCombinedTags = [...customTagNames, ...tags]

  // Update the store and notify subscribers
  combinedTags.set(newCombinedTags)

  return newCombinedTags
}

// Check if a tag is a custom tag
export function isCustomTag(tag: string): boolean {
  const currentPromptsData = get(promptsData)
  return tag in currentPromptsData.customTags
}

// Shared store for auto-completion tags
import { promptsData, initializePromptsStore } from './promptsStore'
import { get } from 'svelte/store'

let tags: string[] = []
let combinedTags: string[] = []

export async function getTags(): Promise<string[]> {
  // Return cached tags if already loaded
  if (tags.length > 0) {
    return await getCombinedTags()
  }

  // Fetch regular tags and cache them
  try {
    const response = await fetch('/api/tags')
    tags = await response.json()
    return await getCombinedTags()
  } catch (error) {
    console.error('Failed to load tags:', error)
    return await getCombinedTags()
  }
}

async function getCombinedTags(): Promise<string[]> {
  // Use cached combined tags if available
  if (combinedTags.length > 0) {
    return combinedTags
  }
  
  // Ensure prompts data is loaded before building combined tags
  await initializePromptsStore()
  
  // Build combined tags if not cached
  const currentPromptsData = get(promptsData)
  const customTagNames = Object.keys(currentPromptsData.customTags)
  combinedTags = [...customTagNames, ...tags]
  
  return combinedTags
}

// Check if a tag is a custom tag
export function isCustomTag(tag: string): boolean {
  const currentPromptsData = get(promptsData)
  return tag in currentPromptsData.customTags
}

// Optional: Function to clear cache if needed
export function clearTagsCache() {
  combinedTags = []
}
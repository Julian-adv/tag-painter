// Shared store for auto-completion tags
let tags: string[] = []

export async function getTags(): Promise<string[]> {
  // Return cached tags if already loaded
  if (tags.length > 0) {
    return tags
  }

  // Fetch tags and cache them
  try {
    const response = await fetch('/api/tags')
    tags = await response.json()
    return tags
  } catch (error) {
    console.error('Failed to load tags:', error)
    return []
  }
}

// Optional: Function to clear cache if needed
export function clearTagsCache() {
  tags = []
}
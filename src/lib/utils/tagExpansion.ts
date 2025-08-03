/**
 * Tag expansion utilities for handling custom tags
 */

import type { CustomTag } from '../types'

/**
 * Expand custom tags to their constituent tags recursively
 */
export function expandCustomTags(
  tags: string[],
  customTags: Record<string, CustomTag>,
  visitedTags: Set<string> = new Set()
): {
  expandedTags: string[]
  randomTagResolutions: Record<string, string>
} {
  const expandedTags: string[] = []
  const randomTagResolutions: Record<string, string> = {}

  for (const tag of tags) {
    // Prevent infinite recursion by tracking visited tags
    if (visitedTags.has(tag)) {
      console.warn(`Circular reference detected for tag: ${tag}`)
      continue
    }

    if (tag in customTags) {
      const customTag = customTags[tag]
      visitedTags.add(tag)

      if (customTag.type === 'random') {
        // For random tags, select one random tag from the list
        if (customTag.tags.length > 0) {
          const randomIndex = Math.floor(Math.random() * customTag.tags.length)
          const selectedTag = customTag.tags[randomIndex]

          // Recursively expand the selected tag
          const recursiveResult = expandCustomTags([selectedTag], customTags, visitedTags)
          expandedTags.push(...recursiveResult.expandedTags)

          // Set the final resolution to the fully expanded result
          randomTagResolutions[tag] = recursiveResult.expandedTags.join(', ')
        }
      } else {
        // For sequential tags, expand all constituent tags recursively
        const recursiveResult = expandCustomTags(customTag.tags, customTags, visitedTags)
        expandedTags.push(...recursiveResult.expandedTags)
        randomTagResolutions[tag] = recursiveResult.expandedTags.join(', ')
      }

      visitedTags.delete(tag)
    } else {
      // This is a regular tag, keep as is
      expandedTags.push(tag)
    }
  }

  return { expandedTags, randomTagResolutions }
}
/**
 * Tag expansion utilities for handling custom tags
 */

import type { CustomTag } from '../types'
import { testModeStore } from '../stores/testModeStore'

/**
 * Generate a cryptographically secure random number for better randomness
 */
function getSecureRandomIndex(max: number): number {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return array[0] % max
}

/**
 * Helper function to handle random tag selection and expansion
 */
function expandRandomTag(
  tag: string,
  customTag: CustomTag,
  customTags: Record<string, CustomTag>,
  visitedTags: Set<string>,
  existingRandomResolutions: Record<string, string>
): { expandedTags: string[], resolution: string } {
  // Check for test mode override
  let selectedTag: string
  const overrideTag = testModeStore[tag]?.overrideTag
  if (overrideTag) {
    // Use the test override tag
    selectedTag = overrideTag
  } else {
    // Use crypto.getRandomValues for better randomness
    const randomIndex = getSecureRandomIndex(customTag.tags.length)
    selectedTag = customTag.tags[randomIndex]
  }

  // Recursively expand the selected tag
  const recursiveResult = expandCustomTags([selectedTag], customTags, visitedTags, existingRandomResolutions)
  
  return {
    expandedTags: recursiveResult.expandedTags,
    resolution: recursiveResult.expandedTags.join(', ')
  }
}

/**
 * Expand custom tags to their constituent tags recursively
 */
export function expandCustomTags(
  tags: string[],
  customTags: Record<string, CustomTag>,
  visitedTags: Set<string> = new Set(),
  existingRandomResolutions: Record<string, string> = {}
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
          const result = expandRandomTag(tag, customTag, customTags, visitedTags, existingRandomResolutions)
          expandedTags.push(...result.expandedTags)
          randomTagResolutions[tag] = result.resolution
        }
      } else if (customTag.type === 'consistent-random') {
        // For consistent-random tags, use existing resolution if available, otherwise select randomly
        if (customTag.tags.length > 0) {
          if (existingRandomResolutions[tag]) {
            // Use the existing resolution directly
            const existingResult = existingRandomResolutions[tag]
            const existingTags = existingResult.split(', ')
            expandedTags.push(...existingTags)
            randomTagResolutions[tag] = existingResult
          } else {
            // No existing resolution, select randomly
            const result = expandRandomTag(tag, customTag, customTags, visitedTags, existingRandomResolutions)
            expandedTags.push(...result.expandedTags)
            randomTagResolutions[tag] = result.resolution
          }
        }
      } else {
        // For sequential tags, expand all constituent tags recursively
        const recursiveResult = expandCustomTags(customTag.tags, customTags, visitedTags, existingRandomResolutions)
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
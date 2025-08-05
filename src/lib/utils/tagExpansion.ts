/**
 * Tag expansion utilities for handling custom tags
 */

import type { CustomTag } from '../types'
import { testModeStore } from '../stores/testModeStore.svelte'

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
 * Parse weight from tag string
 */
function parseTagWithWeight(tagString: string): { name: string, weight?: number } {
  const weightMatch = tagString.match(/^(.+):(\d+(?:\.\d+)?)$/)
  if (weightMatch) {
    const [, name, weightStr] = weightMatch
    const weight = parseFloat(weightStr)
    return { name, weight: weight !== 1.0 ? weight : undefined }
  }
  return { name: tagString }
}

/**
 * Apply weight formatting to a tag name
 */
function applyWeight(tagName: string, weight?: number): string {
  if (!weight || weight === 1.0) {
    return tagName
  }
  return `(${tagName}:${weight})`
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

  for (const tagString of tags) {
    const { name: tag, weight: tagWeight } = parseTagWithWeight(tagString)
    
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
          // Apply weight to the entire expanded result if it has a weight
          if (tagWeight) {
            const combinedExpansion = result.expandedTags.join(', ')
            const weightedExpansion = applyWeight(combinedExpansion, tagWeight)
            expandedTags.push(weightedExpansion)
            randomTagResolutions[tag] = weightedExpansion
          } else {
            expandedTags.push(...result.expandedTags)
            randomTagResolutions[tag] = result.resolution
          }
        }
      } else if (customTag.type === 'consistent-random') {
        // For consistent-random tags, use existing resolution if available, otherwise select randomly
        if (customTag.tags.length > 0) {
          if (existingRandomResolutions[tag]) {
            // Use the existing resolution directly
            const existingResult = existingRandomResolutions[tag]
            // Apply weight to existing resolution if tagWeight exists
            if (tagWeight) {
              const weightedExpansion = applyWeight(existingResult, tagWeight)
              expandedTags.push(weightedExpansion)
              randomTagResolutions[tag] = weightedExpansion
            } else {
              const existingTags = existingResult.split(', ')
              expandedTags.push(...existingTags)
              randomTagResolutions[tag] = existingResult
            }
          } else {
            // No existing resolution, select randomly
            const result = expandRandomTag(tag, customTag, customTags, visitedTags, existingRandomResolutions)
            // Apply weight to the entire expanded result if it has a weight
            if (tagWeight) {
              const combinedExpansion = result.expandedTags.join(', ')
              const weightedExpansion = applyWeight(combinedExpansion, tagWeight)
              expandedTags.push(weightedExpansion)
              randomTagResolutions[tag] = weightedExpansion
            } else {
              expandedTags.push(...result.expandedTags)
              randomTagResolutions[tag] = result.resolution
            }
          }
        }
      } else {
        // For sequential tags, expand all constituent tags recursively
        const recursiveResult = expandCustomTags(customTag.tags, customTags, visitedTags, existingRandomResolutions)
        // Apply weight to the entire sequential tag result if it has a weight
        if (tagWeight) {
          const combinedExpansion = recursiveResult.expandedTags.join(', ')
          const weightedExpansion = applyWeight(combinedExpansion, tagWeight)
          expandedTags.push(weightedExpansion)
          randomTagResolutions[tag] = weightedExpansion
        } else {
          expandedTags.push(...recursiveResult.expandedTags)
          randomTagResolutions[tag] = recursiveResult.expandedTags.join(', ')
        }
      }

      visitedTags.delete(tag)
    } else {
      // This is a regular tag, apply weight if it exists
      if (tagWeight) {
        expandedTags.push(applyWeight(tag, tagWeight))
      } else {
        expandedTags.push(tag)
      }
    }
  }

  return { expandedTags, randomTagResolutions }
}
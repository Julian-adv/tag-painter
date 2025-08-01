// Prompt processing utility functions
//
// This module handles prompt processing, category filtering, and face detailer configuration

import { getEffectiveCategoryValueFromResolved } from '../stores/promptsStore'
import type { PromptCategory, OptionItem } from '$lib/types'

/**
 * Replaces category reference patterns like {categoryName} with their resolved values
 */
export function replaceCategoryReferences(
  promptValue: string,
  positiveCategories: PromptCategory[],
  resolvedRandomValues: Record<string, OptionItem>
): string {
  const categoryReferencePattern = /\{([^}]+)\}/g
  return promptValue.replace(categoryReferencePattern, (match, categoryName) => {
    const categoryNameLower = categoryName.toLowerCase()

    // Find category by name (case insensitive) from all positive categories
    const referencedCategory = positiveCategories.find(
      (cat) => cat.name.toLowerCase() === categoryNameLower
    )

    if (referencedCategory) {
      const resolvedValue = getEffectiveCategoryValueFromResolved(
        referencedCategory,
        resolvedRandomValues
      )
      return resolvedValue || match // fallback to original if no value
    }

    return match // Keep original if category not found
  })
}

/**
 * Result of prompt processing operations
 */
export interface PromptProcessingResult {
  promptValue: string
  excludedCategories: PromptCategory[]
  faceDetailerWildcard: string
}

/**
 * Processes prompts through multiple passes: category resolution, exclusion filtering, and face detailer setup
 */
export function processPrompts(
  positiveCategories: PromptCategory[],
  resolvedRandomValues: Record<string, OptionItem>
): PromptProcessingResult {
  // First pass: build initial prompt value
  let firstPassPromptValue = positiveCategories
    .map((category) => getEffectiveCategoryValueFromResolved(category, resolvedRandomValues))
    .filter(Boolean)
    .join(', ')

  // Second pass: replace {category name} patterns with resolved random values
  firstPassPromptValue = replaceCategoryReferences(
    firstPassPromptValue,
    positiveCategories,
    resolvedRandomValues
  )

  // Third pass: remove categories that match -[category] patterns
  let promptValue = firstPassPromptValue
  const categoryRemovalPattern = /-\[([^\]]+)\]/g
  let match
  const categoriesToRemove: string[] = []

  // Find all -[category] patterns
  while ((match = categoryRemovalPattern.exec(firstPassPromptValue)) !== null) {
    const categoryNameToRemove = match[1].toLowerCase()
    categoriesToRemove.push(categoryNameToRemove)
  }

  let excludedCategories: PromptCategory[] = []
  let faceDetailerWildcard: string = ''
  let filteredCategories: PromptCategory[] = positiveCategories

  // Remove values from matching categories
  if (categoriesToRemove.length > 0) {
    filteredCategories = []
    excludedCategories = []

    // Single loop to categorize all categories
    positiveCategories.forEach((category) => {
      const categoryName = category.name.toLowerCase()
      let isExcluded = false

      // Check if category name matches directly
      if (categoriesToRemove.includes(categoryName)) {
        isExcluded = true
      }

      // Check for wildcard patterns like *2, *1, etc.
      for (const pattern of categoriesToRemove) {
        if (pattern.startsWith('*')) {
          const suffix = pattern.substring(1) // Remove the *
          if (categoryName.endsWith(suffix)) {
            isExcluded = true
            break
          }
        }
      }

      if (isExcluded) {
        excludedCategories.push(category)
      } else {
        filteredCategories.push(category)
      }
    })

    console.log(
      'filteredCategories:\n' +
        filteredCategories
          .map(
            (cat) =>
              `  ${cat.name}: ${getEffectiveCategoryValueFromResolved(cat, resolvedRandomValues)}`
          )
          .join('\n')
    )

    // Rebuild prompt without the excluded categories
    promptValue = filteredCategories
      .map((category) => getEffectiveCategoryValueFromResolved(category, resolvedRandomValues))
      .filter(Boolean)
      .join(', ')
      .replace(categoryRemovalPattern, '') // Remove any remaining -[category] patterns
      .trim()

    // Apply category reference replacement to the rebuilt prompt
    promptValue = replaceCategoryReferences(promptValue, positiveCategories, resolvedRandomValues)
  }

  // Generate face detailer wildcard (always, regardless of category removal)
  faceDetailerWildcard = generateFaceDetailerWildcard(filteredCategories, resolvedRandomValues)

  return {
    promptValue,
    excludedCategories,
    faceDetailerWildcard
  }
}

/**
 * Generates face detailer wildcard configuration from face categories
 */
export function generateFaceDetailerWildcard(
  categories: PromptCategory[],
  resolvedRandomValues: Record<string, OptionItem>
): string {
  // Filter face categories
  const faceCategories = categories.filter((cat) => cat.name.toLowerCase().includes('face'))

  if (faceCategories.length === 0) {
    return ''
  }

  // Group categories by suffix number (no number, 1, 2, 3, etc.)
  const categoryGroups = new Map<string, PromptCategory[]>()

  faceCategories.forEach((cat) => {
    const numberMatch = cat.name.match(/(\d+)$/) // Match number at end
    const groupKey = numberMatch ? numberMatch[1] : '0' // '0' for no number

    if (!categoryGroups.has(groupKey)) {
      categoryGroups.set(groupKey, [])
    }
    categoryGroups.get(groupKey)!.push(cat)
  })

  // Sort groups by key: 0, 1, 2, 3, etc.
  const sortedKeys = Array.from(categoryGroups.keys()).sort((a, b) => {
    return parseInt(a) - parseInt(b)
  })

  // Combine groups with [SEP]
  const wildcardParts = []
  for (const key of sortedKeys) {
    const categories = categoryGroups.get(key)!
    const values = categories
      .map((cat) => getEffectiveCategoryValueFromResolved(cat, resolvedRandomValues))
      .filter(Boolean)

    if (values.length > 0) {
      wildcardParts.push(values.join(', '))
    }
  }

  if (wildcardParts.length > 0) {
    // Join parts with [SEP] and return wildcard
    return '[ASC]\n' + wildcardParts.join(' [SEP]\n')
  }

  return ''
}

// Central store for prompts data using Svelte stores
import { writable } from 'svelte/store'
import type { PromptsData, PromptCategory, OptionItem } from '$lib/types'
import { savePrompts, loadPrompts } from '../utils/fileIO'

// Minimal default data for initial store state
const defaultPromptsData: PromptsData = {
  categories: [],
  tags: { all: [], zone1: [], zone2: [] },
  selectedCheckpoint: null,
  useUpscale: false,
  useFaceDetailer: false,
  selectedLoras: [],
  loraWeight: 0.8
}

// Create reactive store
export const promptsData = writable<PromptsData>(defaultPromptsData)

// Store for tracking resolved random values during generation
export const resolvedRandomValues = writable<Record<string, OptionItem>>({})

// Load prompts from API on initialization
export async function initializePromptsStore() {
  const savedPrompts = await loadPrompts()
  if (savedPrompts) {
    promptsData.set(savedPrompts)
  } else {
    // If API fails, at least we have an empty structure
    console.warn('Failed to load prompts from API')
  }
}

// Save prompts to file
export async function savePromptsData() {
  let currentData: PromptsData
  promptsData.subscribe(data => currentData = data)()
  await savePrompts(currentData!)
}

// Helper functions for updating categories
export function updateCategoryValue(categoryId: string, value: import('../types').OptionItem) {
  promptsData.update(data => ({
    ...data,
    categories: data.categories.map(category =>
      category.id === categoryId
        ? { ...category, currentValue: value }
        : category
    )
  }))
}

export function updateCategoryValues(categoryId: string, values: import('../types').OptionItem[]) {
  promptsData.update(data => ({
    ...data,
    categories: data.categories.map(category =>
      category.id === categoryId
        ? { ...category, values: values }
        : category
    )
  }))
}

// Functions for managing categories themselves
export function addCategory(category: PromptCategory) {
  promptsData.update(data => ({
    ...data,
    categories: [...data.categories, category]
  }))
}

export function removeCategory(categoryId: string) {
  promptsData.update(data => ({
    ...data,
    categories: data.categories.filter(category => category.id !== categoryId)
  }))
}

export function updateCategory(categoryId: string, updates: Partial<PromptCategory>) {
  promptsData.update(data => ({
    ...data,
    categories: data.categories.map(category =>
      category.id === categoryId
        ? { ...category, ...updates }
        : category
    )
  }))
}

export function updateCheckpoint(checkpoint: string) {
  promptsData.update(data => ({ ...data, selectedCheckpoint: checkpoint }))
}

export function updateUpscale(enabled: boolean) {
  promptsData.update(data => ({ ...data, useUpscale: enabled }))
}

export function updateFaceDetailer(enabled: boolean) {
  promptsData.update(data => ({ ...data, useFaceDetailer: enabled }))
}

export function updateSelectedLoras(loras: string[]) {
  promptsData.update(data => ({ ...data, selectedLoras: loras }))
}

export function updateLoraWeight(weight: number) {
  promptsData.update(data => ({ ...data, loraWeight: weight }))
}

export function updateTags(allTags: string[], zone1Tags: string[], zone2Tags: string[]) {
  promptsData.update(data => ({ 
    ...data, 
    tags: { 
      all: allTags, 
      zone1: zone1Tags, 
      zone2: zone2Tags 
    } 
  }))
}

export function reorderCategories(fromIndex: number, toIndex: number) {
  promptsData.update(data => {
    const categories = [...data.categories]
    const [removed] = categories.splice(fromIndex, 1)
    categories.splice(toIndex, 0, removed)
    return { ...data, categories }
  })
}

// Get random option for a category
export function getRandomOption(categoryId: string): OptionItem | null {
  let randomOption: OptionItem | null = null
  promptsData.subscribe(data => {
    const category = data.categories.find(cat => cat.id === categoryId)
    if (category) {
      const effectiveOptions = getEffectiveOptions(category, data.categories)
      // Filter out the random option itself to avoid infinite loop
      const realOptions = effectiveOptions.filter(option => option.title !== '[Random]')
      if (realOptions.length > 0) {
        const randomIndex = Math.floor(Math.random() * realOptions.length)
        randomOption = realOptions[randomIndex]
      }
    }
  })()
  return randomOption
}

// Get the source category (following alias chain)
export function getSourceCategory(categoryId: string, allCategories: PromptCategory[]): PromptCategory | null {
  const category = allCategories.find(cat => cat.id === categoryId)
  if (!category) return null
  
  if (category.aliasOf) {
    return getSourceCategory(category.aliasOf, allCategories)
  }
  return category
}

// Get effective options for a category (from source if alias)
export function getEffectiveOptions(category: PromptCategory, allCategories: PromptCategory[]): OptionItem[] {
  if (category.aliasOf) {
    const sourceCategory = getSourceCategory(category.aliasOf, allCategories)
    return sourceCategory ? sourceCategory.values : []
  }
  return category.values
}

// Get effective value using already resolved random values
export function getEffectiveCategoryValueFromResolved(category: PromptCategory, resolvedValues: Record<string, OptionItem>): string {
  if (category.currentValue.title === '[Random]') {
    return resolvedValues[category.id]?.value || ''
  }
  return category.currentValue.value
}

// Auto-save current values to options arrays when they don't exist
export function autoSaveCurrentValues() {
  promptsData.update(data => {
    const updated = { ...data }

    updated.categories = updated.categories.map(category => {
      if (category.currentValue && category.currentValue.title && category.currentValue.title !== '[Random]') {
        const existingOption = category.values.find(
          (item) => item.title === category.currentValue.title
        )
        if (existingOption) {
          existingOption.value = category.currentValue.value
        } else {
          return {
            ...category,
            values: [...category.values, { ...category.currentValue }]
          }
        }
      }
      return category
    })

    return updated
  })
}

// Resolve random values and store them for display
export function resolveRandomValues() {
  const resolved: Record<string, OptionItem> = {}
  
  promptsData.subscribe(data => {
    data.categories.forEach(category => {
      if (category.currentValue.title === '[Random]') {
        const randomOption = getRandomOption(category.id)
        if (randomOption) {
          resolved[category.id] = randomOption
        }
      }
    })
  })()
  
  resolvedRandomValues.set(resolved)
  return resolved
}
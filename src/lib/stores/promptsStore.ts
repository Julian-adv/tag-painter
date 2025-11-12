// Central store for prompts data using Svelte stores
import { writable } from 'svelte/store'
import type { PromptsData, PromptCategory, OptionItem } from '$lib/types'
import { savePrompts, loadPrompts } from '../utils/fileIO'
import { updateCombinedTags } from './tagsStore'

// Minimal default data for initial store state
const defaultPromptsData: PromptsData = {
  categories: [],
  tags: { all: [], zone1: [], zone2: [], negative: [], inpainting: [] },
  selectedCheckpoint: '',
  selectedComposition: 'left-horizontal',
  selectedRefineMode: 1, // RefineMode.none
  selectedFaceDetailerMode: 1, // FaceDetailerMode.none
  selectedLoras: []
}

// Create reactive store
export const promptsData = writable<PromptsData>(defaultPromptsData)

// Load prompts from API on initialization
export async function initializePromptsStore() {
  const savedPrompts = await loadPrompts()
  if (savedPrompts) {
    // Ensure backward compatibility - add missing fields
    const migratedData = {
      ...savedPrompts,
      tags: {
        all: savedPrompts.tags?.all || [],
        zone1: savedPrompts.tags?.zone1 || [],
        zone2: savedPrompts.tags?.zone2 || [],
        negative: savedPrompts.tags?.negative || [],
        inpainting: savedPrompts.tags?.inpainting || []
      },
      selectedComposition: savedPrompts.selectedComposition || 'left-horizontal',
      selectedRefineMode: savedPrompts.selectedRefineMode ?? 1, // RefineMode.none
      selectedFaceDetailerMode: savedPrompts.selectedFaceDetailerMode ?? 1 // FaceDetailerMode.none
    }
    promptsData.set(migratedData)
  } else {
    // If API fails, at least we have an empty structure
    console.warn('Failed to load prompts from API')
  }
}

// Save prompts to file
export async function savePromptsData() {
  let currentData: PromptsData
  promptsData.subscribe((data) => (currentData = data))()

  // Update combined tags before saving prompts data for immediate UI feedback
  updateCombinedTags()

  await savePrompts(currentData!)
}

// Helper functions for updating categories
export function updateCategoryValue(categoryId: string, value: import('../types').OptionItem) {
  promptsData.update((data) => ({
    ...data,
    categories: data.categories.map((category) =>
      category.id === categoryId ? { ...category, currentValue: value } : category
    )
  }))
}

export function updateCategoryValues(categoryId: string, values: import('../types').OptionItem[]) {
  promptsData.update((data) => ({
    ...data,
    categories: data.categories.map((category) =>
      category.id === categoryId ? { ...category, values: values } : category
    )
  }))
}

// Functions for managing categories themselves
export function addCategory(category: PromptCategory) {
  promptsData.update((data) => ({
    ...data,
    categories: [...data.categories, category]
  }))
}

export function removeCategory(categoryId: string) {
  promptsData.update((data) => ({
    ...data,
    categories: data.categories.filter((category) => category.id !== categoryId)
  }))
}

export function updateCategory(categoryId: string, updates: Partial<PromptCategory>) {
  promptsData.update((data) => ({
    ...data,
    categories: data.categories.map((category) =>
      category.id === categoryId ? { ...category, ...updates } : category
    )
  }))
}

export function updateCheckpoint(checkpoint: string) {
  promptsData.update((data) => ({ ...data, selectedCheckpoint: checkpoint }))
}

export function updateComposition(composition: string) {
  promptsData.update((data) => ({ ...data, selectedComposition: composition }))
}

export function updateSelectedLoras(loras: { name: string; weight: number }[]) {
  const normalized = Array.isArray(loras)
    ? loras.map((entry) => ({
        ...entry,
        name: typeof entry.name === 'string' ? entry.name.replace(/\\/g, '/') : entry.name
      }))
    : []
  promptsData.update((data) => ({ ...data, selectedLoras: normalized }))
}

export function updateTags(
  allTags: string[],
  zone1Tags: string[],
  zone2Tags: string[],
  negativeTags: string[],
  inpaintingTags: string[]
) {
  promptsData.update((data) => ({
    ...data,
    tags: {
      all: allTags,
      zone1: zone1Tags,
      zone2: zone2Tags,
      negative: negativeTags,
      inpainting: inpaintingTags
    }
  }))
}


export function reorderCategories(fromIndex: number, toIndex: number) {
  promptsData.update((data) => {
    const categories = [...data.categories]
    const [removed] = categories.splice(fromIndex, 1)
    categories.splice(toIndex, 0, removed)
    return { ...data, categories }
  })
}

// Get the source category (following alias chain)
export function getSourceCategory(
  categoryId: string,
  allCategories: PromptCategory[]
): PromptCategory | null {
  const category = allCategories.find((cat) => cat.id === categoryId)
  if (!category) return null

  if (category.aliasOf) {
    return getSourceCategory(category.aliasOf, allCategories)
  }
  return category
}

// Get effective options for a category (from source if alias)
export function getEffectiveOptions(
  category: PromptCategory,
  allCategories: PromptCategory[]
): OptionItem[] {
  if (category.aliasOf) {
    const sourceCategory = getSourceCategory(category.aliasOf, allCategories)
    return sourceCategory ? sourceCategory.values : []
  }
  return category.values
}

// Auto-save current values to options arrays when they don't exist
export function autoSaveCurrentValues() {
  promptsData.update((data) => {
    const updated = { ...data }

    updated.categories = updated.categories.map((category) => {
      if (
        category.currentValue &&
        category.currentValue.title &&
        category.currentValue.title !== '[Random]'
      ) {
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

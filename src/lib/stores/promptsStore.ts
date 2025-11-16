// Central store for prompts data using Svelte stores
import { writable } from 'svelte/store'
import type { PromptsData } from '$lib/types'
import { savePrompts, loadPrompts } from '../utils/fileIO'
import { updateCombinedTags } from './tagsStore'

// Minimal default data for initial store state
const defaultPromptsData: PromptsData = {
  tags: { all: [], zone1: [], zone2: [], negative: [], inpainting: [] },
  selectedCheckpoint: '',
  selectedComposition: 'left-horizontal',
  selectedLoras: [],
  useFilmGrain: false,
  enableRefine: false,
  enableFaceDetailer: false
}

// Create reactive store
export const promptsData = writable<PromptsData>(defaultPromptsData)

// Load prompts from API on initialization
export async function initializePromptsStore() {
  const savedPrompts = await loadPrompts()
  if (savedPrompts) {
    // Ensure backward compatibility - add missing fields
    const migratedData: PromptsData = {
      tags: {
        all: savedPrompts.tags?.all || [],
        zone1: savedPrompts.tags?.zone1 || [],
        zone2: savedPrompts.tags?.zone2 || [],
        negative: savedPrompts.tags?.negative || [],
        inpainting: savedPrompts.tags?.inpainting || []
      },
      selectedCheckpoint: savedPrompts.selectedCheckpoint || '',
      selectedComposition: savedPrompts.selectedComposition || 'left-horizontal',
      selectedLoras: savedPrompts.selectedLoras || [],
      useFilmGrain: savedPrompts.useFilmGrain ?? false,
      enableRefine: savedPrompts.enableRefine ?? false,
      enableFaceDetailer: savedPrompts.enableFaceDetailer ?? false
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

export function updateUseFilmGrain(useFilmGrain: boolean) {
  promptsData.update((data) => ({ ...data, useFilmGrain }))
}

export function updateEnableRefine(enableRefine: boolean) {
  promptsData.update((data) => ({ ...data, enableRefine }))
}

export function updateEnableFaceDetailer(enableFaceDetailer: boolean) {
  promptsData.update((data) => ({ ...data, enableFaceDetailer }))
}



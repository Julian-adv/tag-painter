import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { get } from 'svelte/store'
import {
  promptsData,
  initializePromptsStore,
  savePromptsData,
  updateCheckpoint,
  updateComposition,
  updateSelectedLoras,
  updateTags,
  updateUseFilmGrain
} from './promptsStore'
import type { PromptsData } from '$lib/types'

// Mock fileIO module
vi.mock('../utils/fileIO', () => ({
  savePrompts: vi.fn(),
  loadPrompts: vi.fn()
}))

// Mock tagsStore module
vi.mock('./tagsStore', () => ({
  updateCombinedTags: vi.fn()
}))

import { savePrompts, loadPrompts } from '../utils/fileIO'

describe('promptsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset store to default state
    promptsData.set({
      tags: { all: [], zone1: [], zone2: [], negative: [], inpainting: [] },
      selectedCheckpoint: '',
      selectedComposition: 'left-horizontal',
      selectedRefineMode: 1,
      selectedFaceDetailerMode: 1,
      selectedLoras: [],
      useFilmGrain: false
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initializePromptsStore', () => {
    it('should initialize store with loaded data', async () => {
      const mockLoadedData: Partial<PromptsData> = {
        tags: {
          all: ['tag1', 'tag2'],
          zone1: ['zone1tag'],
          zone2: ['zone2tag'],
          negative: ['negative1'],
          inpainting: ['inpaint1']
        },
        selectedCheckpoint: 'test-model.ckpt',
        selectedComposition: 'center'
      }

      vi.mocked(loadPrompts).mockResolvedValueOnce(mockLoadedData as PromptsData)

      await initializePromptsStore()

      const storeData = get(promptsData)
      expect(storeData.tags).toEqual(mockLoadedData.tags)
      expect(storeData.selectedCheckpoint).toBe('test-model.ckpt')
      expect(storeData.selectedComposition).toBe('center')
    })

    it('should handle missing fields in loaded data', async () => {
      const incompleteData: Partial<PromptsData> = {
        // Missing tags, selectedComposition, useFilmGrain
      }

      vi.mocked(loadPrompts).mockResolvedValueOnce(incompleteData as PromptsData)

      await initializePromptsStore()

      const storeData = get(promptsData)
      expect(storeData.tags).toEqual({
        all: [],
        zone1: [],
        zone2: [],
        negative: [],
        inpainting: []
      })
      expect(storeData.selectedComposition).toBe('left-horizontal')
      expect(storeData.useFilmGrain).toBe(false)
    })

    it('should handle load failure gracefully', async () => {
      vi.mocked(loadPrompts).mockResolvedValueOnce(null)

      await initializePromptsStore()

      // Should still have default data
      const storeData = get(promptsData)
      expect(storeData.tags).toEqual({
        all: [],
        zone1: [],
        zone2: [],
        negative: [],
        inpainting: []
      })
    })
  })

  describe('savePromptsData', () => {
    it('should save current store data', async () => {
      const testData: PromptsData = {
        tags: { all: ['tag1'], zone1: [], zone2: [], negative: [], inpainting: [] },
        selectedCheckpoint: 'test.ckpt',
        selectedComposition: 'left-horizontal',
        selectedRefineMode: 1,
        selectedFaceDetailerMode: 1,
        selectedLoras: [{ name: 'lora1', weight: 1.0 }],
        useFilmGrain: false
      }

      promptsData.set(testData)

      await savePromptsData()

      expect(savePrompts).toHaveBeenCalledWith(testData)
    })
  })

  describe('settings updates', () => {
    it('should update checkpoint', () => {
      updateCheckpoint('new-model.ckpt')

      const storeData = get(promptsData)
      expect(storeData.selectedCheckpoint).toBe('new-model.ckpt')
    })

    it('should update composition', () => {
      updateComposition('right-vertical')

      const storeData = get(promptsData)
      expect(storeData.selectedComposition).toBe('right-vertical')
    })

    it('should update selected loras', () => {
      const loras = [
        { name: 'lora1', weight: 0.8 },
        { name: 'lora2', weight: 1.2 }
      ]
      updateSelectedLoras(loras)

      const storeData = get(promptsData)
      expect(storeData.selectedLoras).toEqual(loras)
    })

    it('should update useFilmGrain', () => {
      updateUseFilmGrain(true)

      const storeData = get(promptsData)
      expect(storeData.useFilmGrain).toBe(true)

      updateUseFilmGrain(false)

      const storeData2 = get(promptsData)
      expect(storeData2.useFilmGrain).toBe(false)
    })
  })

  describe('tags management', () => {
    it('should update tags', () => {
      updateTags(['all1', 'all2'], ['zone1-1'], ['zone2-1'], ['neg1'], ['inpaint1'])

      const storeData = get(promptsData)
      expect(storeData.tags).toEqual({
        all: ['all1', 'all2'],
        zone1: ['zone1-1'],
        zone2: ['zone2-1'],
        negative: ['neg1'],
        inpainting: ['inpaint1']
      })
    })
  })
})

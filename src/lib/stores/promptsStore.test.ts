import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { get } from 'svelte/store'
import {
  promptsData,
  initializePromptsStore,
  savePromptsData,
  updateCategoryValue,
  updateCategoryValues,
  addCategory,
  removeCategory,
  updateCategory,
  updateCheckpoint,
  updateComposition,
  updateUpscale,
  updateFaceDetailer,
  updateSelectedLoras,
  updateLoraWeight,
  updateTags,
  saveCustomTag,
  reorderCategories,
  getSourceCategory,
  getEffectiveOptions,
  autoSaveCurrentValues
} from './promptsStore'
import type { PromptsData, PromptCategory } from '$lib/types'

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
      categories: [],
      tags: { all: [], zone1: [], zone2: [], negative: [], inpainting: [] },
      customTags: {},
      selectedCheckpoint: null,
      selectedComposition: 'left-horizontal',
      useUpscale: false,
      useFaceDetailer: false,
      selectedLoras: [],
      loraWeight: 0.8
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initializePromptsStore', () => {
    it('should initialize store with loaded data', async () => {
      const mockLoadedData: Partial<PromptsData> = {
        categories: [
          { id: 'test', name: 'Test', values: [], currentValue: { title: '', value: '' } }
        ],
        tags: {
          all: ['tag1', 'tag2'],
          zone1: ['zone1tag'],
          zone2: ['zone2tag'],
          negative: ['negative1'],
          inpainting: ['inpaint1']
        },
        selectedCheckpoint: 'test-model.ckpt',
        selectedComposition: 'center',
        customTags: {
          custom1: {
            name: 'custom1',
            tags: ['option1', 'option2'],
            type: 'sequential'
          }
        }
      }

      vi.mocked(loadPrompts).mockResolvedValueOnce(mockLoadedData as PromptsData)

      await initializePromptsStore()

      const storeData = get(promptsData)
      expect(storeData.categories).toEqual(mockLoadedData.categories)
      expect(storeData.tags).toEqual(mockLoadedData.tags)
      expect(storeData.selectedCheckpoint).toBe('test-model.ckpt')
      expect(storeData.selectedComposition).toBe('center')

      expect(storeData.customTags.custom1).toEqual({
        name: 'custom1',
        tags: ['option1', 'option2'],
        type: 'sequential'
      })

      // Tags are updated through internal mechanisms
    })

    it('should handle missing fields in loaded data', async () => {
      const incompleteData: Partial<PromptsData> = {
        categories: []
        // Missing tags, customTags, selectedComposition
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
      expect(storeData.customTags).toEqual({})
      expect(storeData.selectedComposition).toBe('left-horizontal')
    })

    it('should handle load failure gracefully', async () => {
      vi.mocked(loadPrompts).mockResolvedValueOnce(null)

      await initializePromptsStore()

      // Should still have default data
      const storeData = get(promptsData)
      expect(storeData.categories).toEqual([])
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
        categories: [
          { id: 'test', name: 'Test', values: [], currentValue: { title: '', value: '' } }
        ],
        tags: { all: ['tag1'], zone1: [], zone2: [], negative: [], inpainting: [] },
        customTags: {},
        selectedCheckpoint: 'test.ckpt',
        selectedComposition: 'left-horizontal',
        useUpscale: true,
        useFaceDetailer: false,
        selectedLoras: ['lora1'],
        loraWeight: 0.9
      }

      promptsData.set(testData)

      await savePromptsData()

      expect(savePrompts).toHaveBeenCalledWith(testData)
    })
  })

  describe('category management', () => {
    it('should update category value', () => {
      const category: PromptCategory = {
        id: 'test',
        name: 'Test',
        values: [],
        currentValue: { title: '', value: '' }
      }
      promptsData.update((data) => ({ ...data, categories: [category] }))

      const newValue = { title: 'New Value', value: 'new-value' }
      updateCategoryValue('test', newValue)

      const storeData = get(promptsData)
      expect(storeData.categories[0].currentValue).toEqual(newValue)
    })

    it('should update category values', () => {
      const category: PromptCategory = {
        id: 'test',
        name: 'Test',
        values: [],
        currentValue: { title: '', value: '' }
      }
      promptsData.update((data) => ({ ...data, categories: [category] }))

      const newValues = [
        { title: 'Value 1', value: 'value1' },
        { title: 'Value 2', value: 'value2' }
      ]
      updateCategoryValues('test', newValues)

      const storeData = get(promptsData)
      expect(storeData.categories[0].values).toEqual(newValues)
    })

    it('should add category', () => {
      const newCategory: PromptCategory = {
        id: 'new',
        name: 'New Category',
        values: [],
        currentValue: { title: '', value: '' }
      }

      addCategory(newCategory)

      const storeData = get(promptsData)
      expect(storeData.categories).toContain(newCategory)
    })

    it('should remove category', () => {
      const category: PromptCategory = {
        id: 'test',
        name: 'Test',
        values: [],
        currentValue: { title: '', value: '' }
      }
      promptsData.update((data) => ({ ...data, categories: [category] }))

      removeCategory('test')

      const storeData = get(promptsData)
      expect(storeData.categories).toHaveLength(0)
    })

    it('should update category', () => {
      const category: PromptCategory = {
        id: 'test',
        name: 'Test',
        values: [],
        currentValue: { title: '', value: '' }
      }
      promptsData.update((data) => ({ ...data, categories: [category] }))

      updateCategory('test', { name: 'Updated Test' })

      const storeData = get(promptsData)
      expect(storeData.categories[0].name).toBe('Updated Test')
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

    it('should update upscale setting', () => {
      updateUpscale(true)

      const storeData = get(promptsData)
      expect(storeData.useUpscale).toBe(true)
    })

    it('should update face detailer setting', () => {
      updateFaceDetailer(true)

      const storeData = get(promptsData)
      expect(storeData.useFaceDetailer).toBe(true)
    })

    it('should update selected loras', () => {
      const loras = ['lora1', 'lora2']
      updateSelectedLoras(loras)

      const storeData = get(promptsData)
      expect(storeData.selectedLoras).toEqual(loras)
    })

    it('should update lora weight', () => {
      updateLoraWeight(0.7)

      const storeData = get(promptsData)
      expect(storeData.loraWeight).toBe(0.7)
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

    it('should save custom tag', async () => {
      await saveCustomTag('testTag', ['option1', 'option2'], 'random')

      const storeData = get(promptsData)
      expect(storeData.customTags.testTag).toEqual({
        name: 'testTag',
        tags: ['option1', 'option2'],
        type: 'random'
      })

      expect(savePrompts).toHaveBeenCalled()
      // Tags are updated through internal mechanisms
    })
  })

  describe('category ordering', () => {
    it('should reorder categories', () => {
      const categories: PromptCategory[] = [
        { id: 'first', name: 'First', values: [], currentValue: { title: '', value: '' } },
        { id: 'second', name: 'Second', values: [], currentValue: { title: '', value: '' } },
        { id: 'third', name: 'Third', values: [], currentValue: { title: '', value: '' } }
      ]
      promptsData.update((data) => ({ ...data, categories }))

      // Move first item (index 0) to position 2
      reorderCategories(0, 2)

      const storeData = get(promptsData)
      expect(storeData.categories[0].id).toBe('second')
      expect(storeData.categories[1].id).toBe('third')
      expect(storeData.categories[2].id).toBe('first')
    })
  })

  describe('alias handling', () => {
    const categories: PromptCategory[] = [
      {
        id: 'source',
        name: 'Source',
        values: [
          { title: 'Option 1', value: 'opt1' },
          { title: 'Option 2', value: 'opt2' }
        ],
        currentValue: { title: '', value: '' }
      },
      {
        id: 'alias',
        name: 'Alias',
        values: [],
        currentValue: { title: '', value: '' },
        aliasOf: 'source'
      },
      {
        id: 'chainedAlias',
        name: 'Chained Alias',
        values: [],
        currentValue: { title: '', value: '' },
        aliasOf: 'alias'
      }
    ]

    it('should get source category', () => {
      const source = getSourceCategory('source', categories)
      expect(source?.id).toBe('source')
    })

    it('should get source category through alias', () => {
      const source = getSourceCategory('alias', categories)
      expect(source?.id).toBe('source')
    })

    it('should get source category through chained alias', () => {
      const source = getSourceCategory('chainedAlias', categories)
      expect(source?.id).toBe('source')
    })

    it('should return null for non-existent category', () => {
      const source = getSourceCategory('nonexistent', categories)
      expect(source).toBeNull()
    })

    it('should get effective options from source category', () => {
      const aliasCategory = categories.find((c) => c.id === 'alias')!
      const options = getEffectiveOptions(aliasCategory, categories)

      expect(options).toEqual([
        { title: 'Option 1', value: 'opt1' },
        { title: 'Option 2', value: 'opt2' }
      ])
    })

    it('should get effective options from regular category', () => {
      const sourceCategory = categories.find((c) => c.id === 'source')!
      const options = getEffectiveOptions(sourceCategory, categories)

      expect(options).toEqual([
        { title: 'Option 1', value: 'opt1' },
        { title: 'Option 2', value: 'opt2' }
      ])
    })
  })

  describe('autoSaveCurrentValues', () => {
    it('should add new current value to category values', () => {
      const categories: PromptCategory[] = [
        {
          id: 'test',
          name: 'Test',
          values: [{ title: 'Existing', value: 'existing' }],
          currentValue: { title: 'New Value', value: 'new-value' }
        }
      ]
      promptsData.update((data) => ({ ...data, categories }))

      autoSaveCurrentValues()

      const storeData = get(promptsData)
      expect(storeData.categories[0].values).toContainEqual({
        title: 'New Value',
        value: 'new-value'
      })
    })

    it('should update existing value with same title', () => {
      const categories: PromptCategory[] = [
        {
          id: 'test',
          name: 'Test',
          values: [{ title: 'Existing', value: 'old-value' }],
          currentValue: { title: 'Existing', value: 'updated-value' }
        }
      ]
      promptsData.update((data) => ({ ...data, categories }))

      autoSaveCurrentValues()

      const storeData = get(promptsData)
      expect(storeData.categories[0].values[0].value).toBe('updated-value')
    })

    it('should ignore [Random] values', () => {
      const categories: PromptCategory[] = [
        {
          id: 'test',
          name: 'Test',
          values: [],
          currentValue: { title: '[Random]', value: 'random-value' }
        }
      ]
      promptsData.update((data) => ({ ...data, categories }))

      autoSaveCurrentValues()

      const storeData = get(promptsData)
      expect(storeData.categories[0].values).toHaveLength(0)
    })

    it('should ignore empty current values', () => {
      const categories: PromptCategory[] = [
        {
          id: 'test',
          name: 'Test',
          values: [],
          currentValue: { title: '', value: '' }
        }
      ]
      promptsData.update((data) => ({ ...data, categories }))

      autoSaveCurrentValues()

      const storeData = get(promptsData)
      expect(storeData.categories[0].values).toHaveLength(0)
    })
  })
})

import { describe, it, expect } from 'vitest'
import { getTagClasses, getTagRemoveButtonClasses, baseTagClasses } from './tagStyling'
import type { CustomTag } from '../types'

describe('tagStyling utilities', () => {
  describe('getTagClasses', () => {
    it('should return base classes for regular tags', () => {
      const result = getTagClasses({ tag: 'regular-tag' })

      expect(result).toContain(baseTagClasses)
      expect(result).toContain('bg-sky-100 text-sky-800')
      expect(result).toContain('cursor-move hover:shadow-md')
    })

    it('should apply selected styling for regular tags', () => {
      const result = getTagClasses({ tag: 'regular-tag', selected: true })

      expect(result).toContain('bg-sky-200 text-sky-900 border border-sky-500')
    })

    it('should apply random tag styling', () => {
      const customTag: CustomTag = {
        name: 'hair-color',
        type: 'random',
        tags: ['blonde', 'brown']
      }
      const result = getTagClasses({ tag: customTag })

      expect(result).toContain('bg-purple-100 text-purple-800')
      expect(result).toContain('border-1 border-dashed border-purple-400')
    })

    it('should apply selected random tag styling', () => {
      const customTag: CustomTag = {
        name: 'hair-color',
        type: 'random',
        tags: ['blonde', 'brown']
      }
      const result = getTagClasses({ tag: customTag, selected: true })

      expect(result).toContain('bg-purple-200 text-purple-900')
      expect(result).toContain('border-2 border-solid border-purple-500')
    })

    it('should apply consistent-random tag styling', () => {
      const customTag: CustomTag = {
        name: 'eye-color',
        type: 'consistent-random',
        tags: ['blue', 'green']
      }
      const result = getTagClasses({ tag: customTag })

      expect(result).toContain('bg-orange-100 text-orange-800')
      expect(result).toContain('border-1 border-dashed border-orange-400')
    })

    it('should apply selected consistent-random tag styling', () => {
      const customTag: CustomTag = {
        name: 'eye-color',
        type: 'consistent-random',
        tags: ['blue', 'green']
      }
      const result = getTagClasses({ tag: customTag, selected: true })

      expect(result).toContain('bg-orange-200 text-orange-900')
      expect(result).toContain('border-2 border-solid border-orange-500')
    })

    it('should apply sequential tag styling', () => {
      const customTag: CustomTag = {
        name: 'character',
        type: 'sequential',
        tags: ['1girl', 'solo']
      }
      const result = getTagClasses({ tag: customTag })

      expect(result).toContain('bg-purple-100 text-purple-800')
      expect(result).toContain('border-1 border-dashed border-purple-400')
    })

    it('should apply dragged state styling', () => {
      const result = getTagClasses({ tag: 'regular-tag', dragged: true })

      expect(result).toContain('opacity-50 scale-95')
    })

    it('should apply test selected styling', () => {
      const result = getTagClasses({ tag: 'regular-tag', testSelected: true })

      expect(result).toContain('bg-sky-600 text-white border-sky-600')
    })

    it('should include additional classes', () => {
      const result = getTagClasses({
        tag: 'regular-tag',
        additionalClasses: 'custom-class another-class'
      })

      expect(result).toContain('custom-class another-class')
    })

    it('should handle CustomTag objects directly', () => {
      const customTag: CustomTag = {
        name: 'test-tag',
        type: 'random',
        tags: ['tag1', 'tag2']
      }

      const result = getTagClasses({ tag: customTag })

      expect(result).toContain('bg-purple-100 text-purple-800')
    })
  })

  describe('getTagRemoveButtonClasses', () => {
    it('should return base classes with regular tag colors', () => {
      const result = getTagRemoveButtonClasses('regular-tag')

      expect(result).toContain('rounded-full w-4 h-4 inline-flex items-center justify-center')
      expect(result).toContain('text-sky-600 hover:text-sky-800 hover:bg-sky-200')
    })

    it('should return purple classes for random tags', () => {
      const customTag: CustomTag = {
        name: 'hair-color',
        type: 'random',
        tags: ['blonde', 'brown']
      }
      const result = getTagRemoveButtonClasses(customTag)

      expect(result).toContain('text-purple-600 hover:text-purple-800 hover:bg-purple-200')
    })

    it('should return orange classes for consistent-random tags', () => {
      const customTag: CustomTag = {
        name: 'eye-color',
        type: 'consistent-random',
        tags: ['blue', 'green']
      }
      const result = getTagRemoveButtonClasses(customTag)

      expect(result).toContain('text-orange-600 hover:text-orange-800 hover:bg-orange-200')
    })

    it('should return purple classes for sequential tags', () => {
      const customTag: CustomTag = {
        name: 'character',
        type: 'sequential',
        tags: ['1girl', 'solo']
      }
      const result = getTagRemoveButtonClasses(customTag)

      expect(result).toContain('text-purple-600 hover:text-purple-800 hover:bg-purple-200')
    })

    it('should handle CustomTag objects directly', () => {
      const customTag: CustomTag = {
        name: 'test-tag',
        type: 'consistent-random',
        tags: ['tag1', 'tag2']
      }

      const result = getTagRemoveButtonClasses(customTag)

      expect(result).toContain('text-orange-600 hover:text-orange-800 hover:bg-orange-200')
    })
  })
})

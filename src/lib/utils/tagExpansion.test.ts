import { describe, it, expect, beforeEach, vi } from 'vitest'
import { expandCustomTags } from './tagExpansion'
import type { CustomTag } from '../types'

// Mock the testModeStore
vi.mock('../stores/testModeStore.svelte', () => ({
  testModeStore: {}
}))

describe('tagExpansion utilities', () => {
  const mockCustomTags: Record<string, CustomTag> = {
    'hair-color': {
      name: 'hair-color',
      type: 'random',
      tags: ['blonde hair', 'brown hair', 'black hair']
    },
    'eye-color': {
      name: 'eye-color',
      type: 'consistent-random',
      tags: ['blue eyes', 'green eyes', 'brown eyes']
    },
    'character-base': {
      name: 'character-base',
      type: 'sequential',
      tags: ['1girl', 'solo', 'looking at viewer']
    },
    'weighted-tag': {
      name: 'weighted-tag',
      type: 'sequential',
      tags: ['detailed', 'high quality'],
      weight: 1.2
    }
  }

  beforeEach(() => {
    // Reset crypto mock for each test
    Object.defineProperty(global, 'crypto', {
      value: {
        getRandomValues: vi.fn().mockReturnValue(new Uint32Array([0]))
      },
      writable: true
    })
  })

  describe('expandCustomTags', () => {
    it('should return regular tags unchanged', () => {
      const result = expandCustomTags(['red dress', 'smile'], mockCustomTags)

      expect(result.expandedTags).toEqual(['red dress', 'smile'])
      expect(result.randomTagResolutions).toEqual({})
    })

    it('should expand sequential custom tags', () => {
      const result = expandCustomTags(['character-base'], mockCustomTags)

      expect(result.expandedTags).toEqual(['1girl', 'solo', 'looking at viewer'])
      expect(result.randomTagResolutions['character-base']).toBe('1girl, solo, looking at viewer')
    })

    it('should expand random custom tags', () => {
      const result = expandCustomTags(['hair-color'], mockCustomTags)

      expect(result.expandedTags).toHaveLength(1)
      expect(['blonde hair', 'brown hair', 'black hair']).toContain(result.expandedTags[0])
      expect(result.randomTagResolutions['hair-color']).toBeDefined()
    })

    it('should expand consistent-random custom tags', () => {
      const result = expandCustomTags(['eye-color'], mockCustomTags)

      expect(result.expandedTags).toHaveLength(1)
      expect(['blue eyes', 'green eyes', 'brown eyes']).toContain(result.expandedTags[0])
      expect(result.randomTagResolutions['eye-color']).toBeDefined()
    })

    it('should handle tags with weights', () => {
      const result = expandCustomTags(['red dress:1.3'], mockCustomTags)

      expect(result.expandedTags).toEqual(['(red dress:1.3)'])
    })

    it('should skip weight formatting for weight 1.0', () => {
      const result = expandCustomTags(['red dress:1.0'], mockCustomTags)

      expect(result.expandedTags).toEqual(['red dress'])
    })

    it('should apply weight to expanded custom tags', () => {
      const result = expandCustomTags(['character-base:1.5'], mockCustomTags)

      expect(result.expandedTags).toEqual(['(1girl, solo, looking at viewer:1.5)'])
      expect(result.randomTagResolutions['character-base']).toBe('1girl, solo, looking at viewer')
    })

    it('should use existing random resolutions for consistent-random tags', () => {
      const existingResolutions = { 'eye-color': 'blue eyes' }
      const result = expandCustomTags(['eye-color'], mockCustomTags, new Set(), existingResolutions)

      expect(result.expandedTags).toEqual(['blue eyes'])
      expect(result.randomTagResolutions['eye-color']).toBe('blue eyes')
    })

    it('should use previous zone random results during regen', () => {
      const previousResults = { 'hair-color': 'brown hair' }
      const result = expandCustomTags(
        ['hair-color'],
        mockCustomTags,
        new Set(),
        {},
        previousResults
      )

      expect(result.expandedTags).toEqual(['brown hair'])
      expect(result.randomTagResolutions['hair-color']).toBe('brown hair')
    })

    it('should handle nested custom tag expansion', () => {
      const nestedCustomTags = {
        ...mockCustomTags,
        'full-character': {
          name: 'full-character',
          type: 'sequential' as const,
          tags: ['character-base', 'hair-color']
        }
      }

      const result = expandCustomTags(['full-character'], nestedCustomTags)

      expect(result.expandedTags).toHaveLength(4) // 3 from character-base + 1 from hair-color
      expect(result.expandedTags.slice(0, 3)).toEqual(['1girl', 'solo', 'looking at viewer'])
      expect(['blonde hair', 'brown hair', 'black hair']).toContain(result.expandedTags[3])
    })

    it('should prevent circular references', () => {
      const circularCustomTags = {
        'tag-a': {
          name: 'tag-a',
          type: 'sequential' as const,
          tags: ['tag-b']
        },
        'tag-b': {
          name: 'tag-b',
          type: 'sequential' as const,
          tags: ['tag-a']
        }
      }

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = expandCustomTags(['tag-a'], circularCustomTags)

      expect(result.expandedTags).toEqual([])
      expect(consoleSpy).toHaveBeenCalledWith('Circular reference detected for tag: tag-a')

      consoleSpy.mockRestore()
    })

    it('should handle empty custom tag lists', () => {
      const emptyCustomTags = {
        'empty-random': {
          name: 'empty-random',
          type: 'random' as const,
          tags: []
        }
      }

      const result = expandCustomTags(['empty-random'], emptyCustomTags)

      expect(result.expandedTags).toEqual([])
      expect(result.randomTagResolutions).toEqual({})
    })

    it('should handle multiple tags in single call', () => {
      const result = expandCustomTags(['character-base', 'red dress', 'hair-color'], mockCustomTags)

      expect(result.expandedTags).toHaveLength(5) // 3 + 1 + 1
      expect(result.expandedTags.slice(0, 3)).toEqual(['1girl', 'solo', 'looking at viewer'])
      expect(result.expandedTags[3]).toBe('red dress')
      expect(['blonde hair', 'brown hair', 'black hair']).toContain(result.expandedTags[4])
    })
  })
})

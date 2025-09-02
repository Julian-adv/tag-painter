import { describe, it, expect } from 'vitest'
import {
  extractCompositionDirective,
  updateCompositionDirective,
  extractDisablesDirective,
  updateDisablesDirective
} from './utils'

describe('TreeEdit composition directive utilities', () => {
  describe('extractCompositionDirective', () => {
    it('should extract composition directive from string', () => {
      expect(extractCompositionDirective('beautiful woman, composition=all, blue eyes')).toBe('all')
      expect(extractCompositionDirective('composition=2h')).toBe('2h')
      expect(extractCompositionDirective('portrait, composition=2v, detailed')).toBe('2v')
    })

    it('should be case insensitive', () => {
      expect(extractCompositionDirective('Beautiful Woman, COMPOSITION=ALL')).toBe('all')
      expect(extractCompositionDirective('Composition=2H')).toBe('2h')
    })

    it('should return null when no composition found', () => {
      expect(extractCompositionDirective('beautiful woman, blue eyes')).toBe(null)
      expect(extractCompositionDirective('')).toBe(null)
      expect(extractCompositionDirective('composition=')).toBe(null)
    })

    it('should handle non-string values', () => {
      expect(extractCompositionDirective(null as unknown as string)).toBe(null)
      expect(extractCompositionDirective(undefined as unknown as string)).toBe(null)
      expect(extractCompositionDirective(123 as unknown as string)).toBe(null)
    })
  })

  describe('updateCompositionDirective', () => {
    it('should add composition directive to empty string', () => {
      expect(updateCompositionDirective('', 'all')).toBe('composition=all')
      expect(updateCompositionDirective('', '2h')).toBe('composition=2h')
    })

    it('should add composition directive to existing content', () => {
      expect(updateCompositionDirective('beautiful woman', 'all')).toBe(
        'beautiful woman, composition=all'
      )
      expect(updateCompositionDirective('portrait, detailed', '2v')).toBe(
        'portrait, detailed, composition=2v'
      )
    })

    it('should replace existing composition directive', () => {
      expect(updateCompositionDirective('beautiful woman, composition=all', '2h')).toBe(
        'beautiful woman, composition=2h'
      )
      expect(updateCompositionDirective('composition=2v, blue eyes', 'all')).toBe(
        'composition=all, blue eyes'
      )
    })

    it('should remove composition directive when empty value provided', () => {
      expect(updateCompositionDirective('beautiful woman, composition=all, blue eyes', '')).toBe(
        'beautiful woman, blue eyes'
      )
      expect(updateCompositionDirective('composition=2h', '')).toBe('')
      expect(updateCompositionDirective('composition=all, portrait', '')).toBe('portrait')
    })

    it('should handle multiple composition directives', () => {
      expect(updateCompositionDirective('composition=all, composition=2h', '2v')).toBe(
        'composition=2v, composition=2v'
      )
    })

    it('should clean up extra commas and whitespace when removing', () => {
      expect(updateCompositionDirective('tag1, composition=all, tag2', '')).toBe('tag1, tag2')
      expect(updateCompositionDirective('composition=all, , tag2', '')).toBe('tag2')
      expect(updateCompositionDirective('tag1, ,composition=all', '')).toBe('tag1')
    })

    it('should handle non-string values', () => {
      expect(updateCompositionDirective(null as unknown as string, 'all')).toBe('composition=all')
      expect(updateCompositionDirective(undefined as unknown as string, '2h')).toBe(
        'composition=2h'
      )
    })
  })
})

describe('TreeEdit disables directive utilities', () => {
  describe('extractDisablesDirective', () => {
    it('should extract disables list from string', () => {
      expect(extractDisablesDirective('foo, disables=[a, b, c], bar')).toEqual(['a', 'b', 'c'])
      expect(extractDisablesDirective('disables=[x]')).toEqual(['x'])
    })

    it('should be case insensitive on directive keyword', () => {
      expect(extractDisablesDirective('DISABLES=[A, B]')).toEqual(['A', 'B'])
    })

    it('should return empty array if none', () => {
      expect(extractDisablesDirective('foo, bar')).toEqual([])
      expect(extractDisablesDirective('')).toEqual([])
    })
  })

  describe('updateDisablesDirective', () => {
    it('should add disables directive to empty string', () => {
      expect(updateDisablesDirective('', ['a', 'b'])).toBe('disables=[a, b]')
    })

    it('should append disables directive to existing content', () => {
      expect(updateDisablesDirective('foo, bar', ['a'])).toBe('foo, bar, disables=[a]')
    })

    it('should replace existing disables directive', () => {
      expect(updateDisablesDirective('x, disables=[a, b], y', ['c'])).toBe('x, y, disables=[c]')
    })

    it('should remove disables directive when list empty', () => {
      expect(updateDisablesDirective('foo, disables=[a, b], bar', [])).toBe('foo, bar')
      expect(updateDisablesDirective('disables=[a]', [])).toBe('')
    })
  })
})

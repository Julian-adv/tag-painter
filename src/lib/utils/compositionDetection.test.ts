import { describe, it, expect } from 'vitest'
import { detectCompositionFromTags } from './tagExpansion'

describe('detectCompositionFromTags', () => {
  it('should detect composition=all', () => {
    const tags = ['beautiful woman', 'composition=all', 'blue eyes']
    const result = detectCompositionFromTags(tags)
    expect(result).toBe('all')
  })

  it('should detect composition=2h', () => {
    const tags = ['beautiful woman', 'composition=2h', 'blue eyes']
    const result = detectCompositionFromTags(tags)
    expect(result).toBe('left-horizontal')
  })

  it('should detect composition=2v', () => {
    const tags = ['beautiful woman', 'composition=2v', 'blue eyes']
    const result = detectCompositionFromTags(tags)
    expect(result).toBe('top-vertical')
  })

  it('should be case insensitive', () => {
    const tags = ['Beautiful Woman', 'COMPOSITION=ALL', 'Blue Eyes']
    const result = detectCompositionFromTags(tags)
    expect(result).toBe('all')
  })

  it('should return null when no composition is found', () => {
    const tags = ['beautiful woman', 'blue eyes', 'portrait']
    const result = detectCompositionFromTags(tags)
    expect(result).toBe(null)
  })

  it('should find composition in complex tag strings', () => {
    const tags = ['beautiful woman, portrait, composition=2h, detailed']
    const result = detectCompositionFromTags(tags)
    expect(result).toBe('left-horizontal')
  })

  it('should return the first matching composition when multiple are present', () => {
    const tags = ['composition=all', 'composition=2h']
    const result = detectCompositionFromTags(tags)
    expect(result).toBe('all') // First one found
  })
})

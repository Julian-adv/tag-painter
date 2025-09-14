import { describe, it, expect } from 'vitest'
import { formatCommaSeparatedValues, isCommaSeparated } from './textFormatting'

describe('formatCommaSeparatedValues', () => {
  it('should add space after comma when missing', () => {
    expect(formatCommaSeparatedValues('a,b,c')).toBe('a, b, c')
  })

  it('should preserve existing proper spacing', () => {
    expect(formatCommaSeparatedValues('a, b, c')).toBe('a, b, c')
  })

  it('should normalize multiple spaces after comma to single space', () => {
    expect(formatCommaSeparatedValues('a,  b,   c')).toBe('a, b, c')
  })

  it('should handle mixed spacing scenarios', () => {
    expect(formatCommaSeparatedValues('a,b, c,  d')).toBe('a, b, c, d')
  })

  it('should handle single item without commas', () => {
    expect(formatCommaSeparatedValues('single')).toBe('single')
  })

  it('should handle empty string', () => {
    expect(formatCommaSeparatedValues('')).toBe('')
  })

  it('should handle leading and trailing spaces', () => {
    expect(formatCommaSeparatedValues('  a,b,c  ')).toBe('a, b, c')
  })

  it('should handle comma at start or end', () => {
    expect(formatCommaSeparatedValues(',a,b,c,')).toBe(', a, b, c,')
  })
})

describe('isCommaSeparated', () => {
  it('should return true for comma-separated text', () => {
    expect(isCommaSeparated('a,b,c')).toBe(true)
    expect(isCommaSeparated('a, b, c')).toBe(true)
  })

  it('should return false for single item', () => {
    expect(isCommaSeparated('single')).toBe(false)
  })

  it('should return false for empty string', () => {
    expect(isCommaSeparated('')).toBe(false)
  })

  it('should return true even for just comma', () => {
    expect(isCommaSeparated(',')).toBe(true)
  })
})
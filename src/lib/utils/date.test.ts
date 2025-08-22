import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getTodayDate, getFormattedTime } from './date'

describe('date utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getTodayDate', () => {
    it('should return date in yyyy-mm-dd format', () => {
      const mockDate = new Date('2024-03-15T10:30:45')
      vi.setSystemTime(mockDate)

      const result = getTodayDate()
      expect(result).toBe('2024-03-15')
    })

    it('should pad single digit months and days with zero', () => {
      const mockDate = new Date('2024-01-05T10:30:45')
      vi.setSystemTime(mockDate)

      const result = getTodayDate()
      expect(result).toBe('2024-01-05')
    })

    it('should handle end of year correctly', () => {
      const mockDate = new Date('2023-12-31T23:59:59')
      vi.setSystemTime(mockDate)

      const result = getTodayDate()
      expect(result).toBe('2023-12-31')
    })
  })

  describe('getFormattedTime', () => {
    it('should return time in HH-MM-SS format', () => {
      const mockDate = new Date('2024-03-15T14:25:30')
      vi.setSystemTime(mockDate)

      const result = getFormattedTime()
      expect(result).toBe('14-25-30')
    })

    it('should pad single digit hours, minutes, and seconds with zero', () => {
      const mockDate = new Date('2024-03-15T08:05:09')
      vi.setSystemTime(mockDate)

      const result = getFormattedTime()
      expect(result).toBe('08-05-09')
    })

    it('should handle midnight correctly', () => {
      const mockDate = new Date('2024-03-15T00:00:00')
      vi.setSystemTime(mockDate)

      const result = getFormattedTime()
      expect(result).toBe('00-00-00')
    })

    it('should handle noon correctly', () => {
      const mockDate = new Date('2024-03-15T12:00:00')
      vi.setSystemTime(mockDate)

      const result = getFormattedTime()
      expect(result).toBe('12-00-00')
    })
  })
})

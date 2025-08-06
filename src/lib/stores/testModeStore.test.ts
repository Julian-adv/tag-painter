import { describe, it, expect, beforeEach } from 'vitest'
import {
  testModeStore,
  setTagTestMode,
  setTestModeOverride,
  removeTestModeOverride
} from './testModeStore.svelte'

describe('testModeStore', () => {
  beforeEach(() => {
    // Clear the store before each test
    Object.keys(testModeStore).forEach((key) => {
      delete testModeStore[key]
    })
  })

  describe('setTagTestMode', () => {
    it('should create new tag test state when tag does not exist', () => {
      setTagTestMode('new-tag', true)

      expect(testModeStore['new-tag']).toEqual({
        enabled: true,
        overrideTag: undefined
      })
    })

    it('should update enabled state when tag already exists', () => {
      testModeStore['existing-tag'] = { enabled: false, overrideTag: 'some-tag' }

      setTagTestMode('existing-tag', true)

      expect(testModeStore['existing-tag']).toEqual({
        enabled: true,
        overrideTag: 'some-tag'
      })
    })

    it('should disable test mode', () => {
      setTagTestMode('test-tag', false)

      expect(testModeStore['test-tag']).toEqual({
        enabled: false,
        overrideTag: undefined
      })
    })
  })

  describe('setTestModeOverride', () => {
    it('should create new tag test state with override when tag does not exist', () => {
      setTestModeOverride('new-tag', 'override-value')

      expect(testModeStore['new-tag']).toEqual({
        enabled: true,
        overrideTag: 'override-value'
      })
    })

    it('should update existing tag with override and enable it', () => {
      testModeStore['existing-tag'] = { enabled: false, overrideTag: undefined }

      setTestModeOverride('existing-tag', 'new-override')

      expect(testModeStore['existing-tag']).toEqual({
        enabled: true,
        overrideTag: 'new-override'
      })
    })

    it('should replace existing override value', () => {
      testModeStore['test-tag'] = { enabled: true, overrideTag: 'old-override' }

      setTestModeOverride('test-tag', 'new-override')

      expect(testModeStore['test-tag']).toEqual({
        enabled: true,
        overrideTag: 'new-override'
      })
    })
  })

  describe('removeTestModeOverride', () => {
    it('should disable test mode and clear override when tag exists', () => {
      testModeStore['test-tag'] = { enabled: true, overrideTag: 'some-override' }

      removeTestModeOverride('test-tag')

      expect(testModeStore['test-tag']).toEqual({
        enabled: false,
        overrideTag: undefined
      })
    })

    it('should handle removing override from non-existent tag gracefully', () => {
      removeTestModeOverride('non-existent-tag')

      expect(testModeStore['non-existent-tag']).toBeUndefined()
    })

    it('should handle removing override from tag with no override', () => {
      testModeStore['test-tag'] = { enabled: true, overrideTag: undefined }

      removeTestModeOverride('test-tag')

      expect(testModeStore['test-tag']).toEqual({
        enabled: false,
        overrideTag: undefined
      })
    })
  })

  describe('store state management', () => {
    it('should maintain separate state for different tags', () => {
      setTagTestMode('tag1', true)
      setTestModeOverride('tag2', 'override-value')

      expect(testModeStore['tag1']).toEqual({
        enabled: true,
        overrideTag: undefined
      })
      expect(testModeStore['tag2']).toEqual({
        enabled: true,
        overrideTag: 'override-value'
      })
    })

    it('should allow independent modification of different tags', () => {
      setTagTestMode('tag1', true)
      setTagTestMode('tag2', true)

      removeTestModeOverride('tag1')

      expect(testModeStore['tag1']).toEqual({
        enabled: false,
        overrideTag: undefined
      })
      expect(testModeStore['tag2']).toEqual({
        enabled: true,
        overrideTag: undefined
      })
    })
  })
})

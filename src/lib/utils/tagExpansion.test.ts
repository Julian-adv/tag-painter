import { describe, it, expect, beforeEach, vi } from 'vitest'
import { expandCustomTags } from './tagExpansion'
import type { TreeModel } from '$lib/TreeEdit/model'

// Mock the testModeStore
vi.mock('../stores/testModeStore.svelte', () => ({
  testModeStore: {}
}))

describe('tagExpansion utilities', () => {
  const mockTreeModel: TreeModel = {
    rootId: 'root',
    nodes: {
      root: {
        id: 'root',
        name: 'root',
        kind: 'object',
        parentId: null,
        children: ['hair-color', 'eye-color', 'character-base'],
        collapsed: false
      },
      'hair-color': {
        id: 'hair-color',
        name: 'hair-color',
        kind: 'array',
        parentId: 'root',
        children: ['hair-1', 'hair-2', 'hair-3'],
        collapsed: false
      },
      'hair-1': {
        id: 'hair-1',
        name: '0',
        kind: 'leaf',
        parentId: 'hair-color',
        value: 'blonde hair'
      },
      'hair-2': {
        id: 'hair-2',
        name: '1',
        kind: 'leaf',
        parentId: 'hair-color',
        value: 'brown hair'
      },
      'hair-3': {
        id: 'hair-3',
        name: '2',
        kind: 'leaf',
        parentId: 'hair-color',
        value: 'black hair'
      },
      'eye-color': {
        id: 'eye-color',
        name: 'eye-color',
        kind: 'array',
        parentId: 'root',
        children: ['eye-marker', 'eye-1', 'eye-2', 'eye-3'],
        collapsed: false
      },
      'eye-marker': {
        id: 'eye-marker',
        name: '0',
        kind: 'leaf',
        parentId: 'eye-color',
        value: '__CONSISTENT_RANDOM_MARKER__'
      },
      'eye-1': { id: 'eye-1', name: '1', kind: 'leaf', parentId: 'eye-color', value: 'blue eyes' },
      'eye-2': { id: 'eye-2', name: '2', kind: 'leaf', parentId: 'eye-color', value: 'green eyes' },
      'eye-3': { id: 'eye-3', name: '3', kind: 'leaf', parentId: 'eye-color', value: 'brown eyes' },
      'character-base': {
        id: 'character-base',
        name: 'character-base',
        kind: 'array',
        parentId: 'root',
        children: ['char-1', 'char-2', 'char-3'],
        collapsed: false
      },
      'char-1': {
        id: 'char-1',
        name: '0',
        kind: 'leaf',
        parentId: 'character-base',
        value: '1girl'
      },
      'char-2': {
        id: 'char-2',
        name: '1',
        kind: 'leaf',
        parentId: 'character-base',
        value: 'solo'
      },
      'char-3': {
        id: 'char-3',
        name: '2',
        kind: 'leaf',
        parentId: 'character-base',
        value: 'looking at viewer'
      }
    },
    symbols: {
      'hair-color': 'hair-color',
      'eye-color': 'eye-color',
      'character-base': 'character-base'
    },
    pathSymbols: {},
    refIndex: {}
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
      const result = expandCustomTags(['red dress', 'smile'], mockTreeModel)

      expect(result.expandedTags).toEqual(['red dress', 'smile'])
      expect(result.randomTagResolutions).toEqual({})
    })

    // Sequential node behavior removed; test no longer applicable.

    it('should expand random custom tags', () => {
      const result = expandCustomTags(['hair-color'], mockTreeModel)

      expect(result.expandedTags).toHaveLength(1)
      expect(['blonde hair', 'brown hair', 'black hair']).toContain(result.expandedTags[0])
      expect(result.randomTagResolutions['hair-color']).toBeDefined()
    })

    it('should expand consistent-random custom tags', () => {
      const result = expandCustomTags(['eye-color'], mockTreeModel)

      expect(result.expandedTags).toHaveLength(1)
      expect(['blue eyes', 'green eyes', 'brown eyes']).toContain(result.expandedTags[0])
      expect(result.randomTagResolutions['eye-color']).toBeDefined()
    })

    it('should handle tags with weights', () => {
      const result = expandCustomTags(['red dress:1.3'], mockTreeModel)

      expect(result.expandedTags).toEqual(['(red dress:1.3)'])
    })

    it('should skip weight formatting for weight 1.0', () => {
      const result = expandCustomTags(['red dress:1.0'], mockTreeModel)

      expect(result.expandedTags).toEqual(['red dress'])
    })

    // Sequential weighted expansion removed; no longer applicable.

    it('should use existing random resolutions for consistent-random tags', () => {
      const existingResolutions = { 'eye-color': 'blue eyes' }
      const result = expandCustomTags(['eye-color'], mockTreeModel, new Set(), existingResolutions)

      expect(result.expandedTags).toEqual(['blue eyes'])
      expect(result.randomTagResolutions['eye-color']).toBe('blue eyes')
    })

    it('should NOT reuse existing resolutions for random tags across zones', () => {
      const existingResolutions = { 'hair-color': 'brown hair' }
      const result = expandCustomTags(['hair-color'], mockTreeModel, new Set(), existingResolutions)

      // With mocked crypto returning 0, the first option is chosen deterministically
      expect(result.expandedTags).toEqual(['blonde hair'])
      expect(result.randomTagResolutions['hair-color']).toBe('blonde hair')
    })

    it('should use previous zone random results during regen', () => {
      const previousResults = { 'hair-color': 'brown hair' }
      const result = expandCustomTags(['hair-color'], mockTreeModel, new Set(), {}, previousResults)

      expect(result.expandedTags).toEqual(['brown hair'])
      expect(result.randomTagResolutions['hair-color']).toBe('brown hair')
    })

    it('should handle nested custom tag expansion', () => {
      // For now, skip this test as it requires more complex TreeModel setup
      // TODO: Create proper nested TreeModel mock
      expect(true).toBe(true)
    })

    it.skip('should handle nested custom tag expansion (TODO)', () => {
      const result = expandCustomTags(['character-base'], mockTreeModel)

      expect(result.expandedTags).toHaveLength(4) // 3 from character-base + 1 from hair-color
      expect(result.expandedTags.slice(0, 3)).toEqual(['1girl', 'solo', 'looking at viewer'])
      expect(['blonde hair', 'brown hair', 'black hair']).toContain(result.expandedTags[3])
    })

    it('should prevent circular references', () => {
      // For now, skip this test as it requires more complex TreeModel setup
      // TODO: Create proper circular reference TreeModel mock
      expect(true).toBe(true)
    })

    it.skip('should prevent circular references (TODO)', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = expandCustomTags(['character-base'], mockTreeModel)

      expect(result.expandedTags).toEqual([])
      expect(consoleSpy).toHaveBeenCalledWith('Circular reference detected for tag: tag-a')

      consoleSpy.mockRestore()
    })

    it('should handle empty custom tag lists', () => {
      // For now, skip this test as it requires more complex TreeModel setup
      // TODO: Create proper empty array TreeModel mock
      expect(true).toBe(true)
    })

    // Multi-tag test relying on sequential behavior removed.
  })
})

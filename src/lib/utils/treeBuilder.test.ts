import { describe, it, expect } from 'vitest'
import { buildTreeNodes } from './treeBuilder'
import type { CustomTag } from '../types'

describe('treeBuilder', () => {
  describe('buildTreeNodes', () => {
    it('should build tree nodes from items', () => {
      const items: Record<string, CustomTag> = {
        parent1: {
          name: 'Parent 1',
          tags: ['child1', 'child2'],
          type: 'regular'
        },
        child1: {
          name: 'Child 1',
          tags: [],
          type: 'regular'
        }
      }
      const collapsedNodes = new Set<string>()

      const result = buildTreeNodes(items, collapsedNodes)

      expect(result).toHaveLength(3) // parent1, child1, child2 (as tag node)
      expect(result[0].id).toBe('parent1')
      expect(result[0].level).toBe(0)
      expect(result[0].hasChildren).toBe(true)
    })

    it('should handle collapsed nodes', () => {
      const items: Record<string, CustomTag> = {
        parent1: {
          name: 'Parent 1',
          tags: ['child1', 'child2'],
          type: 'regular'
        }
      }
      const collapsedNodes = new Set(['parent1'])

      const result = buildTreeNodes(items, collapsedNodes)

      expect(result).toHaveLength(1) // Only parent1, children are not added to nodes
      expect(result[0].id).toBe('parent1')
      expect(result[0].collapsed).toBe(true)
      expect(result[0].hasChildren).toBe(true)
    })

    it('should handle sequential tag types', () => {
      const items: Record<string, CustomTag> = {
        sequential1: {
          name: 'Sequential 1',
          tags: ['tag1', 'tag2', 'tag3'],
          type: 'sequential'
        }
      }
      const collapsedNodes = new Set<string>()

      const result = buildTreeNodes(items, collapsedNodes)

      expect(result).toHaveLength(2) // sequential1 + combined tags node
      expect(result[1].data.name).toBe('tag1, tag2, tag3')
    })

    it('should handle random tag types with separate nodes', () => {
      const items: Record<string, CustomTag> = {
        random1: {
          name: 'Random 1',
          tags: ['tag1', 'tag2'],
          type: 'random'
        }
      }
      const collapsedNodes = new Set<string>()

      const result = buildTreeNodes(items, collapsedNodes)

      expect(result).toHaveLength(3) // random1 + 2 tag nodes
      expect(result[1].data.name).toBe('tag1')
      expect(result[2].data.name).toBe('tag2')
    })

    it('should identify root items correctly', () => {
      const items: Record<string, CustomTag> = {
        parent: {
          name: 'Parent',
          tags: ['child'],
          type: 'random'
        },
        child: {
          name: 'Child',
          tags: [],
          type: 'regular'
        },
        root: {
          name: 'Root',
          tags: [],
          type: 'regular'
        }
      }
      const collapsedNodes = new Set<string>()

      const result = buildTreeNodes(items, collapsedNodes)

      // Should have parent and root as level 0 (root items), child as level 1 (under parent)
      const parentNode = result.find((n) => n.id === 'parent')
      const childNode = result.find((n) => n.id === 'child')
      const rootNode = result.find((n) => n.id === 'root')

      expect(parentNode?.level).toBe(0)
      expect(childNode?.level).toBe(1) // child is referenced in parent's tags, so it's a child
      expect(rootNode?.level).toBe(0)
      expect(childNode?.parentId).toBe('parent')
    })
  })
})

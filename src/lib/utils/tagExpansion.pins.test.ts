import { describe, it, expect, vi, beforeEach } from 'vitest'
import { expandCustomTags } from './tagExpansion'
import { testModeStore } from '../stores/testModeStore.svelte'
import { fromYAML } from '../TreeEdit/yaml-io'

// Mock store as a plain object for tests
vi.mock('../stores/testModeStore.svelte', () => ({
  testModeStore: {}
}))

describe('expandCustomTags - pin preference through arrays/objects', () => {
  beforeEach(() => {
    // deterministic selection
    Object.defineProperty(global, 'crypto', {
      value: { getRandomValues: vi.fn().mockReturnValue(new Uint32Array([0])) },
      writable: true
    })
    // clear pins
    Object.keys(testModeStore).forEach((k) => delete testModeStore[k])
  })

  it('prefers array option that leads to a pinned descendant (via placeholder)', () => {
    const yaml = `
pose:
  d:
    - 1girl
    - __pose/gaze__
    - __pose/act__
  gaze:
    - stare
  act:
    2girls:
      - pinned
      - alt
`
    const model = fromYAML(yaml)
    testModeStore['pose/act/2girls'] = {
      enabled: true,
      overrideTag: 'pinned',
      pinnedLeafPath: undefined
    }

    const { expandedText } = expandCustomTags('pose/d', model)
    expect(expandedText).toContain('pinned')
  })

  it('breaks ties randomly (weighted) among multiple pinned-leading options', () => {
    const yaml = `
pose:
  d:
    - __pose/gaze__
    - __pose/act__
  gaze:
    choice:
      - g1
      - g2
  act:
    2girls:
      - a1
      - a2
`
    const model = fromYAML(yaml)
    // Pin both branches
    testModeStore['pose/gaze/choice'] = {
      enabled: true,
      overrideTag: 'g2',
      pinnedLeafPath: undefined
    }
    testModeStore['pose/act/2girls'] = {
      enabled: true,
      overrideTag: 'a2',
      pinnedLeafPath: undefined
    }

    const { expandedText } = expandCustomTags('pose/d', model)
    // With mocked crypto=0 and equal weights, the first pinned-leading option is selected
    expect(expandedText).toContain('g2')
  })

  it('prefers option with placeholder referencing a directly pinned array', () => {
    // This tests the case where:
    // - all has children: "leaf a" and "leaf b __whole__"
    // - whole is a separate array with children: "leaf c", "leaf d"
    // - user pins whole to "leaf c"
    // - expanding all should select "leaf b __whole__" (which leads to pinned whole)
    const yaml = `
all:
  - leaf a
  - leaf b __whole__
whole:
  - leaf c
  - leaf d
`
    const model = fromYAML(yaml)
    // Pin the whole array directly
    testModeStore['whole'] = {
      enabled: true,
      overrideTag: 'leaf c',
      pinnedLeafPath: undefined
    }

    const { expandedText } = expandCustomTags('all', model)
    // Should select "leaf b __whole__" and expand __whole__ to "leaf c"
    expect(expandedText).toBe('leaf b leaf c')
  })

  it('handles nested placeholders with pinned array at any depth', () => {
    const yaml = `
root:
  - option a
  - option b __middle__
middle:
  - mid a
  - mid b __inner__
inner:
  - inner1
  - inner2
`
    const model = fromYAML(yaml)
    // Pin the inner array
    testModeStore['inner'] = {
      enabled: true,
      overrideTag: 'inner2',
      pinnedLeafPath: undefined
    }

    const { expandedText } = expandCustomTags('root', model)
    // Should follow: root -> "option b __middle__" -> "mid b __inner__" -> "inner2"
    expect(expandedText).toContain('inner2')
  })
})

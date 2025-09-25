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
})

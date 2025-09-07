import { describe, it, expect, vi, beforeEach } from 'vitest'
import { expandCustomTags } from './tagExpansion'
import { testModeStore } from '../stores/testModeStore.svelte'
import { fromYAML } from '../TreeEdit/yaml-io'

// Keep testModeStore empty by default; overrides come from previousRunResults
vi.mock('../stores/testModeStore.svelte', () => ({
  testModeStore: {}
}))

describe('expandCustomTags - disables directive', () => {
  let model: ReturnType<typeof fromYAML>

  beforeEach(() => {
    const yaml = `
pose:
  d:
    - __pose/action__
  action:
    pull:
      - pulls, disables=[outfit/d]
      - alt
outfit:
  d:
    - outfitA
`
    model = fromYAML(yaml)
    // Clear any pins/overrides
    Object.keys(testModeStore).forEach((k) => delete testModeStore[k])
  })

  it('applies disables from selected option to suppress later tags (pinned selection)', () => {
    // Pin the array to select the item that carries disables, preserving directive text
    testModeStore['pose/action/pull'] = {
      enabled: true,
      overrideTag: 'pulls, disables=[outfit/d]',
      pinnedLeafPath: undefined
    }
    const { expandedTags } = expandCustomTags(['pose/d', 'outfit/d'], model, new Set(), {}, {})

    expect(expandedTags.join(',')).toContain('pulls')
    // outfitA should be removed by disables=[outfit/d]
    expect(expandedTags.join(',')).not.toContain('outfitA')
  })

  it('does not suppress when a non-selected option contains disables (no prev)', () => {
    // Mutate model to put a disables on the first option and select the second via pin
    // Pin to select second option "alt" using testModeStore override
    testModeStore['pose/action/pull'] = {
      enabled: true,
      overrideTag: 'alt',
      pinnedLeafPath: undefined
    }
    const { expandedTags } = expandCustomTags(['pose/d', 'outfit/d'], model, new Set(), {}, {})

    expect(expandedTags.join(',')).toContain('alt')
    // No disables collected → outfit should remain
    expect(expandedTags.join(',')).toContain('outfitA')
  })

  it('removes previously expanded, weight-wrapped outputs via disables filter (pinned selection)', () => {
    testModeStore['pose/action/pull'] = {
      enabled: true,
      overrideTag: 'pulls, disables=[outfit/d]',
      pinnedLeafPath: undefined
    }
    // Expand outfit first with a weight, then pose which disables outfit
    const { expandedTags } = expandCustomTags(['outfit/d:1.3', 'pose/d'], model, new Set(), {}, {})

    expect(expandedTags.join(',')).toContain('pulls')
    // The earlier (outfitA:1.3) should be removed by the disables filter
    expect(expandedTags.join(',')).not.toContain('(outfitA:1.3)')
  })

  it('shared disables context suppresses across separate calls (zones, pinned selection)', () => {
    testModeStore['pose/action/pull'] = {
      enabled: true,
      overrideTag: 'pulls, disables=[outfit/d]',
      pinnedLeafPath: undefined
    }
    const sharedDisables = { names: new Set<string>(), patterns: [] as string[] }

    // First zone collects disables
    const z1 = expandCustomTags(['pose/d'], model, new Set(), {}, {}, sharedDisables)
    expect(z1.expandedTags.join(',')).toContain('pulls')
    expect(sharedDisables.names.has('outfit/d')).toBe(true)

    // Second zone should respect disables and drop outfit
    const z2 = expandCustomTags(['outfit/d'], model, new Set(), {}, {}, sharedDisables)
    expect(z2.expandedTags.join(',')).not.toContain('outfitA')
  })

  it('container disables (e.g., background) suppress any descendant expansions', () => {
    const yaml = `
pose:
  action:
    shower:
      - wet, disables=[background]
background:
  outdoor:
    - sky, water
  indoors:
    - window
`
    const model2 = fromYAML(yaml)
    const prev = {
      'pose/action/shower': 'wet, disables=[background]'
    } as Record<string, string>
    const { expandedTags } = expandCustomTags(
      ['pose/action/shower', 'background'],
      model2,
      new Set(),
      {},
      prev
    )
    expect(expandedTags.join(',')).toContain('wet')
    expect(expandedTags.join(',')).not.toContain('sky')
    expect(expandedTags.join(',')).not.toContain('window')
  })
})

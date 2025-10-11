// Utility functions for reading and writing wildcard zone data
import { refreshWildcardsFromServer, getWildcardModel } from '../stores/tagsStore'
import { saveWildcardsText } from '../api/wildcards'
import { toYAML } from '../TreeEdit/yaml-io'
import { parseWeightDirective } from './tagExpansion'
import { getWeightedRandomIndex } from './random'
import { testModeStore } from '../stores/testModeStore.svelte'
import type { TreeModel } from '../TreeEdit/model'
import {
  getNodePath,
  extractCompositionDirective,
  extractDisablesDirective
} from '../TreeEdit/utils'
import { updateComposition } from '../stores/promptsStore'

type ZoneName = 'all' | 'zone1' | 'zone2' | 'negative' | 'inpainting'

const ZONE_NAMES: ZoneName[] = ['all', 'zone1', 'zone2', 'negative', 'inpainting']

type ZoneSelectionState = { index: number }

const zoneSelectionState = new Map<ZoneName, ZoneSelectionState>()

function getStoredSelection(zone: ZoneName): number | undefined {
  const entry = zoneSelectionState.get(zone)
  return entry?.index
}

function storeSelection(zone: ZoneName, index: number) {
  zoneSelectionState.set(zone, { index })
}

function clearSelection(zone: ZoneName) {
  zoneSelectionState.delete(zone)
}

export type ZoneDirectiveState = {
  composition: string | null
  disabledZones: Set<ZoneName>
}

const defaultDirectiveState = (): ZoneDirectiveState => ({
  composition: null,
  disabledZones: new Set<ZoneName>()
})

function normalizeCompositionValue(raw: string | null): string | null {
  if (!raw) return null
  const normalized = raw.trim().toLowerCase()
  switch (normalized) {
    case 'all':
    case 'temp-mask':
    case 'left-horizontal':
    case 'top-vertical':
      return normalized
    case '2h':
      return 'left-horizontal'
    case '2v':
      return 'top-vertical'
    default:
      return null
  }
}

function normalizeZoneName(raw: string): ZoneName | null {
  const value = raw.trim().toLowerCase()
  if (value === 'all' || value === 'zone1' || value === 'zone2' || value === 'negative') {
    return value as ZoneName
  }
  if (value === 'inpainting') {
    return 'inpainting'
  }
  return null
}

function selectRandomChildIndex(
  model: TreeModel,
  arrayNodeId: string,
  children: string[] | undefined,
  nodes: Record<string, { kind: string; value?: unknown }>
): number | null {
  if (!children || children.length === 0) {
    return null
  }

  const options: { index: number; weight: number }[] = []
  let pinnedMatchIndex: number | null = null
  let overrideMatchIndex: number | null = null

  const pinKey = getNodePath(model, arrayNodeId)
  const store = testModeStore[pinKey]
  const hasPin = !!store && !!store.enabled

  for (let i = 0; i < children.length; i++) {
    const childId = children[i]
    const childNode = nodes[childId]
    if (!childNode || childNode.kind !== 'leaf') continue

    const value = childNode.value
    const asString =
      typeof value === 'string'
        ? value
        : value !== null && value !== undefined
          ? String(value)
          : ''
    const weight = parseWeightDirective(asString)

    options.push({ index: i, weight })

    if (!hasPin) continue

    if (store.pinnedLeafPath) {
      const childPath = getNodePath(model, childId)
      if (childPath === store.pinnedLeafPath) {
        pinnedMatchIndex = i
      }
    }

    if (store.overrideTag && store.overrideTag.trim()) {
      const normalizedValue = asString.trim()
      if (normalizedValue === store.overrideTag.trim()) {
        overrideMatchIndex = i
      }
    }
  }

  if (options.length === 0) {
    return null
  }

  if (hasPin) {
    if (pinnedMatchIndex !== null) {
      return pinnedMatchIndex
    }
    if (overrideMatchIndex !== null) {
      return overrideMatchIndex
    }
  }

  const selected = getWeightedRandomIndex(options)
  const chosen = options[selected]
  return chosen ? chosen.index : null
}

function resolveChildValue(
  nodes: Record<string, { kind: string; value?: unknown }>,
  children: string[],
  index: number
): string | null {
  if (index < 0 || index >= children.length) {
    return null
  }

  const childNode = nodes[children[index]]

  if (!childNode || childNode.kind !== 'leaf') {
    return null
  }

  const value = childNode.value

  if (typeof value !== 'string') {
    return value !== null && value !== undefined ? String(value) : null
  }

  const trimmed = value.trim()
  return trimmed || ''
}

export function getZoneSelectionIndex(zone: ZoneName): number | undefined {
  return getStoredSelection(zone)
}

/**
 * Read zone data from the current wildcard model
 */
export async function readWildcardZones(
  filename?: string,
  options?: { reroll?: boolean; skipRefresh?: boolean }
): Promise<{
  all: string
  zone1: string
  zone2: string
  negative: string
  inpainting: string
  directives: ZoneDirectiveState
}> {
  // Always refresh wildcard data to ensure we have the correct file
  const skipRefresh = options?.skipRefresh ?? false
  if (!skipRefresh) {
    await refreshWildcardsFromServer(filename)
  }

  const wildcardModel = getWildcardModel()
  const shouldReroll = options?.reroll ?? false
  const nodes = wildcardModel.nodes

  const directiveState = defaultDirectiveState()

  const applyAllZoneDirectives = (value: string | null) => {
    // Reset previous state
    directiveState.composition = null
    directiveState.disabledZones = new Set<ZoneName>()

    if (!value || value.length === 0) {
      return
    }

    const compositionRaw = extractCompositionDirective(value)
    const normalizedComposition = normalizeCompositionValue(compositionRaw)
    if (normalizedComposition) {
      directiveState.composition = normalizedComposition
      updateComposition(normalizedComposition)
    }

    const disablesRaw = extractDisablesDirective(value)
    if (disablesRaw.length > 0) {
      const disabledSet = new Set<ZoneName>()
      for (const entry of disablesRaw) {
        const zone = normalizeZoneName(entry)
        if (zone) {
          disabledSet.add(zone)
        }
      }
      directiveState.disabledZones = disabledSet
    }
  }

  const extractZoneData = (zoneName: ZoneName): string => {
    // Find the zone node
    const symId = wildcardModel.symbols[zoneName]
    const node = symId ? wildcardModel.nodes[symId] : undefined

    if (!node || node.kind !== 'array' || !node.children || node.children.length === 0) {
      clearSelection(zoneName)
      return ''
    }

    let selectedIndex = getStoredSelection(zoneName)
    const existingValue =
      typeof selectedIndex === 'number'
        ? resolveChildValue(nodes, node.children, selectedIndex)
        : null

    if (!shouldReroll && existingValue !== null) {
      if (zoneName === 'all') {
        applyAllZoneDirectives(existingValue)
      }
      return existingValue
    }

    const chosenIndex = selectRandomChildIndex(wildcardModel, node.id, node.children, nodes)

    if (chosenIndex === null) {
      clearSelection(zoneName)
      return ''
    }

    storeSelection(zoneName, chosenIndex)

    const value = resolveChildValue(nodes, node.children, chosenIndex)

    if (zoneName === 'all') {
      applyAllZoneDirectives(value)
    }

    if (value === null) {
      clearSelection(zoneName)
      return ''
    }

    return value
  }

  const result = {
    all: extractZoneData('all'),
    zone1: extractZoneData('zone1'),
    zone2: extractZoneData('zone2'),
    negative: extractZoneData('negative'),
    inpainting: extractZoneData('inpainting'),
    directives: {
      composition: directiveState.composition,
      disabledZones: new Set(directiveState.disabledZones)
    }
  }

  return result
}

/**
 * Write zone data to the wildcard model and save
 */
export async function writeWildcardZones(
  zones: {
    all: string
    zone1: string
    zone2: string
    negative: string
    inpainting: string
  },
  filename?: string
): Promise<void> {
  try {
    // Always refresh from the correct file to ensure we have the right model
    await refreshWildcardsFromServer(filename)
    const wildcardModel = getWildcardModel()

    // Clone the current model to modify it
    const updatedModel = { ...wildcardModel }
    const updatedNodes = { ...updatedModel.nodes }

    const updateZone = (zoneName: ZoneName, tagsText: string) => {
      const joinedTags = tagsText

      let zoneSymId = updatedModel.symbols[zoneName]
      let zoneNode = zoneSymId ? updatedNodes[zoneSymId] : undefined

      if (!zoneNode || zoneNode.kind !== 'array') {
        const newZoneNodeId = `array_${zoneName}_${Date.now()}`
        zoneNode = {
          id: newZoneNodeId,
          name: zoneName,
          kind: 'array',
          parentId: 'root',
          children: []
        }
        updatedNodes[newZoneNodeId] = zoneNode
        updatedModel.symbols[zoneName] = newZoneNodeId

        const rootNode = updatedNodes['root']
        if (rootNode && rootNode.kind === 'object') {
          rootNode.children = [...(rootNode.children || []), newZoneNodeId]
        }
      }

      zoneNode.children ||= []

      let selectedIndex = getStoredSelection(zoneName)

      if (typeof selectedIndex !== 'number' || selectedIndex < 0) {
        selectedIndex = 0
      }

      if (selectedIndex >= zoneNode.children.length) {
        selectedIndex = zoneNode.children.length === 0 ? 0 : zoneNode.children.length - 1
      }

      const existingChildId = zoneNode.children[selectedIndex]
      let childNode = existingChildId ? updatedNodes[existingChildId] : undefined

      if (!childNode || childNode.kind !== 'leaf') {
        const newLeafId = `leaf_${zoneName}_${selectedIndex}_${Date.now()}`
        childNode = {
          id: newLeafId,
          name: String(selectedIndex),
          kind: 'leaf',
          parentId: zoneNode.id,
          value: joinedTags
        }
        updatedNodes[newLeafId] = childNode
        const updatedChildren = [...zoneNode.children]
        if (selectedIndex >= updatedChildren.length) {
          updatedChildren.push(newLeafId)
        } else {
          updatedChildren[selectedIndex] = newLeafId
        }
        zoneNode.children = updatedChildren
      } else {
        childNode.value = joinedTags
      }

      storeSelection(zoneName, selectedIndex)
    }

    for (const zoneName of ZONE_NAMES) {
      updateZone(zoneName, zones[zoneName])
    }

    // Update the model
    updatedModel.nodes = updatedNodes

    // Convert back to YAML and save
    const yamlText = toYAML(updatedModel)

    // Save to server
    await saveWildcardsText(yamlText, filename)

    // Update local model by refreshing from server
    await refreshWildcardsFromServer(filename)
  } catch (error) {
    // Re-throw error so caller can handle it (will be shown as toast)
    throw error
  }
}

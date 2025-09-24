// Utility functions for reading and writing wildcard zone data
import { refreshWildcardsFromServer, getWildcardModel } from '../stores/tagsStore'
import { saveWildcardsText } from '../api/wildcards'

/**
 * Read zone data from the current wildcard model
 */
export async function readWildcardZones(modelType?: string): Promise<{
  all: string[]
  zone1: string[]
  zone2: string[]
  negative: string[]
  inpainting: string[]
}> {
  // Always refresh wildcard data to ensure we have the correct model type
  await refreshWildcardsFromServer(modelType)

  const wildcardModel = getWildcardModel()

  const extractZoneData = (zoneName: string): string[] => {
    // Find the zone node
    const symId = wildcardModel.symbols[zoneName]
    const node = symId ? wildcardModel.nodes[symId] : undefined

    if (!node || node.kind !== 'array' || !node.children || node.children.length === 0) {
      return []
    }

    // Get first child (array element)
    const firstChildId = node.children[0]
    const firstChild = wildcardModel.nodes[firstChildId]

    if (!firstChild || firstChild.kind !== 'leaf' || typeof firstChild.value !== 'string') {
      return []
    }

    const value = firstChild.value.trim()
    if (!value) {
      return []
    }

    // For Qwen model, treat as single prompt; for others, split by comma
    let result: string[]
    if (modelType === 'qwen') {
      result = [value]
    } else {
      result = value
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
    }

    return result
  }

  const result = {
    all: extractZoneData('all'),
    zone1: extractZoneData('zone1'),
    zone2: extractZoneData('zone2'),
    negative: extractZoneData('negative'),
    inpainting: extractZoneData('inpainting')
  }

  return result
}

/**
 * Write zone data to the wildcard model and save
 */
export async function writeWildcardZones(
  zones: {
    all: string[]
    zone1: string[]
    zone2: string[]
    negative: string[]
    inpainting: string[]
  },
  modelType?: string
): Promise<void> {
  try {
    const wildcardModel = getWildcardModel()

    // Clone the current model to modify it
    const updatedModel = { ...wildcardModel }
    const updatedNodes = { ...updatedModel.nodes }

    const updateZone = (zoneName: string, tags: string[]) => {
      const joinedTags = tags.join(', ')

      // Find or create the zone array node
      let zoneSymId = updatedModel.symbols[zoneName]
      let zoneNode = zoneSymId ? updatedNodes[zoneSymId] : undefined

      if (!zoneNode || zoneNode.kind !== 'array') {
        // Create new array node
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

        // Add to root children
        const rootNode = updatedNodes['root']
        if (rootNode && rootNode.kind === 'object') {
          rootNode.children = [...(rootNode.children || []), newZoneNodeId]
        }
      }

      // Find or create the first child leaf node
      let firstChildId = zoneNode.children?.[0]
      let firstChild = firstChildId ? updatedNodes[firstChildId] : undefined

      if (!firstChild || firstChild.kind !== 'leaf') {
        // Create new leaf node
        const newLeafId = `leaf_${zoneName}_0_${Date.now()}`
        firstChild = {
          id: newLeafId,
          name: '0',
          kind: 'leaf',
          parentId: zoneNode.id,
          value: joinedTags
        }
        updatedNodes[newLeafId] = firstChild
        zoneNode.children = [newLeafId, ...(zoneNode.children?.slice(1) || [])]
      } else {
        // Update existing leaf value
        firstChild.value = joinedTags
      }
    }

    updateZone('all', zones.all)
    updateZone('zone1', zones.zone1)
    updateZone('zone2', zones.zone2)
    updateZone('negative', zones.negative)
    updateZone('inpainting', zones.inpainting)

    // Update the model
    updatedModel.nodes = updatedNodes

    // Convert back to YAML and save
    const { toYAML } = await import('../TreeEdit/yaml-io')
    const yamlText = toYAML(updatedModel)

    // Save to server
    await saveWildcardsText(yamlText, modelType)

    // Update local model by refreshing from server
    await refreshWildcardsFromServer(modelType)
  } catch (error) {
    console.error('Failed to write wildcard zones:', error)
    throw error
  }
}

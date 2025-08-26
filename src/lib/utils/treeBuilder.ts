import type { CustomTag } from '../types'

export interface TreeNode {
  id: string
  level: number
  data: CustomTag
  parentId?: string
  collapsed?: boolean
  hasChildren?: boolean
}

export function buildTreeNodes(
  items: Record<string, CustomTag>,
  collapsedNodes: Set<string>
): TreeNode[] {
  const nodes: TreeNode[] = []
  const processed = new Set<string>()

  // Helper function to recursively mark all children as processed
  function markChildrenAsProcessed(itemId: string) {
    const customTag = items[itemId]
    if (!customTag?.tags?.length) return

    if (customTag.type === 'sequential' || customTag.type === 'regular') {
      const tagNodeId = `${itemId}_combined_tags`
      processed.add(tagNodeId)
    } else {
      customTag.tags.forEach((tag: string) => {
        if (items[tag]) {
          processed.add(tag)
          markChildrenAsProcessed(tag)
        } else {
          const tagNodeId = `${itemId}_tag_${tag}`
          processed.add(tagNodeId)
        }
      })
    }
  }

  // Function to add item and its children recursively
  function addToTree(itemId: string, level: number = 0, parentId?: string) {
    if (processed.has(itemId) || !items[itemId]) return

    processed.add(itemId)
    const customTag = items[itemId]

    // Check if this node has children (tag content)
    const hasChildren = !!customTag.tags?.length
    const isCollapsed = collapsedNodes.has(itemId)

    // If collapsed, mark all children as processed so they don't get processed elsewhere
    if (isCollapsed && hasChildren) {
      markChildrenAsProcessed(itemId)
    }

    nodes.push({
      id: itemId,
      level,
      data: customTag,
      parentId,
      collapsed: isCollapsed,
      hasChildren
    })

    // Only add children if not collapsed
    if (isCollapsed) return

    // Add tags as children (tag content)
    if (customTag.tags && customTag.tags.length > 0) {
      if (customTag.type === 'sequential' || customTag.type === 'regular') {
        // For sequential and regular types, combine all tags into one node
        const combinedTags = customTag.tags.join(', ')
        const tagNodeId = `${itemId}_combined_tags`
        nodes.push({
          id: tagNodeId,
          level: level + 1,
          data: { name: combinedTags, tags: [], type: 'regular' } as CustomTag,
          parentId: itemId
        })
      } else {
        // For random and consistent-random types, show each tag separately
        customTag.tags.forEach((tag: string) => {
          // If the tag exists as a CustomTag in items, add it recursively
          if (items[tag]) {
            addToTree(tag, level + 1, itemId)
          } else {
            // If it's just a regular tag string, add it as a leaf node
            const tagNodeId = `${itemId}_tag_${tag}`
            nodes.push({
              id: tagNodeId,
              level: level + 1,
              data: { name: tag, tags: [], type: 'regular' } as CustomTag,
              parentId: itemId
            })
          }
        })
      }
    }
  }

  // Find all items that are children of other items
  const childrenSet = new Set<string>()
  Object.values(items).forEach((item) => {
    if (item.tags) {
      item.tags.forEach((tag) => {
        // If this tag exists as a CustomTag item, it's a child
        if (items[tag]) {
          childrenSet.add(tag)
        }
      })
    }
  })

  // Add only root items (items that are not children of any other item)
  Object.keys(items).forEach((itemId) => {
    const item = items[itemId]
    if (item && !childrenSet.has(itemId)) {
      addToTree(itemId)
    }
  })

  // Then add any orphaned items (in case of data inconsistency)
  Object.keys(items).forEach((itemId) => {
    if (!processed.has(itemId)) {
      addToTree(itemId)
    }
  })

  return nodes
}

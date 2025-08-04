/**
 * Shared tag styling utilities for consistent visual appearance across components
 */

import { get } from 'svelte/store'
import { promptsData } from '../stores/promptsStore'
import type { CustomTag, TagType } from '../types'

export interface TagStyleOptions {
  /** Tag name or CustomTag object to determine styling */
  tag: string | CustomTag
  /** Whether the tag is in selected/active state */
  selected?: boolean
  /** Whether the tag is being dragged */
  dragged?: boolean
  /** Additional state-specific classes */
  additionalClasses?: string
}

/**
 * Get tag type from tag name or CustomTag object
 */
function getTagType(tag: string | CustomTag): TagType {
  if (typeof tag === 'object') {
    return tag.type
  }

  const currentData = get(promptsData)
  const customTag = currentData.customTags[tag]
  return customTag?.type ?? 'regular'
}

/**
 * Base tag styling classes shared across all tag types
 */
export const baseTagClasses = 'rounded-md text-sm transition-all duration-200'

/**
 * Get tag styling classes based on tag name and state
 */
export function getTagClasses(options: TagStyleOptions): string {
  const { tag, selected = false, dragged = false, additionalClasses = '' } = options
  const type = getTagType(tag)

  let classes = baseTagClasses

  // Type-specific styling
  switch (type) {
    case 'random':
    case 'sequential':
      if (selected) {
        classes += ' bg-purple-200 text-purple-900 border-2 border-solid border-purple-500'
      } else {
        classes +=
          ' bg-purple-100 text-purple-800 border-1 border-dashed border-purple-400 hover:bg-purple-200'
      }
      break

    case 'consistent-random':
      if (selected) {
        classes += ' bg-orange-200 text-orange-900 border-2 border-solid border-orange-500'
      } else {
        classes +=
          ' bg-orange-100 text-orange-800 border-1 border-dashed border-orange-400 hover:bg-orange-200'
      }
      break

    // case 'sequential':
    //   if (selected) {
    //     classes += ' bg-pink-200 text-pink-900 border border-pink-500'
    //   } else {
    //     classes += ' bg-pink-100 text-pink-800'
    //     if (!readonly) {
    //       classes += ' hover:bg-pink-200'
    //     }
    //   }
    //   break

    case 'regular':
    default:
      if (selected) {
        classes += ' bg-sky-200 text-sky-900 border border-sky-500'
      } else {
        classes += ' bg-sky-100 text-sky-800 hover:bg-sky-200'
      }
      break
  }

  // State-specific styling
  if (dragged) {
    classes += ' opacity-50 scale-95'
  }

  classes += ' cursor-move hover:shadow-md'

  // Add any additional classes
  if (additionalClasses) {
    classes += ` ${additionalClasses}`
  }

  return classes
}

/**
 * Get remove button styling for tag items
 */
export function getTagRemoveButtonClasses(tag: string | CustomTag): string {
  const type = getTagType(tag)
  const baseClasses = 'rounded-full w-4 h-4 inline-flex items-center justify-center'

  switch (type) {
    case 'random':
    case 'sequential':
      return `${baseClasses} text-purple-600 hover:text-purple-800 hover:bg-purple-200`
    case 'consistent-random':
      return `${baseClasses} text-orange-600 hover:text-orange-800 hover:bg-orange-200`
    // case 'sequential':
    //   return `${baseClasses} text-pink-600 hover:text-pink-800 hover:bg-pink-200`
    case 'regular':
    default:
      return `${baseClasses} text-sky-600 hover:text-sky-800 hover:bg-sky-200`
  }
}

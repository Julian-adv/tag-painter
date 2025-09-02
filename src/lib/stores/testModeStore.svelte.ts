/**
 * Store for managing test mode state for random tag expansion
 */

export interface TagTestState {
  enabled: boolean
  overrideTag?: string
  pinnedLeafId?: string
}

export const testModeStore = $state<Record<string, TagTestState>>({})

// Helper functions
export function setTagTestMode(customTagName: string, enabled: boolean) {
  if (!testModeStore[customTagName]) {
    testModeStore[customTagName] = { enabled, overrideTag: undefined }
  } else {
    testModeStore[customTagName].enabled = enabled
  }
}

export function setTestModeOverride(
  customTagName: string,
  overrideTag: string,
  pinnedLeafId?: string
) {
  if (!testModeStore[customTagName]) {
    testModeStore[customTagName] = { enabled: true, overrideTag, pinnedLeafId }
  } else {
    testModeStore[customTagName].enabled = true
    testModeStore[customTagName].overrideTag = overrideTag
    testModeStore[customTagName].pinnedLeafId = pinnedLeafId
  }
}

export function removeTestModeOverride(customTagName: string) {
  if (testModeStore[customTagName]) {
    testModeStore[customTagName].enabled = false
    testModeStore[customTagName].overrideTag = undefined
    testModeStore[customTagName].pinnedLeafId = undefined
  }
}

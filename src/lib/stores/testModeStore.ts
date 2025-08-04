/**
 * Store for managing test mode state for random tag expansion
 */

import { writable } from 'svelte/store'

export interface TestModeState {
  enabled: boolean
  overrides: Record<string, string> // customTagName -> overrideTag
}

const initialState: TestModeState = {
  enabled: false,
  overrides: {}
}

export const testModeStore = writable<TestModeState>(initialState)

// Helper functions
export function setTestModeOverride(customTagName: string, overrideTag: string) {
  testModeStore.update(state => ({
    ...state,
    enabled: true,
    overrides: {
      ...state.overrides,
      [customTagName]: overrideTag
    }
  }))
}

export function removeTestModeOverride(customTagName: string) {
  testModeStore.update(state => {
    const newOverrides = { ...state.overrides }
    delete newOverrides[customTagName]
    
    return {
      ...state,
      overrides: newOverrides,
      enabled: Object.keys(newOverrides).length > 0
    }
  })
}

export function enableTestMode() {
  testModeStore.update(state => ({
    ...state,
    enabled: true
  }))
}

export function clearTestMode() {
  testModeStore.set(initialState)
}
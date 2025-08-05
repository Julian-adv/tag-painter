import { writable } from 'svelte/store'

interface MaskOverlayState {
  maskSrc: string | null
  isVisible: boolean
}

function createMaskOverlayStore() {
  const { subscribe, set } = writable<MaskOverlayState>({
    maskSrc: null,
    isVisible: false
  })

  return {
    subscribe,
    showMask: (maskSrc: string) => {
      set({ maskSrc, isVisible: true })
    },
    hideMask: () => {
      set({ maskSrc: null, isVisible: false })
    },
    reset: () => {
      set({ maskSrc: null, isVisible: false })
    }
  }
}

export const maskOverlay = createMaskOverlayStore()
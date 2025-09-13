<script lang="ts">
  import TreeEdit from './TreeEdit.svelte'
  import { updateWildcardsFromText } from '../stores/tagsStore'
  import { fetchWildcardsText, saveWildcardsText } from '../api/wildcards'

  interface Props {
    isOpen: boolean
    initialSelectedName?: string
    initialTargetText?: string
  }

  let { isOpen = $bindable(), initialSelectedName = '', initialTargetText = '' }: Props = $props()
  let loading = $state(false)
  let pendingText: string | null = $state(null)

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      isOpen = false
    }
  }

  function handleClose() {
    isOpen = false
  }

  // Reference to child TreeEdit to load/get/mark saved
  let tree: {
    load: (t: string) => void
    getYaml: () => string
    markSaved: () => void
    selectByName: (n: string) => void
    selectBestChildByValue: (parentName: string, targetText: string) => boolean
  } | null = $state(null)
  let hasUnsavedChanges = $state(false)

  // Draggable dialog state
  let dialogEl: HTMLDivElement | null = $state(null)
  let posLeft = $state(0)
  let posTop = $state(0)
  let hasCustomPosition = $state(false)
  let isDragging = $state(false)
  let dragOffsetX = $state(0)
  let dragOffsetY = $state(0)
  const OFFSCREEN_ALLOWANCE = 160 // px: allow dialog to go slightly off-screen while dragging

  function centerDialog() {
    if (!dialogEl) return
    const rect = dialogEl.getBoundingClientRect()
    const left = Math.max(0, Math.round((window.innerWidth - rect.width) / 2))
    const top = Math.max(0, Math.round((window.innerHeight - rect.height) / 2))
    posLeft = left
    posTop = top
  }

  function startDrag(e: PointerEvent) {
    if (!dialogEl) return
    isDragging = true
    const rect = dialogEl.getBoundingClientRect()
    dragOffsetX = e.clientX - rect.left
    dragOffsetY = e.clientY - rect.top
    hasCustomPosition = true
    e.preventDefault()
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stopDrag)
  }

  function onPointerMove(e: PointerEvent) {
    if (!isDragging || !dialogEl) return
    const w = dialogEl.offsetWidth
    const h = dialogEl.offsetHeight
    let left = e.clientX - dragOffsetX
    let top = e.clientY - dragOffsetY
    // Allow the dialog to move slightly beyond the viewport bounds
    const minLeft = -OFFSCREEN_ALLOWANCE
    const minTop = -OFFSCREEN_ALLOWANCE
    const maxLeft = Math.max(0, window.innerWidth - w) + OFFSCREEN_ALLOWANCE
    const maxTop = Math.max(0, window.innerHeight - h) + OFFSCREEN_ALLOWANCE
    if (left < minLeft) left = minLeft
    if (top < minTop) top = minTop
    if (left > maxLeft) left = maxLeft
    if (top > maxTop) top = maxTop
    posLeft = left
    posTop = top
  }

  function stopDrag() {
    isDragging = false
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', stopDrag)
  }

  // When dialog opens, load YAML from server and populate child
  $effect(() => {
    if (isOpen) {
      loading = true
      fetchWildcardsText()
        .then((text) => {
          // Yield a frame so the dialog paints before heavy parse
          requestAnimationFrame(() => {
            pendingText = text
            loading = false
            // Center dialog on first open or when no custom position yet
            if (!hasCustomPosition) {
              requestAnimationFrame(() => centerDialog())
            }
          })
        })
        .catch((err) => {
          console.error('Failed to load wildcards.yaml:', err)
          loading = false
        })
    } else {
      pendingText = null
    }
  })

  // Once TreeEdit is mounted (!loading) and we have pending text, load it
  $effect(() => {
    if (isOpen && !loading && tree && pendingText) {
      const text = pendingText
      pendingText = null
      tree.load(text)
      if (initialSelectedName) {
        setTimeout(() => {
          if (initialTargetText) {
            const ok = tree?.selectBestChildByValue(initialSelectedName!, initialTargetText!)
            if (!ok) tree?.selectByName(initialSelectedName!)
          } else {
            tree?.selectByName(initialSelectedName!)
          }
        }, 0)
      }
    }
  })

  function onSave() {
    if (!tree) return
    const body = tree.getYaml()
    // Immediately reflect changes in combinedTags using the text we save
    // (avoids waiting for a subsequent fetch)
    updateWildcardsFromText(body)
    saveWildcardsText(body)
      .then(() => tree?.markSaved())
      .catch((err) => console.error('Save failed:', err))
  }
</script>

{#if isOpen}
  <!-- Modal backdrop -->
  <div
    class="fixed inset-0 z-50 bg-black/50"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={handleBackdropClick}
    onkeydown={(e) => e.key === 'Escape' && handleClose()}
  >
    <!-- Modal content -->
    <div
      bind:this={dialogEl}
      class="fixed flex h-[700px] w-full max-w-5xl flex-col rounded-lg bg-white shadow-xl"
      style={`left: ${posLeft}px; top: ${posTop}px;`}
    >
      <!-- Header -->
      <div
        class="flex cursor-move items-center justify-between border-b border-gray-300 p-6 select-none"
        onpointerdown={startDrag}
      >
        <h2 class="text-lg font-semibold text-gray-900">Wildcards Editor</h2>
        <button
          type="button"
          class="text-gray-400 transition-colors hover:text-gray-600"
          onclick={handleClose}
          onpointerdown={(e) => e.stopPropagation()}
          aria-label="Close dialog"
        >
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            ></path>
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="min-h-0 flex-1 overflow-hidden">
        {#if !loading}
          <TreeEdit bind:this={tree} bind:hasUnsavedChanges />
        {:else}
          <div class="flex h-full items-center justify-center text-gray-500">
            Loading wildcards...
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end gap-2 border-t border-gray-300 p-4">
        <button
          type="button"
          class="rounded-md bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:cursor-default disabled:opacity-50 disabled:hover:bg-blue-500 disabled:focus:ring-0"
          onclick={onSave}
          disabled={!hasUnsavedChanges}
        >
          Save
        </button>
        <button
          type="button"
          class="rounded-md bg-gray-200 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-300 focus:ring-2 focus:ring-gray-500 focus:outline-none"
          onclick={handleClose}
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}

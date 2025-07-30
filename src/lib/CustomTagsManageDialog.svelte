<!-- Dialog component for managing all custom tags -->
<script lang="ts">
  import TagDisplay from './TagDisplay.svelte'
  import { promptsData, saveCustomTag, savePromptsData } from './stores/promptsStore'
  import { get } from 'svelte/store'
  import { untrack } from 'svelte'
  import { Trash } from 'svelte-heros-v2'

  interface Props {
    isOpen: boolean
  }

  let { isOpen = $bindable() }: Props = $props()

  let selectedTagName = $state<string>('')
  let selectedTagContent = $state<string[]>([])
  let customTags = $state<Record<string, string[]>>({})
  let hasUnsavedChanges = $state(false)

  // Update custom tags when dialog opens
  $effect(() => {
    if (isOpen) {
      const currentData = get(promptsData)
      customTags = { ...currentData.customTags }
      initializeSelectedTag()
    }
  })

  function initializeSelectedTag() {
    untrack(() => {
      const tagNames = Object.keys(customTags)
      if (tagNames.length > 0 && !selectedTagName) {
        selectedTagName = tagNames[0]
        selectedTagContent = [...customTags[selectedTagName]]
        hasUnsavedChanges = false
      }
    })
  }

  async function selectTag(tagName: string) {
    // Save current changes before switching
    if (selectedTagName && hasUnsavedChanges) {
      await saveTagContent()
    }
    
    selectedTagName = tagName
    selectedTagContent = [...customTags[tagName]]
    hasUnsavedChanges = false
  }

  async function deleteSelectedTag() {
    if (!selectedTagName) return
    
    if (confirm(`Are you sure you want to delete the custom tag "${selectedTagName}"?`)) {
      // Remove from local state
      delete customTags[selectedTagName]
      customTags = { ...customTags }
      
      // Update the store (remove from promptsData)
      promptsData.update((data) => {
        const newCustomTags = { ...data.customTags }
        delete newCustomTags[selectedTagName]
        return {
          ...data,
          customTags: newCustomTags
        }
      })
      
      // Mark as having unsaved changes
      hasUnsavedChanges = true
      
      // Select next available tag
      const remainingTags = Object.keys(customTags)
      if (remainingTags.length > 0) {
        selectedTagName = remainingTags[0]
        selectedTagContent = [...customTags[selectedTagName]]
      } else {
        selectedTagName = ''
        selectedTagContent = []
      }
    }
  }

  async function saveTagContent() {
    if (!selectedTagName) return
    
    // Update custom tags in store
    await saveCustomTag(selectedTagName, selectedTagContent)
    
    // Update local state
    customTags[selectedTagName] = [...selectedTagContent]
    customTags = { ...customTags }
    hasUnsavedChanges = false
  }

  async function saveAllChanges() {
    if (selectedTagName && hasUnsavedChanges) {
      await saveTagContent()
    }
    // Save the entire prompts data
    await savePromptsData()
  }

  function handleTagsChange() {
    // Mark as having unsaved changes
    hasUnsavedChanges = true
  }

  function handleClose() {
    isOpen = false
    selectedTagName = ''
    selectedTagContent = []
    hasUnsavedChanges = false
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      handleClose()
    }
  }
</script>

{#if isOpen}
  <!-- Modal backdrop -->
  <div
    class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={handleBackdropClick}
    onkeydown={(e) => e.key === 'Escape' && handleClose()}
  >
    <!-- Modal content -->
    <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b">
        <h2 class="text-lg font-semibold text-gray-900">Manage Custom Tags</h2>
        <button
          type="button"
          class="text-gray-400 hover:text-gray-600 transition-colors"
          onclick={handleClose}
          aria-label="Close dialog"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <div class="flex-1 flex min-h-0">
        <!-- Left column: Custom tags list -->
        <div class="w-1/3 border-r p-4 overflow-y-auto">
          <h3 class="text-sm font-medium text-gray-700 mb-3">Custom Tags</h3>
          <div class="space-y-1">
            {#each Object.keys(customTags) as tagName (tagName)}
              <button
                type="button"
                class="w-full text-left px-3 py-2 rounded-md text-sm transition-colors {selectedTagName === tagName
                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                  : 'hover:bg-gray-100 text-gray-700'}"
                onclick={() => selectTag(tagName)}
              >
                {tagName}
              </button>
            {/each}
            {#if Object.keys(customTags).length === 0}
              <p class="text-gray-400 text-sm italic">No custom tags available</p>
            {/if}
          </div>
        </div>

        <!-- Right column: Selected tag content -->
        <div class="flex-1 p-4 flex flex-col">
          {#if selectedTagName}
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-medium text-gray-700">
                Editing: <span class="font-semibold text-gray-900">{selectedTagName}</span>
              </h3>
              <button
                type="button"
                onclick={deleteSelectedTag}
                class="inline-flex items-center gap-1 px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors text-sm"
              >
                <Trash class="w-3 h-3" />
                Delete
              </button>
            </div>
            
            <div class="flex-1">
              <TagDisplay
                id="custom-tag-content"
                bind:tags={selectedTagContent}
                placeholder="No tags in this custom tag"
                onTagsChange={handleTagsChange}
              />
            </div>
          {:else}
            <div class="flex-1 flex items-center justify-center">
              <p class="text-gray-400 text-sm italic">Select a custom tag to edit</p>
            </div>
          {/if}
        </div>
      </div>

      <!-- Footer -->
      <div class="flex justify-between items-center p-6 border-t">
        <div class="text-sm text-gray-500">
          {#if hasUnsavedChanges}
            <span class="text-orange-600">• Unsaved changes</span>
          {:else}
            <span class="text-green-600">• All changes saved</span>
          {/if}
        </div>
        <div class="flex gap-3">
          <button
            type="button"
            onclick={saveAllChanges}
            class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors {hasUnsavedChanges ? '' : 'opacity-50'}"
            disabled={!hasUnsavedChanges}
          >
            Save
          </button>
          <button
            type="button"
            onclick={handleClose}
            class="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
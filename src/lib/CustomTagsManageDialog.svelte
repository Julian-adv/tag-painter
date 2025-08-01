<!-- Dialog component for managing all custom tags -->
<script lang="ts">
  import TagInput from './TagInput.svelte'
  import { promptsData, saveCustomTag, savePromptsData } from './stores/promptsStore'
  import { get } from 'svelte/store'
  import { untrack } from 'svelte'
  import { Trash, DocumentDuplicate } from 'svelte-heros-v2'
  import type { CustomTag } from '$lib/types'

  interface Props {
    isOpen: boolean
    initialSelectedTag?: string
  }

  let { isOpen = $bindable(), initialSelectedTag = '' }: Props = $props()

  let selectedTagName = $state<string>('')
  let selectedTagContent = $state<string[]>([])
  let selectedTagType = $state<'custom' | 'random'>('custom')
  let customTags = $state<Record<string, CustomTag>>({})
  let hasUnsavedChanges = $state(false)
  let editingTagName = $state<string>('')
  let statusMessage = $state<string>('')

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
      let tagToSelect = ''

      // If initialSelectedTag is provided and exists, use it
      if (initialSelectedTag && initialSelectedTag in customTags) {
        tagToSelect = initialSelectedTag
      } else if (tagNames.length > 0) {
        // Otherwise, select the first available tag
        tagToSelect = tagNames[0]
      }

      if (tagToSelect && (!selectedTagName || selectedTagName !== tagToSelect)) {
        selectedTagName = tagToSelect
        const tag = customTags[tagToSelect]
        selectedTagContent = [...tag.tags]
        selectedTagType = tag.type
        editingTagName = tagToSelect
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
    const tag = customTags[tagName]
    selectedTagContent = [...tag.tags]
    selectedTagType = tag.type
    editingTagName = tagName
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
        const tag = customTags[selectedTagName]
        selectedTagContent = [...tag.tags]
        selectedTagType = tag.type
        editingTagName = selectedTagName
      } else {
        selectedTagName = ''
        selectedTagContent = []
        selectedTagType = 'custom'
        editingTagName = ''
      }
    }
  }

  async function duplicateSelectedTag() {
    if (!selectedTagName) return

    // Generate new name based on current tag name
    const newName = generateDuplicateName(selectedTagName)

    // Check if new name already exists (shouldn't happen with our algorithm, but just in case)
    if (newName in customTags) {
      statusMessage = 'Unable to create duplicate - name already exists!'
      return
    }

    // Create duplicate with same content and type
    const duplicateTag: CustomTag = {
      name: newName,
      tags: [...selectedTagContent],
      type: selectedTagType
    }

    // Update local state
    customTags[newName] = duplicateTag
    customTags = { ...customTags }

    // Update the store
    promptsData.update((data) => {
      return {
        ...data,
        customTags: {
          ...data.customTags,
          [newName]: duplicateTag
        }
      }
    })

    // Select the newly created duplicate
    selectedTagName = newName
    selectedTagContent = [...duplicateTag.tags]
    selectedTagType = duplicateTag.type
    editingTagName = newName
    hasUnsavedChanges = true
    statusMessage = ''
  }

  function generateDuplicateName(originalName: string): string {
    // Check if name ends with a number
    const match = originalName.match(/^(.*?)(\d+)$/)

    if (match) {
      // Name ends with a number, increment it
      const baseName = match[1]
      const currentNumber = parseInt(match[2])
      return `${baseName}${currentNumber + 1}`
    } else {
      // Name doesn't end with a number, append "2"
      return `${originalName} 2`
    }
  }

  async function saveTagContent() {
    if (!selectedTagName) return

    // Update custom tags in store
    await saveCustomTag(selectedTagName, selectedTagContent, selectedTagType)

    // Update local state
    const updatedTag: CustomTag = {
      name: selectedTagName,
      tags: [...selectedTagContent],
      type: selectedTagType
    }
    customTags[selectedTagName] = updatedTag
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
    statusMessage = ''
  }

  function handleTagTypeChange() {
    // Mark as having unsaved changes
    hasUnsavedChanges = true
    statusMessage = ''
  }

  async function saveTagName() {
    if (!editingTagName.trim() || editingTagName === selectedTagName) {
      editingTagName = selectedTagName
      return
    }

    const newName = editingTagName.trim()

    // Check if new name already exists
    if (newName in customTags) {
      statusMessage = 'A custom tag with this name already exists!'
      return
    }

    // Update local state - rename the tag
    const existingTag = customTags[selectedTagName]
    const renamedTag: CustomTag = {
      ...existingTag,
      name: newName
    }
    delete customTags[selectedTagName]
    customTags[newName] = renamedTag
    customTags = { ...customTags }

    // Update the store
    promptsData.update((data) => {
      const newCustomTags = { ...data.customTags }
      delete newCustomTags[selectedTagName]
      newCustomTags[newName] = renamedTag
      return {
        ...data,
        customTags: newCustomTags
      }
    })

    // Update selected tag name
    selectedTagName = newName
    hasUnsavedChanges = true
    statusMessage = ''
  }

  function handleNameKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      saveTagName()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      editingTagName = selectedTagName
    }
  }

  function handleClose() {
    isOpen = false
    selectedTagName = ''
    selectedTagContent = []
    selectedTagType = 'custom'
    editingTagName = ''
    hasUnsavedChanges = false
    statusMessage = ''
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
    <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full h-[600px] flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-gray-300">
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
        <div class="w-1/3 border-r border-gray-300 flex flex-col">
          <div class="flex-1 p-4 overflow-y-auto">
            <div class="space-y-1">
              {#each Object.keys(customTags) as tagName (tagName)}
                {@const tag = customTags[tagName]}
                <button
                  type="button"
                  class="w-full text-left px-3 py-1 rounded-md text-sm transition-colors {selectedTagName ===
                  tagName
                    ? tag.type === 'random' 
                      ? 'bg-purple-100 text-purple-800' 
                      : 'bg-pink-100 text-pink-800'
                    : tag.type === 'random'
                      ? 'hover:bg-purple-50 text-purple-700'  
                      : 'hover:bg-gray-100 text-pink-800'}"
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
        </div>

        <!-- Right column: Selected tag content -->
        <div class="flex-1 p-4 flex flex-col">
          {#if selectedTagName}
            <div class="flex items-center justify-between mb-4">
              <input
                type="text"
                bind:value={editingTagName}
                class="text-sm font-semibold text-gray-900 bg-transparent border-b border-blue-500 focus:outline-none focus:border-blue-600 px-1 py-0.5 flex-1 mr-2"
                onkeydown={handleNameKeydown}
                onblur={saveTagName}
                placeholder="Custom tag name"
              />
              <div class="flex items-center gap-3">
                <label class="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedTagType === 'random'}
                    onchange={(e) => {
                      selectedTagType = (e.target as HTMLInputElement).checked ? 'random' : 'custom'
                      handleTagTypeChange()
                    }}
                    class="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 focus:ring-2"
                  />
                  <span class="text-gray-700">Random tag</span>
                </label>
                <div class="flex gap-2">
                  <button
                    type="button"
                    onclick={duplicateSelectedTag}
                    class="inline-flex items-center gap-1 p-1.5 bg-blue-200 text-blue-600 rounded-md hover:bg-blue-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors text-sm"
                    title="Duplicate this custom tag"
                  >
                    <DocumentDuplicate class="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onclick={deleteSelectedTag}
                    class="inline-flex items-center gap-1 p-1.5 bg-red-200 text-red-500 rounded-md hover:bg-red-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors text-sm"
                    title="Delete this custom tag"
                  >
                    <Trash class="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div class="flex-1">
              <TagInput
                id="custom-tag-content"
                label=""
                placeholder="Add tags to this custom tag..."
                bind:tags={selectedTagContent}
                showPlusButton={false}
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
      <div class="flex justify-between items-center p-6 border-t border-gray-300">
        <div class="text-sm">
          {#if statusMessage}
            <span class="text-red-600">{statusMessage}</span>
          {:else if hasUnsavedChanges}
            <span class="text-orange-600">Unsaved changes</span>
          {/if}
        </div>
        <div class="flex gap-3">
          <button
            type="button"
            onclick={saveAllChanges}
            class="px-4 py-2 bg-blue-500 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors {hasUnsavedChanges
              ? 'text-white'
              : 'bg-gray-200 hover:bg-gray-200 text-gray-700'}"
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

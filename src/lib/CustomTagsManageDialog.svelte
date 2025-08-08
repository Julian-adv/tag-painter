<!-- Dialog component for managing all custom tags -->
<script lang="ts">
  import TagInput from './TagInput.svelte'
  import { promptsData, saveCustomTag, savePromptsData } from './stores/promptsStore'
  import { combinedTags } from './stores/tagsStore'
  import {
    testModeStore,
    setTestModeOverride,
    removeTestModeOverride
  } from './stores/testModeStore.svelte'
  import { get } from 'svelte/store'
  import { untrack } from 'svelte'
  import { Trash, DocumentDuplicate, Plus, LockClosed } from 'svelte-heros-v2'
  import type { CustomTag, TagType } from '$lib/types'
  import { getTagClasses } from './utils/tagStyling'

  interface Props {
    isOpen: boolean
    initialSelectedTag?: string
  }

  let { isOpen = $bindable(), initialSelectedTag = '' }: Props = $props()

  let selectedTagName = $state<string>('')
  let selectedTagContent = $state<CustomTag[]>([])
  let selectedTagType = $state<TagType>('sequential')
  let customTags = $state<Record<string, CustomTag>>({})
  let hasUnsavedChanges = $state(false)
  let editingTagName = $state<string>('')
  let statusMessage = $state<string>('')

  // Drag & drop state
  let draggedTagName = $state<string | null>(null)
  let dropPosition = $state<number | null>(null)

  // Get test mode state for the currently selected tag
  const selectedTagTestMode = $derived.by(() => {
    if (!selectedTagName) return { enabled: false, overrideTag: '' }
    return {
      enabled: testModeStore[selectedTagName]?.enabled ?? false,
      overrideTag: testModeStore[selectedTagName]?.overrideTag || ''
    }
  })

  // Reference to the left column scroll container
  let leftColumnElement = $state<HTMLElement>()

  // Reference to the tag name input field
  let tagNameInputElement = $state<HTMLInputElement>()

  // Convert string array to CustomTag array
  function convertToCustomTags(tagNames: string[]): CustomTag[] {
    const currentData = get(promptsData)
    return tagNames.map((tagName: string): CustomTag => {
      const customTag = currentData.customTags[tagName]

      if (customTag) {
        return customTag
      }

      // Create regular tag object for non-custom tags
      return {
        name: tagName,
        tags: [tagName],
        type: 'regular'
      }
    })
  }

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
        selectedTagContent = convertToCustomTags([...tag.tags])
        selectedTagType = tag.type
        editingTagName = tagToSelect
        hasUnsavedChanges = false

        // Scroll to the selected tag
        scrollToTag(tagToSelect)
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
    selectedTagContent = convertToCustomTags([...tag.tags])
    selectedTagType = tag.type
    editingTagName = tagName
    hasUnsavedChanges = false

    // Scroll to the selected tag
    scrollToTag(tagName)
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
        selectedTagContent = convertToCustomTags([...tag.tags])
        selectedTagType = tag.type
        editingTagName = selectedTagName
      } else {
        selectedTagName = ''
        selectedTagContent = []
        selectedTagType = 'sequential'
        editingTagName = ''
      }
    }
  }

  async function addNewTag(initialTags: string[] = []) {
    // Generate unique name for new tag
    let newName = 'New Tag'
    let counter = 1
    while (newName in customTags) {
      counter++
      newName = `New Tag ${counter}`
    }

    // Check if name already exists (should not happen due to above logic, but safety check)
    if (newName in customTags) {
      statusMessage = 'Unable to create tag - name already exists!'
      return false
    }

    // Create new tag
    const newTag: CustomTag = {
      name: newName,
      tags: initialTags,
      type: 'sequential'
    }

    // Update local state
    customTags[newName] = newTag
    customTags = { ...customTags }

    // Update the store
    promptsData.update((data) => {
      return {
        ...data,
        customTags: {
          ...data.customTags,
          [newName]: newTag
        }
      }
    })

    // Select the newly created tag
    selectedTagName = newName
    selectedTagContent = convertToCustomTags(initialTags)
    selectedTagType = 'sequential'
    editingTagName = newName
    hasUnsavedChanges = true
    statusMessage = ''

    // Scroll to the newly created tag and focus the name input
    scrollToTag(newName)
    focusTagNameInput()

    return true
  }

  async function duplicateSelectedTag() {
    if (!selectedTagName) return

    // Generate new name based on current tag name
    const newName = generateDuplicateName(selectedTagName)

    // Get current tag content
    const currentTags = selectedTagContent.map((tag) => tag.name)

    // Check if name already exists
    if (newName in customTags) {
      statusMessage = 'Unable to create tag - name already exists!'
      return false
    }

    // Create new tag
    const newTag: CustomTag = {
      name: newName,
      tags: currentTags,
      type: selectedTagType
    }

    // Find the position of the original tag
    const tagNames = Object.keys(customTags)
    const originalIndex = tagNames.indexOf(selectedTagName)

    // Insert the new tag right after the original
    const newTagNames = [...tagNames]
    newTagNames.splice(originalIndex + 1, 0, newName)

    // Rebuild customTags object in new order
    const newCustomTags: Record<string, CustomTag> = {}
    for (const tagName of newTagNames) {
      if (tagName === newName) {
        newCustomTags[tagName] = newTag
      } else {
        newCustomTags[tagName] = customTags[tagName]
      }
    }

    customTags = newCustomTags

    // Update the store
    promptsData.update((data) => {
      return {
        ...data,
        customTags: newCustomTags
      }
    })

    // Select the newly created tag
    selectedTagName = newName
    selectedTagContent = convertToCustomTags(currentTags)
    selectedTagType = selectedTagType
    editingTagName = newName
    hasUnsavedChanges = true
    statusMessage = ''

    // Scroll to the newly created tag and focus the name input
    scrollToTag(newName)
    focusTagNameInput()

    return true
  }

  function scrollToTag(tagName: string) {
    // Wait for the DOM to update, then scroll to the tag
    setTimeout(() => {
      if (leftColumnElement) {
        const tagButton = leftColumnElement.querySelector(
          `button[data-tag-name="${tagName}"]`
        ) as HTMLElement
        if (tagButton) {
          tagButton.scrollIntoView({
            behavior: 'instant',
            block: 'center'
          })
        }
      }
    }, 50)
  }

  function focusTagNameInput() {
    // Wait for the DOM to update and scroll to complete, then focus the input
    setTimeout(() => {
      if (tagNameInputElement) {
        tagNameInputElement.focus()
        tagNameInputElement.select() // Select all text for easy replacement
      }
    }, 150)
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
    await saveCustomTag(
      selectedTagName,
      selectedTagContent.map((tag) => tag.name),
      selectedTagType
    )

    // Update local state
    const updatedTag: CustomTag = {
      name: selectedTagName,
      tags: selectedTagContent.map((tag) => tag.name),
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

    // Update the store with the current customTags order
    promptsData.update((data) => ({
      ...data,
      customTags: { ...customTags }
    }))

    // Save the entire prompts data
    await savePromptsData()

    hasUnsavedChanges = false
  }

  function handleTagsChange(removedTagName?: string) {
    // If a tag was removed and it's currently pinned for this parent tag, remove the pin
    if (removedTagName && selectedTagName && (selectedTagType === 'random' || selectedTagType === 'consistent-random')) {
      const currentOverrideTag = testModeStore[selectedTagName]?.overrideTag
      if (currentOverrideTag === removedTagName) {
        removeTestModeOverride(selectedTagName)
      }
    }
    
    // Mark as having unsaved changes
    hasUnsavedChanges = true
    statusMessage = ''
  }

  function handleTagTypeChange() {
    // Mark as having unsaved changes
    hasUnsavedChanges = true
    statusMessage = ''
  }

  async function handleCustomTagDoubleClick(tagName: string) {
    // Find the clicked tag in selectedTagContent
    const clickedTag = selectedTagContent.find((tag) => tag.name === tagName)
    if (!clickedTag) return

    // Check if the clicked tag already exists as a custom tag
    if (tagName in customTags) {
      // Navigate to edit the existing custom tag
      await selectTag(tagName)
      return
    }

    // Split the tag content by comma and create individual tags
    let tagsToAdd: string[] = []

    if (clickedTag.type === 'regular') {
      // For regular tags, split the name by comma
      tagsToAdd = clickedTag.name
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag)
    } else {
      // For sequential/random tags, use their tags array
      tagsToAdd = clickedTag.tags
    }

    // Create new sequential tag with the split tags
    await addNewTag(tagsToAdd)
  }

  function handlePinToggle(childTagName: string, targetTag: string, shouldPin: boolean) {
    if (shouldPin) {
      setTestModeOverride(selectedTagName, targetTag)
    } else {
      removeTestModeOverride(selectedTagName)
    }
  }

  async function saveTagName() {
    if (!editingTagName.trim() || editingTagName === selectedTagName) {
      editingTagName = selectedTagName
      return
    }

    const newName = editingTagName.trim()

    // Check if new name already exists in combined tags (custom tags + danbooru tags)
    if ($combinedTags.includes(newName)) {
      statusMessage = 'A tag with this name already exists!'
      return
    }

    // Update local state - rename the tag while maintaining position
    const existingTag = customTags[selectedTagName]
    const renamedTag: CustomTag = {
      ...existingTag,
      name: newName
    }

    // Maintain the order by rebuilding the object
    const tagNames = Object.keys(customTags)
    const newCustomTags: Record<string, CustomTag> = {}

    for (const tagName of tagNames) {
      if (tagName === selectedTagName) {
        newCustomTags[newName] = renamedTag
      } else {
        newCustomTags[tagName] = customTags[tagName]
      }
    }

    customTags = newCustomTags

    // Update the store
    promptsData.update((data) => {
      // Maintain the order in store as well
      const storeTagNames = Object.keys(data.customTags)
      const newStoreCustomTags: Record<string, CustomTag> = {}

      for (const tagName of storeTagNames) {
        if (tagName === selectedTagName) {
          newStoreCustomTags[newName] = renamedTag
        } else {
          newStoreCustomTags[tagName] = data.customTags[tagName]
        }
      }

      // Replace old tag name with new name in all tag zones
      const updateTagsInZone = (tags: string[]): string[] => {
        return tags.map((tag) => (tag === selectedTagName ? newName : tag))
      }

      return {
        ...data,
        customTags: newStoreCustomTags,
        tags: {
          ...data.tags,
          all: updateTagsInZone(data.tags.all),
          zone1: updateTagsInZone(data.tags.zone1),
          zone2: updateTagsInZone(data.tags.zone2),
          negative: updateTagsInZone(data.tags.negative)
        }
      }
    })

    // Update selected tag name
    selectedTagName = newName
    hasUnsavedChanges = true
    statusMessage = ''

    // Scroll to the renamed tag
    scrollToTag(newName)
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
    selectedTagType = 'sequential'
    editingTagName = ''
    hasUnsavedChanges = false
    statusMessage = ''
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      handleClose()
    }
  }

  // Drag & drop handlers
  function handleDragStart(event: DragEvent, tagName: string) {
    draggedTagName = tagName
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', tagName)
    }
  }

  function handleDragEnd() {
    draggedTagName = null
    dropPosition = null
  }

  function handleDragOver(event: DragEvent, index: number) {
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
    dropPosition = index
  }

  function handleDragLeave() {
    dropPosition = null
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault()

    if (!draggedTagName || dropPosition === null) return

    const tagNames = Object.keys(customTags)
    const draggedIndex = tagNames.indexOf(draggedTagName)

    if (draggedIndex === -1) return

    // Calculate the actual insertion index accounting for the removed element
    let insertIndex = dropPosition
    if (draggedIndex < dropPosition) {
      insertIndex = dropPosition - 1
    }

    // Create new order
    const newTagNames = [...tagNames]
    const [draggedTag] = newTagNames.splice(draggedIndex, 1)
    newTagNames.splice(insertIndex, 0, draggedTag)

    // Rebuild customTags object in new order
    const newCustomTags: Record<string, CustomTag> = {}
    for (const tagName of newTagNames) {
      newCustomTags[tagName] = customTags[tagName]
    }

    customTags = newCustomTags

    // Mark as having unsaved changes
    hasUnsavedChanges = true

    draggedTagName = null
    dropPosition = null
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
          <div class="flex-1 p-4 overflow-y-auto" bind:this={leftColumnElement}>
            <div class="space-y-1">
              {#each Object.keys(customTags) as tagName, index (tagName)}
                {@const tag = customTags[tagName]}
                {@const isForceOverridden = !!testModeStore[tagName]?.overrideTag}
                <div class="relative">
                  <!-- Drop indicator before this tag -->
                  {#if dropPosition === index && draggedTagName !== null}
                    <div
                      class="absolute w-full h-0.5 bg-blue-500 z-10 -top-0.5 left-0 animate-pulse"
                    ></div>
                  {/if}

                  <button
                    type="button"
                    draggable="true"
                    class="w-full text-left {getTagClasses({
                      tag: tag,
                      selected: selectedTagName === tagName,
                      dragged: draggedTagName === tagName,
                      additionalClasses: 'pl-2 pr-3 py-1.5 cursor-move'
                    })}"
                    data-tag-name={tagName}
                    onclick={() => selectTag(tagName)}
                    ondragstart={(e) => handleDragStart(e, tagName)}
                    ondragend={handleDragEnd}
                    ondragover={(e) => handleDragOver(e, index)}
                    ondragleave={handleDragLeave}
                    ondrop={handleDrop}
                    aria-label="Drag to reorder tag: {tagName}"
                  >
                    <div class="flex items-center justify-between w-full">
                      <span>{tagName}</span>
                      {#if isForceOverridden && (tag.type === 'random' || tag.type === 'consistent-random')}
                        <LockClosed class="w-4 h-4 text-orange-500 flex-shrink-0" />
                      {/if}
                    </div>
                  </button>

                  <!-- Drop indicator after this tag (for last position) -->
                  {#if dropPosition === index + 1 && draggedTagName !== null}
                    <div
                      class="absolute w-full h-0.5 bg-blue-500 z-10 -bottom-0.5 left-0 animate-pulse"
                    ></div>
                  {/if}
                </div>
              {/each}
              {#if Object.keys(customTags).length === 0}
                <p class="text-gray-400 text-sm italic">No custom tags available</p>
              {/if}
            </div>
          </div>
        </div>

        <!-- Right column: Selected tag content -->
        <div class="flex-1 p-4 flex flex-col gap-2">
          {#if selectedTagName}
            <div class="flex items-center justify-between">
              <input
                type="text"
                bind:value={editingTagName}
                bind:this={tagNameInputElement}
                class="text-sm font-semibold text-gray-900 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 px-3 py-2 flex-1 mr-2"
                tabindex="0"
                onkeydown={handleNameKeydown}
                onblur={saveTagName}
                placeholder="Custom tag name"
              />
              <div class="flex gap-2">
                <button
                  type="button"
                  onclick={() => addNewTag()}
                  class="inline-flex items-center gap-1 p-1.5 bg-green-200 text-green-600 rounded-md hover:bg-green-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors text-sm"
                  tabindex="-1"
                  title="Add new custom tag"
                >
                  <Plus class="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onclick={duplicateSelectedTag}
                  class="inline-flex items-center gap-1 p-1.5 bg-blue-200 text-blue-600 rounded-md hover:bg-blue-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors text-sm"
                  tabindex="-1"
                  title="Duplicate this custom tag"
                >
                  <DocumentDuplicate class="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onclick={deleteSelectedTag}
                  class="inline-flex items-center gap-1 p-1.5 bg-red-200 text-red-500 rounded-md hover:bg-red-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors text-sm"
                  tabindex="-1"
                  title="Delete this custom tag"
                >
                  <Trash class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- Tag type radio buttons -->
            <div class="flex items-center gap-4 text-sm">
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="tagType"
                  value="sequential"
                  checked={selectedTagType === 'sequential'}
                  tabindex="-1"
                  onchange={() => {
                    selectedTagType = 'sequential'
                    handleTagTypeChange()
                  }}
                  class="w-4 h-4 text-pink-600 bg-gray-100 border-gray-300 focus:outline-none"
                />
                <span class="text-gray-700">Sequential</span>
              </label>
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="tagType"
                  value="random"
                  checked={selectedTagType === 'random'}
                  tabindex="-1"
                  onchange={() => {
                    selectedTagType = 'random'
                    handleTagTypeChange()
                  }}
                  class="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 focus:outline-none"
                />
                <span class="text-gray-700">Random</span>
              </label>
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="tagType"
                  value="consistent-random"
                  checked={selectedTagType === 'consistent-random'}
                  tabindex="-1"
                  onchange={() => {
                    selectedTagType = 'consistent-random'
                    handleTagTypeChange()
                  }}
                  class="w-4 h-4 text-orange-600 bg-gray-100 border-gray-300 focus:outline-none"
                />
                <span class="text-gray-700">Consistent Random</span>
              </label>
            </div>

            <div class="flex-1 overflow-y-auto max-h-80">
              <TagInput
                id="custom-tag-content"
                label=""
                bind:tags={selectedTagContent}
                onTagsChange={handleTagsChange}
                onCustomTagDoubleClick={handleCustomTagDoubleClick}
                testOverrideTag={selectedTagTestMode.enabled ? selectedTagTestMode.overrideTag : ''}
                parentTagType={selectedTagType}
                onPinToggle={handlePinToggle}
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
          {:else if selectedTagName && (selectedTagType === 'random' || selectedTagType === 'consistent-random')}
            <span class="text-gray-500">
              <strong>Tip:</strong> Right-click on tags in the display area to pin specific options for testing.
            </span>
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

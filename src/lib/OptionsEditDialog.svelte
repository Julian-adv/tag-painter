<!-- Dialog component for editing options list and category settings -->
<script lang="ts">
  import type { OptionItem, PromptCategory } from './types'
  import AutoCompleteTextarea from './AutoCompleteTextarea.svelte'
  import { savePromptsData } from './stores/promptsStore'

  interface Props {
    show: boolean
    label: string
    options: OptionItem[]
    value: OptionItem
    onClose: () => void
    onOptionsChange: (options: OptionItem[]) => void
    onValueChange: (value: OptionItem) => void
    // Category management props
    category: PromptCategory
    allCategories: PromptCategory[]
    onCategoryUpdate: (updatedCategory: PromptCategory) => void
    onCategoryDelete: (categoryId: string) => void
  }

  let {
    show,
    label,
    options,
    value,
    onClose,
    onOptionsChange,
    onValueChange,
    category,
    allCategories,
    onCategoryUpdate,
    onCategoryDelete
  }: Props = $props()

  let selectedOption = $state<OptionItem>(value)
  let newOptionTitle = $state('')
  let newOptionValue = $state('')
  let editedOptionTitle = $state('')
  let optionsListElement = $state<HTMLDivElement | undefined>()
  let draggedIndex = $state<number | null>(null)
  let dragOverIndex = $state<number | null>(null)

  // Category management state
  let editedCategoryName = $state('')
  let selectedAliasId = $state('')
  let isLinkedToCategory = $derived(!!selectedAliasId)

  // Update form values when dialog opens
  $effect(() => {
    if (show) {
      selectedOption = value
      newOptionTitle = ''
      newOptionValue = value.value || ''
      editedOptionTitle = value.title || ''

      // Initialize category form values
      editedCategoryName = category.name
      selectedAliasId = category.aliasOf || ''

      // Scroll to selected option after dialog opens
      setTimeout(() => {
        scrollToSelectedOption()
      }, 100)
    }
  })

  // Get available categories for aliasing (excluding self and existing aliases)
  let availableCategories = $derived(
    allCategories.filter(
      (cat) => cat.id !== category.id && !cat.aliasOf // Exclude self and categories that are already aliases
    )
  )

  // Check if new option title already exists
  let titleAlreadyExists = $derived(
    newOptionTitle.trim() &&
      options.some((option) => option.title.toLowerCase() === newOptionTitle.trim().toLowerCase())
  )

  function scrollToSelectedOption() {
    if (!optionsListElement || !selectedOption.title) return

    const selectedButton = optionsListElement.querySelector('.option-item.selected') as HTMLElement
    if (selectedButton) {
      selectedButton.scrollIntoView({
        behavior: 'instant',
        block: 'center'
      })
    }
  }

  function handleOptionSelect(option: OptionItem) {
    // Auto-update current option before switching
    if (
      selectedOption.title &&
      (newOptionValue.trim() !== selectedOption.value ||
        editedOptionTitle.trim() !== selectedOption.title)
    ) {
      handleUpdateOption()
    }

    // Use setTimeout to ensure state updates are completed first
    setTimeout(() => {
      selectedOption = option
      newOptionTitle = ''
      newOptionValue = option.value || ''
      editedOptionTitle = option.title || ''
    }, 0)
  }

  function handleAddNewOption() {
    // Auto-update current option before adding new one
    if (
      selectedOption.title &&
      (newOptionValue.trim() !== selectedOption.value ||
        editedOptionTitle.trim() !== selectedOption.title)
    ) {
      handleUpdateOption()
    }

    // Check if title already exists
    const titleExists = options.some(
      (option) => option.title.toLowerCase() === newOptionTitle.trim().toLowerCase()
    )

    if (titleExists) {
      alert('This title already exists!')
      return
    }

    const newOption: OptionItem = {
      title: newOptionTitle.trim(),
      value: newOptionTitle.trim()
    }

    const updatedOptions = [...options, newOption]
    onOptionsChange(updatedOptions)

    // Select the newly added option
    selectedOption = newOption
    onValueChange(newOption)

    // Clear the input fields
    newOptionTitle = ''
    newOptionValue = ''
    editedOptionTitle = newOption.title
  }

  function handleUpdateOption() {
    const hasValueChange = newOptionValue !== selectedOption.value
    const hasTitleChange =
      editedOptionTitle.trim() && editedOptionTitle.trim() !== selectedOption.title

    if (hasValueChange || hasTitleChange) {
      // Check if title already exists (excluding current option)
      if (
        hasTitleChange &&
        editedOptionTitle.trim().toLowerCase() !== selectedOption.title.toLowerCase()
      ) {
        const titleExists = options.some(
          (option) =>
            option.title !== selectedOption.title &&
            option.title.toLowerCase() === editedOptionTitle.trim().toLowerCase()
        )
        if (titleExists) {
          alert('This title already exists!')
          return
        }
      }

      const updatedOptions = options.map((option) => {
        if (option.title === selectedOption.title) {
          return {
            ...option,
            title: hasTitleChange ? editedOptionTitle.trim() : option.title,
            value: hasValueChange ? newOptionValue : option.value
          }
        }
        return option
      })

      onOptionsChange(updatedOptions)

      const updatedSelectedOption = {
        ...selectedOption,
        title: hasTitleChange ? editedOptionTitle.trim() : selectedOption.title,
        value: hasValueChange ? newOptionValue : selectedOption.value
      }

      selectedOption = updatedSelectedOption
      onValueChange(updatedSelectedOption)

      if (hasValueChange) newOptionValue = ''
      if (hasTitleChange) editedOptionTitle = updatedSelectedOption.title
    }
  }

  function handleDuplicateOption() {
    if (!selectedOption.title) return

    // Auto-update current option before duplicating
    if (
      newOptionValue.trim() !== selectedOption.value ||
      editedOptionTitle.trim() !== selectedOption.title
    ) {
      handleUpdateOption()
    }

    // Generate unique title by adding number suffix
    let duplicateTitle = selectedOption.title
    let counter = 2
    while (options.some((option) => option.title.toLowerCase() === duplicateTitle.toLowerCase())) {
      duplicateTitle = `${selectedOption.title} ${counter}`
      counter++
    }

    const duplicatedOption: OptionItem = {
      title: duplicateTitle,
      value: selectedOption.value
    }

    // Insert duplicated option right after the original option
    const currentIndex = options.findIndex((option) => option.title === selectedOption.title)
    const updatedOptions = [...options]
    updatedOptions.splice(currentIndex + 1, 0, duplicatedOption)
    onOptionsChange(updatedOptions)

    // Select the newly duplicated option
    selectedOption = duplicatedOption
    onValueChange(duplicatedOption)

    // Update form fields
    newOptionValue = duplicatedOption.value || ''
    editedOptionTitle = duplicatedOption.title
  }

  function handleDeleteOption() {
    const updatedOptions = options.filter((option) => option.title !== selectedOption.title)
    onOptionsChange(updatedOptions)

    // Select the closest remaining option
    if (updatedOptions.length > 0) {
      const currentIndex = options.findIndex((option) => option.title === selectedOption.title)
      let newIndex = currentIndex
      if (currentIndex >= updatedOptions.length) {
        newIndex = updatedOptions.length - 1
      }
      if (newIndex < 0) {
        newIndex = 0
      }
      selectedOption = updatedOptions[newIndex]
      onValueChange(selectedOption)
    } else {
      selectedOption = { title: '', value: '' }
      onValueChange(selectedOption)
    }
    newOptionTitle = ''
    newOptionValue = ''
    editedOptionTitle = ''
  }

  async function handleSave() {
    // Auto-update current option before closing
    if (
      selectedOption.title &&
      (newOptionValue.trim() !== selectedOption.value ||
        editedOptionTitle.trim() !== selectedOption.title)
    ) {
      handleUpdateOption()
    }

    // Save category changes if there are any
    const trimmedName = editedCategoryName.trim()
    const hasChanges = trimmedName !== category.name || selectedAliasId !== (category.aliasOf || '')

    if (hasChanges && trimmedName) {
      const updatedCategory: PromptCategory = {
        ...category,
        name: trimmedName,
        aliasOf: selectedAliasId || undefined
      }
      onCategoryUpdate(updatedCategory)
    }

    onValueChange(selectedOption)

    // Save to prompts.json
    try {
      await savePromptsData()
    } catch (error) {
      console.error('Failed to save prompts:', error)
      alert('Failed to save prompts. Please try again.')
      return
    }

    onClose()
  }

  function handleDeleteCategory() {
    if (
      confirm(
        `Are you sure you want to delete the "${category.name}" category? This action cannot be undone.`
      )
    ) {
      onCategoryDelete(category.id)
      onClose()
    }
  }

  // Drag and drop handlers
  function handleDragStart(event: DragEvent, index: number) {
    draggedIndex = index
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', index.toString())
    }
  }

  function handleContainerDragOver(event: DragEvent) {
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }

    // Find the closest button element
    const target = event.target as HTMLElement
    const button = target.closest('.option-item') as HTMLButtonElement
    if (button && optionsListElement) {
      const buttons = Array.from(optionsListElement.querySelectorAll('.option-item'))
      const newIndex = buttons.indexOf(button)
      if (newIndex !== -1 && dragOverIndex !== newIndex) {
        dragOverIndex = newIndex
      }
    }
  }

  function handleContainerDragLeave(event: DragEvent) {
    // Only clear if leaving the container entirely
    if (!optionsListElement?.contains(event.relatedTarget as Node)) {
      dragOverIndex = null
    }
  }

  function handleContainerDrop(event: DragEvent) {
    event.preventDefault()
    const target = event.target as HTMLElement
    const button = target.closest('.option-item') as HTMLButtonElement

    if (button && optionsListElement && draggedIndex !== null) {
      const buttons = Array.from(optionsListElement.querySelectorAll('.option-item'))
      const dropIndex = buttons.indexOf(button)

      if (dropIndex !== -1 && draggedIndex !== dropIndex) {
        // Reorder the options array
        const reorderedOptions = [...options]
        const [removed] = reorderedOptions.splice(draggedIndex, 1)
        reorderedOptions.splice(dropIndex, 0, removed)
        onOptionsChange(reorderedOptions)
      }
    }

    draggedIndex = null
    dragOverIndex = null
  }

  function handleDragEnd() {
    draggedIndex = null
    dragOverIndex = null
  }
</script>

{#if show}
  <div
    class="dialog-overlay"
    onclick={onClose}
    role="button"
    tabindex="0"
    onkeydown={(e) => e.key === 'Escape' && onClose()}
    ondragover={(e) => e.preventDefault()}
    ondragenter={(e) => e.preventDefault()}
    ondragleave={(e) => e.preventDefault()}
    ondrop={(e) => e.preventDefault()}
  >
    <div
      class="dialog"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      ondragover={(e) => e.stopPropagation()}
      ondragenter={(e) => e.stopPropagation()}
      ondragleave={(e) => e.stopPropagation()}
      ondrop={(e) => e.stopPropagation()}
      role="dialog"
      tabindex="-1"
    >
      <div class="dialog-header">
        <h3>{label}</h3>
        <button type="button" class="close-button" onclick={onClose} aria-label="Close dialog">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="18" y1="6" x2="6" y2="18" stroke-width="2" stroke-linecap="round" />
            <line x1="6" y1="6" x2="18" y2="18" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
      </div>
      <div class="dialog-body">
        <div class="grid-container">
          <label for="category-name" class="category-name-label">Category Name:</label>
          <input
            id="category-name"
            class="category-name-input"
            type="text"
            bind:value={editedCategoryName}
            placeholder="Enter category name"
          />

          <label for="alias-select" class="alias-label">Link to Category:</label>
          <select id="alias-select" class="alias-select" bind:value={selectedAliasId}>
            <option value="">None - Use own options</option>
            {#each availableCategories as cat (cat.id)}
              <option value={cat.id}>{cat.name}</option>
            {/each}
          </select>

          <!-- Separator -->
          <div class="section-separator"></div>

          <!-- Options Header -->
          <div class="options-header">Options</div>

          <!-- Value Header -->
          <div class="value-header">Value</div>

          <!-- Options List -->
          <div
            class="options-list"
            class:disabled={isLinkedToCategory}
            bind:this={optionsListElement}
            ondragover={handleContainerDragOver}
            ondragleave={handleContainerDragLeave}
            ondrop={handleContainerDrop}
            role="listbox"
            aria-label="Draggable options list"
            tabindex="0"
          >
            {#each options as option, index (option.title)}
              <button
                class="option-item"
                class:selected={option.title === selectedOption.title}
                class:dragging={draggedIndex === index}
                class:drag-over={dragOverIndex === index}
                draggable="true"
                onclick={() => handleOptionSelect(option)}
                ondragstart={(e) => handleDragStart(e, index)}
                ondragend={handleDragEnd}
                title="Drag to reorder"
              >
                {option.title}
              </button>
            {/each}
          </div>

          <!-- Selected Option Header -->
          <div
            class="selected-option-header"
            class:disabled={!selectedOption.title || isLinkedToCategory}
          >
            <AutoCompleteTextarea
              id="edit-option-title"
              bind:value={editedOptionTitle}
              placeholder="Option title"
              rows={1}
            />
            <button
              class="duplicate-option-btn"
              onclick={handleDuplicateOption}
              disabled={!selectedOption.title || isLinkedToCategory}
              aria-label="Duplicate option"
              title="Duplicate this option"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5,15H4a2,2 0 0,1 -2,-2V4a2,2 0 0,1 2,-2H13a2,2 0 0,1 2,2v1"></path>
              </svg>
            </button>
            <button
              class="delete-option-btn"
              onclick={handleDeleteOption}
              disabled={!selectedOption.title || options.length === 0 || isLinkedToCategory}
              aria-label="Delete option"
              title="Delete this option"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <polyline points="3,6 5,6 21,6"></polyline>
                <path
                  d="M19,6V20a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6M8,6V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2V6"
                ></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          </div>

          <!-- Option Value Textarea -->
          <div class="textarea-area" class:disabled={isLinkedToCategory}>
            <AutoCompleteTextarea
              id="option-value"
              bind:value={newOptionValue}
              placeholder="Enter option value"
              rows={12}
            />
          </div>

          <!-- Left Controls -->
          <div class="left-controls" class:disabled={isLinkedToCategory}>
            <AutoCompleteTextarea
              id="new-option-title"
              bind:value={newOptionTitle}
              placeholder="New option"
              rows={1}
            />
            <button
              class="add-option-btn"
              onclick={handleAddNewOption}
              disabled={!newOptionTitle.trim() || titleAlreadyExists || isLinkedToCategory}
            >
              Add
            </button>
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="delete-category-btn" onclick={handleDeleteCategory}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="3,6 5,6 21,6"></polyline>
            <path
              d="M19,6V20a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6M8,6V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2V6"
            ></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
          Delete category
        </button>
        <div class="dialog-actions">
          <button type="button" class="dialog-close-btn" onclick={onClose}> Close </button>
          <button type="button" class="dialog-save-btn" onclick={handleSave}> Save </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    pointer-events: all;
  }

  .dialog {
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    width: 90%;
    max-width: 800px;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid #eee;
  }

  .dialog-header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #333;
  }

  .close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: none;
    color: #666;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .close-button:hover {
    background: #f0f0f0;
    color: #333;
  }

  .dialog-body {
    flex: 1;
    padding: 1rem;
    overflow-y: auto;
  }

  .dialog-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-top: 1px solid #eee;
  }

  .dialog-close-btn {
    padding: 0.5rem 1rem;
    background: #6c757d;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s ease;
  }

  .dialog-close-btn:hover {
    background: #5a6268;
  }

  .grid-container {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto auto auto auto 1fr auto auto;
    gap: 1rem;
    height: 100%;
    grid-template-areas:
      'category-name-label category-name-input'
      'alias-label alias-select'
      'separator separator'
      'options-header value-header'
      'options-list selected-header'
      'options-list textarea'
      'left-controls .';
  }

  .options-list {
    grid-area: options-list;
    overflow-y: auto;
    border: 1px solid #ddd;
    border-radius: 4px;
    max-height: 350px;
  }

  .options-list.disabled {
    background-color: #f0f0f0;
    pointer-events: none;
    opacity: 0.6;
  }

  .textarea-area.disabled {
    pointer-events: none;
    opacity: 0.6;
  }

  .option-item {
    display: block;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: white;
    border: none;
    border-bottom: 1px solid #eee;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.2s ease;
    font-size: 0.875rem;
  }

  .option-item:hover {
    background: #f8f9fa;
  }

  .option-item.selected {
    background: #e3f2fd;
    color: #1976d2;
  }

  .option-item:last-child {
    border-bottom: none;
  }

  .option-item:active {
    cursor: grabbing;
  }

  .option-item.dragging {
    opacity: 0.5;
    transform: scale(0.98);
  }

  .option-item.drag-over {
    border-left: 3px solid #4caf50;
    background: #f8f9fa;
    transform: translateX(2px);
  }

  .left-controls :global(.textarea-container) {
    flex: 2;
  }

  .left-controls :global(.textarea) {
    padding: 8px !important;
    border: 1px solid #ddd !important;
    border-radius: 4px !important;
    font-size: 14px !important;
    height: 36px !important;
    min-height: 36px !important;
    max-height: 36px !important;
    resize: none !important;
    box-sizing: border-box !important;
  }

  .add-option-btn {
    padding: 0.5rem 1rem;
    background: #28a745;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s ease;
    height: 36px;
  }

  .add-option-btn:hover:not(:disabled) {
    background: #218838;
  }

  .add-option-btn:disabled {
    background: #cccccc;
    cursor: not-allowed;
  }

  .selected-option-header {
    grid-area: selected-header;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }

  .selected-option-header :global(.textarea-container) {
    flex: 1;
    margin: 0;
  }

  .selected-option-header :global(.textarea) {
    padding: 6px 8px !important;
    border: 1px solid #ddd !important;
    border-radius: 4px !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    color: #333 !important;
    height: 32px !important;
    min-height: 32px !important;
    max-height: 32px !important;
    resize: none !important;
    box-sizing: border-box !important;
    line-height: 1.2 !important;
  }

  .selected-option-header :global(.textarea:focus) {
    outline: none !important;
    border-color: #2196f3 !important;
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2) !important;
  }

  .selected-option-header.disabled :global(.textarea) {
    background-color: #f5f5f5 !important;
    color: #999 !important;
    cursor: not-allowed !important;
    pointer-events: none !important;
  }

  .duplicate-option-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: #e8f5e8;
    border: 1px solid #c8e6c9;
    border-radius: 4px;
    color: #2e7d32;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .duplicate-option-btn:hover:not(:disabled) {
    background: #c8e6c9;
    border-color: #a5d6a7;
    color: #1b5e20;
  }

  .duplicate-option-btn:disabled {
    background: #cccccc;
    border-color: #cccccc;
    color: #999;
    cursor: not-allowed;
  }

  .delete-option-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: #fee;
    border: 1px solid #fcc;
    border-radius: 4px;
    color: #c33;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .delete-option-btn:hover:not(:disabled) {
    background: #fcc;
    border-color: #faa;
    color: #a11;
  }

  .delete-option-btn:disabled {
    background: #cccccc;
    cursor: not-allowed;
  }

  .textarea-area {
    grid-area: textarea;
    display: flex;
    flex-direction: column;
  }

  .textarea-area :global(textarea) {
    min-height: 300px !important;
    height: 300px !important;
    flex: 1;
    resize: vertical !important;
    overflow: auto !important;
  }

  .left-controls {
    grid-area: left-controls;
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .left-controls.disabled {
    pointer-events: none;
    opacity: 0.6;
  }

  .dialog-actions {
    display: flex;
    gap: 0.5rem;
  }

  .dialog-save-btn {
    padding: 0.5rem 1rem;
    background: #2196f3;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s ease;
  }

  .dialog-save-btn:hover {
    background: #1976d2;
  }

  .category-name-label {
    grid-area: category-name-label;
    font-weight: 500;
    color: #555;
    font-size: 0.875rem;
    align-self: center;
    text-align: right;
  }

  .category-name-input {
    grid-area: category-name-input;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
    box-sizing: border-box;
    background: white;
  }

  .category-name-input:focus {
    outline: none;
    border-color: #2196f3;
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
  }

  .alias-label {
    grid-area: alias-label;
    font-weight: 500;
    color: #555;
    font-size: 0.875rem;
    align-self: center;
    text-align: right;
  }

  .alias-select {
    grid-area: alias-select;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
    box-sizing: border-box;
    background: white;
  }

  .alias-select:focus {
    outline: none;
    border-color: #2196f3;
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
  }

  .delete-category-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 1rem;
    background: #dc3545;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s ease;
  }

  .delete-category-btn:hover {
    background: #c82333;
  }

  .delete-category-btn:active {
    transform: scale(0.98);
  }

  .options-header {
    grid-area: options-header;
    font-weight: 500;
    color: #555;
    font-size: 0.875rem;
    align-self: end;
    text-align: left;
    margin-top: 0rem;
  }

  .value-header {
    grid-area: value-header;
    font-weight: 500;
    color: #555;
    font-size: 0.875rem;
    align-self: end;
    text-align: left;
    margin-top: 0rem;
  }

  .section-separator {
    grid-area: separator;
    border-top: 1px solid #eee;
    margin: 0rem 0;
  }
</style>

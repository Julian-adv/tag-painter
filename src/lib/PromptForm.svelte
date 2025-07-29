<!-- Component for prompt input forms and checkpoint selection -->
<script lang="ts">
  import TextAreaInput from './TextAreaInput.svelte'
  import CategoryManagerDialog from './CategoryManagerDialog.svelte'
  import LoraSelector from './LoraSelector.svelte'
  import {
    promptsData,
    updateCategoryValue,
    updateCategoryValues,
    updateCheckpoint,
    updateUpscale,
    updateFaceDetailer,
    updateSelectedLoras,
    updateLoraWeight,
    addCategory,
    removeCategory,
    updateCategory,
    reorderCategories,
    resolvedRandomValues
  } from './stores/promptsStore'
  import type { PromptCategory, OptionItem } from '$lib/types'

  interface Props {
    availableCheckpoints: string[]
    disabledCategoryIds: Set<string>
  }

  let { availableCheckpoints, disabledCategoryIds }: Props = $props()

  function handleLoraChange(loras: string[]) {
    updateSelectedLoras(loras)
  }

  function handleLoraWeightChange(weight: number) {
    updateLoraWeight(weight)
  }

  // Dynamic category update functions
  function handleCategoryValueChange(categoryId: string) {
    return (value: OptionItem) => {
      updateCategoryValue(categoryId, value)
    }
  }

  function handleCategoryOptionsChange(categoryId: string) {
    return (options: OptionItem[]) => {
      updateCategoryValues(categoryId, options)
    }
  }

  // Category management
  let showCategoryManager = $state(false)
  let draggedIndex = $state<number | null>(null)
  let dragOverIndex = $state<number | null>(null)

  function handleAddCategory(newCategory: PromptCategory) {
    addCategory(newCategory)
  }

  function handleCategoryUpdate(updatedCategory: PromptCategory) {
    updateCategory(updatedCategory.id, updatedCategory)
  }

  function handleCategoryDelete(categoryId: string) {
    removeCategory(categoryId)
  }

  // Drag and drop handlers
  function handleDragStart(event: DragEvent, index: number) {
    draggedIndex = index
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/html', '')
    }
  }

  function handleDragOver(event: DragEvent, index: number) {
    event.preventDefault()
    dragOverIndex = index
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
  }

  function handleDragLeave() {
    dragOverIndex = null
  }

  function handleDrop(event: DragEvent, index: number) {
    event.preventDefault()
    if (draggedIndex !== null && draggedIndex !== index) {
      reorderCategories(draggedIndex, index)
    }
    draggedIndex = null
    dragOverIndex = null
  }

  function handleDragEnd() {
    draggedIndex = null
    dragOverIndex = null
  }
</script>

<div class="prompt-form">
  <div class="category-header">
    <h3>Prompt Categories</h3>
    <button
      type="button"
      class="btn-add-category bg-sky-500"
      onclick={() => (showCategoryManager = true)}
    >
      + Add Category
    </button>
  </div>

  <div class="form-section" role="list" aria-label="Category list">
    {#each $promptsData.categories as category, index (category.id)}
      <div
        class="category-item {draggedIndex === index ? 'dragging' : ''} {dragOverIndex === index
          ? 'drag-over'
          : ''}"
        role="listitem"
        aria-label="Category: {category.name}"
        ondragover={(e) => handleDragOver(e, index)}
        ondragleave={handleDragLeave}
        ondrop={(e) => handleDrop(e, index)}
        ondragend={handleDragEnd}
      >
        <TextAreaInput
          id={category.id}
          label={category.name}
          placeholder={`${category.name} description...`}
          bind:value={category.currentValue}
          options={category.values}
          onValueChange={handleCategoryValueChange(category.id)}
          onOptionsChange={handleCategoryOptionsChange(category.id)}
          resolvedRandomValue={$resolvedRandomValues[category.id]}
          onDragStart={(e) => handleDragStart(e, index)}
          onCategoryUpdate={handleCategoryUpdate}
          onCategoryDelete={handleCategoryDelete}
          allCategories={$promptsData.categories}
          aliasOf={category.aliasOf}
          isDisabled={disabledCategoryIds.has(category.id)}
        />
      </div>
    {/each}
  </div>

  <div class="form-section">
    <div class="field">
      <label for="checkpoint">Checkpoint</label>
      <select
        id="checkpoint"
        value={$promptsData.selectedCheckpoint || ''}
        onchange={(e) => updateCheckpoint((e.target as HTMLSelectElement).value)}
      >
        <option value="">Select checkpoint...</option>
        {#each availableCheckpoints as checkpoint (checkpoint)}
          <option value={checkpoint}>{checkpoint}</option>
        {/each}
      </select>
    </div>

    <!-- LoRA Selector -->
    <div class="field">
      <LoraSelector
        selectedLoras={$promptsData.selectedLoras}
        onLoraChange={handleLoraChange}
        loraWeight={$promptsData.loraWeight}
        onWeightChange={handleLoraWeightChange}
      />
    </div>

    <div class="field">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={$promptsData.useUpscale}
          onchange={(e) => updateUpscale((e.target as HTMLInputElement).checked)}
        />
        Use Upscale
      </label>
    </div>

    <div class="field">
      <label class="checkbox-label">
        <input
          type="checkbox"
          class="accent-sky-600"
          checked={$promptsData.useFaceDetailer}
          onchange={(e) => updateFaceDetailer((e.target as HTMLInputElement).checked)}
        />
        Use Face Detailer
      </label>
    </div>
  </div>
</div>

<CategoryManagerDialog
  show={showCategoryManager}
  onClose={() => (showCategoryManager = false)}
  onAddCategory={handleAddCategory}
/>

<style>
  .prompt-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    overflow-y: auto;
    max-height: calc(100vh - 480px);
    padding-right: 4px;
  }

  .form-section::-webkit-scrollbar {
    width: 4px;
  }

  .form-section::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 2px;
  }

  .form-section::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 2px;
  }

  .form-section::-webkit-scrollbar-thumb:hover {
    background: #a1a1a1;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .field label {
    font-weight: bold;
    font-size: 14px;
    color: #000;
    text-align: left;
  }

  .field select {
    width: 100%;
    padding: 4px;
    border-radius: 4px;
    border: 1px solid #ddd;
    font-size: 13px;
    background-color: #fff;
    box-sizing: border-box;
    transition: border-color 0.2s ease;
  }

  .field select:focus {
    outline: none;
    border-color: #4caf50;
    box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2);
  }

  .field .checkbox-label {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-weight: normal;
    font-size: 13px;
  }

  .checkbox-label input[type='checkbox'] {
    margin: 0;
    cursor: pointer;
  }

  .category-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #eee;
  }

  .category-header h3 {
    margin: 0;
    font-size: 1rem;
    color: #333;
  }

  .btn-add-category {
    padding: 0.25rem 0.5rem;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8125rem;
    font-weight: 600;
    transition: background 0.2s ease;
  }

  .btn-add-category:hover {
    background: #1976d2;
  }

  .category-item {
    position: relative;
    transition: all 0.2s ease;
    border: 2px solid transparent;
    border-radius: 8px;
  }

  .category-item:active {
    cursor: grabbing;
  }

  .category-item.dragging {
    opacity: 0.5;
    transform: scale(0.98);
  }

  .category-item.drag-over {
    border-color: #4caf50;
    background-color: #f8f9fa;
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }
</style>

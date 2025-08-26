<!-- Dialog for adding new categories -->
<script lang="ts">
  import type { PromptCategory } from '$lib/types'
  import { XMark } from 'svelte-heros-v2'

  interface Props {
    show: boolean
    onClose: () => void
    onAddCategory: (category: PromptCategory) => void
  }

  let { show, onClose, onAddCategory }: Props = $props()

  let newCategoryName = $state('')

  function handleAddCategory() {
    const trimmedName = newCategoryName.trim()
    if (trimmedName) {
      const newCategory: PromptCategory = {
        id: trimmedName.toLowerCase().replace(/\s+/g, '-'),
        name: trimmedName.charAt(0).toUpperCase() + trimmedName.slice(1),
        values: [],
        currentValue: { title: '', value: '' }
      }
      onAddCategory(newCategory)

      // Reset form
      newCategoryName = ''
      onClose()
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose()
    }
  }
</script>

{#if show}
  <div
    class="category-manager-overlay"
    onclick={onClose}
    onkeydown={handleKeydown}
    role="button"
    tabindex="0"
    aria-label="Close category manager"
  >
    <div
      class="category-manager"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-manager-title"
      tabindex="-1"
    >
      <div class="category-manager-header">
        <h3 id="category-manager-title">Add New Category</h3>
        <button type="button" class="close-btn" onclick={onClose}>
          <XMark />
        </button>
      </div>

      <div class="category-manager-form">
        <div class="form-field">
          <label for="category-name">Category Name:</label>
          <input
            id="category-name"
            type="text"
            bind:value={newCategoryName}
            placeholder="e.g., Style, Lighting, etc."
          />
        </div>

        <div class="category-manager-actions">
          <button type="button" class="btn-cancel" onclick={onClose}> Cancel </button>
          <button
            type="button"
            class="btn-add"
            onclick={handleAddCategory}
            disabled={!newCategoryName.trim()}
          >
            Add Category
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .category-manager-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .category-manager {
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    width: 90%;
    max-width: 400px;
    overflow: hidden;
  }

  .category-manager-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid #eee;
  }

  .category-manager-header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #333;
  }

  .close-btn {
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
    font-size: 16px;
    line-height: 1;
    transition: background 0.2s ease;
  }

  .close-btn:hover {
    background: #f0f0f0;
    color: #333;
  }

  .category-manager-form {
    padding: 1rem;
  }

  .form-field {
    margin-bottom: 1rem;
  }

  .form-field label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: #555;
    text-align: left;
  }

  .form-field input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
    box-sizing: border-box;
  }

  .form-field input:focus {
    outline: none;
    border-color: #2196f3;
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
  }

  .category-manager-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .btn-cancel {
    padding: 0.5rem 1rem;
    background: #6c757d;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: background 0.2s ease;
  }

  .btn-cancel:hover {
    background: #5a6268;
  }

  .btn-add {
    padding: 0.5rem 1rem;
    background: #2196f3;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: background 0.2s ease;
  }

  .btn-add:hover:not(:disabled) {
    background: #1976d2;
  }

  .btn-add:disabled {
    background: #cccccc;
    cursor: not-allowed;
  }
</style>

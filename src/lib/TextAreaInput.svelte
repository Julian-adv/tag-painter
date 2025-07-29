<script lang="ts">
  import type { OptionItem, PromptCategory } from './types'
  import OptionsEditDialog from './OptionsEditDialog.svelte'
  import ComboBox from './ComboBox.svelte'
  import AutoCompleteTextarea from './AutoCompleteTextarea.svelte'
  import { getEffectiveOptions } from './stores/promptsStore'

  interface Props {
    id: string
    label: string
    value: OptionItem
    placeholder: string
    options: OptionItem[]
    onValueChange: (value: OptionItem) => void
    onOptionsChange: (options: OptionItem[]) => void
    resolvedRandomValue?: OptionItem
    onDragStart?: (event: DragEvent) => void
    onCategoryUpdate: (updatedCategory: PromptCategory) => void
    onCategoryDelete: (categoryId: string) => void
    allCategories: PromptCategory[]
    aliasOf?: string
    isDisabled?: boolean
  }

  let {
    id,
    label,
    value = $bindable(),
    placeholder,
    options,
    onValueChange,
    onOptionsChange,
    resolvedRandomValue,
    onDragStart,
    onCategoryUpdate,
    onCategoryDelete,
    allCategories,
    aliasOf,
    isDisabled = false
  }: Props = $props()

  let showEditDialog = $state(false)
  let textareaValue = $state(value.value)

  // Create category object for the CategoryEditDialog
  let currentCategory = $derived({
    id,
    name: label,
    values: options,
    currentValue: value,
    aliasOf
  })

  // Get effective options (handles alias categories)
  let effectiveOptions = $derived(getEffectiveOptions(currentCategory, allCategories))

  // Add random option to the effective options array
  let optionsWithRandom = $derived([{ title: '[Random]', value: '[Random]' }, ...effectiveOptions])

  // Sync textareaValue with value.value when value changes
  $effect(() => {
    if (value.title === '[Random]') {
      if (resolvedRandomValue) {
        textareaValue = `[${resolvedRandomValue.title}]\n${resolvedRandomValue.value}`
      } else {
        textareaValue = '[Random - will be selected during generation]'
      }
    } else if (value.value !== textareaValue) {
      textareaValue = value.value
    }
  })

  function handleTextareaValueChange(newValue: string) {
    textareaValue = newValue
    value = { ...value, value: newValue }
    onValueChange(value)
  }

  function openEditDialog() {
    showEditDialog = true
  }

  // Get the appropriate value to pass to OptionsEditDialog
  let dialogValue = $derived.by(() => {
    if (value.title === '[Random]' && resolvedRandomValue) {
      return resolvedRandomValue
    }
    return value
  })

  function closeEditDialog() {
    showEditDialog = false
  }
</script>

<div class="input-group" class:disabled={isDisabled} class:non-random={value.title !== '[Random]'} class:random={value.title === '[Random]'}>
  <div
    class="label-container"
    draggable="true"
    ondragstart={onDragStart}
    title="Drag to reorder"
    role="button"
    tabindex="0"
  >
    <div class="label-with-drag">
      <div class="drag-handle">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="9" cy="12" r="1" />
          <circle cx="9" cy="5" r="1" />
          <circle cx="9" cy="19" r="1" />
          <circle cx="15" cy="12" r="1" />
          <circle cx="15" cy="5" r="1" />
          <circle cx="15" cy="19" r="1" />
        </svg>
      </div>
      <label for={id}>
        {label}
        {#if aliasOf}
          {@const sourceCategory = allCategories.find((cat) => cat.id === aliasOf)}
          <span
            class="alias-indicator"
            title="This category is linked to {sourceCategory?.name || aliasOf}"
          >
            → {sourceCategory?.name || aliasOf}
          </span>
        {/if}
      </label>
    </div>
    <button
      type="button"
      class="category-edit-button"
      onclick={openEditDialog}
      title="Edit category and options"
      aria-label="Edit category and options"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  </div>
  <ComboBox bind:value options={optionsWithRandom} placeholder="Enter title..." {onValueChange} />
  {#if isDisabled}
    <div class="disabled-message">
      <span class="disabled-text">Excluded by -[{label.toLowerCase()}] pattern</span>
    </div>
  {:else}
    <AutoCompleteTextarea
      {id}
      value={textareaValue}
      {placeholder}
      onValueChange={handleTextareaValueChange}
      readonly={value.title === '[Random]'}
    />
  {/if}

  <OptionsEditDialog
    show={showEditDialog}
    {label}
    options={effectiveOptions}
    value={dialogValue}
    onClose={closeEditDialog}
    {onOptionsChange}
    {onValueChange}
    category={currentCategory}
    {allCategories}
    {onCategoryUpdate}
    {onCategoryDelete}
  />
</div>

<style>
  .input-group {
    display: flex;
    flex-direction: column;
    gap: 0.2rem; /* Spacing between label and textarea */
    width: 100%;
  }

  label {
    font-weight: bold;
    font-size: 14px;
    text-align: left;
  }

  .label-container {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
    cursor: grab;
    padding: 0px;
    margin: 0px;
    border-radius: 4px;
    transition: background-color 0.2s ease;
  }

  .category-edit-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    background: #f8f9fa;
    border: 1px solid #ddd;
    border-radius: 3px;
    color: #666;
    cursor: pointer;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .category-edit-button:hover {
    background: #e9ecef;
    border-color: #ccc;
    color: #495057;
  }

  .category-edit-button:active {
    transform: scale(0.95);
  }

  .alias-indicator {
    color: #2196f3;
    font-weight: normal;
    margin-left: 0.25rem;
    font-size: 0.9em;
  }

  .label-container:active {
    cursor: grabbing;
  }

  .label-with-drag {
    display: flex;
    align-items: center;
  }

  .drag-handle {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    width: 24px;
    height: 24px;
    color: #666;
    cursor: grab;
    border-radius: 4px;
    transition: background 0.2s ease;
    flex-shrink: 0;
  }

  .drag-handle:hover {
    background: #f0f0f0;
    color: #333;
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .input-group.disabled {
    background-color: #ffebee !important;
    border-radius: 6px;
    padding: 4px;
    border: 2px solid #ffcdd2 !important;
    opacity: 0.8;
  }

  .input-group.disabled .label-container {
    opacity: 0.7;
  }

  .input-group.disabled :global(.textarea-container) {
    background-color: #fce4ec;
  }

  .input-group.disabled :global(.textarea) {
    background-color: #fce4ec !important;
    color: #d32f2f !important;
  }

  .disabled-message {
    display: block;
    width: 100%;
    padding: 4px;
    border-radius: 4px;
    border: 1px solid #ddd;
    font-size: 13px;
    box-sizing: border-box;
    background-color: #f5f5f5;
    color: #666;
    cursor: not-allowed;
    min-height: 1.5em;
    line-height: 1.5em;
    text-align: left;
  }

  .disabled-text {
    font-style: italic;
  }

  .input-group.non-random {
    background-color: #e0f2fe;
    border-radius: 6px;
    padding: 4px;
    border: 2px solid #b3e5fc;
  }

  .input-group.random {
    background-color: #f5f5f5;
    border-radius: 6px;
    padding: 4px;
    border: 2px solid #e0e0e0;
  }
</style>

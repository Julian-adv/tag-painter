<script lang="ts">
  import AutoCompleteTextarea from '../AutoCompleteTextarea.svelte'
  import type { TreeModel } from './model'
  import { isContainer } from './model'
  import { findNodeByName } from './utils'
  import { m } from '$lib/paraglide/messages'

  interface Props {
    items: string[]
    suggestions: string[]
    onAdd: (item: string) => void
    onRemove: (item: string) => void
    inputId?: string
    model: TreeModel
  }

  let { items, suggestions, onAdd, onRemove, inputId = 'disables-input', model }: Props = $props()

  let newItem: string = $state('')

  function addItem() {
    const value = newItem.trim()
    if (!value) return
    if (!items.includes(value)) {
      onAdd(value)
    }
    newItem = ''
  }

  function isContainerName(name: string): boolean {
    const node = findNodeByName(model, name)
    return !!node && isContainer(node)
  }
</script>

<div class="directive-multiedit">
  <div class="chips">
    {#each items as item (item)}
      <span
        class="chip"
        class:purple={isContainerName(item)}
        class:blue={!isContainerName(item)}
        aria-label={m['treeEdit.disableChipAria']({ name: item })}
      >
        <span class="chip-label">{item}</span>
        <button
          class="chip-remove"
          title={m['treeEdit.disableChipRemoveTitle']({ name: item })}
          onclick={() => onRemove(item)}
        >
          ×
        </button>
      </span>
    {/each}
  </div>
  <div class="adder">
    <div class="input-wrapper">
      <AutoCompleteTextarea
        id={inputId}
        value={newItem}
        rows={1}
        placeholder={m['treeEdit.disablesPlaceholder']()}
        onValueChange={(v) => (newItem = v)}
        onkeydown={(e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            addItem()
          }
        }}
        specialSuggestions={suggestions}
        specialTriggerPrefix=""
      />
    </div>
    <button
      class="add-btn"
      type="button"
      onclick={addItem}
      title={m['treeEdit.disablesAddTitle']()}
    >
      {m['treeEdit.disablesAdd']()}
    </button>
  </div>
</div>

<style>
  .directive-multiedit {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    align-items: flex-start;
    flex: 1;
    width: 100%;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    width: 100%;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.375rem 0.125rem 0.5rem;
    border-radius: 0.375rem;
    border: 1px solid transparent;
  }
  /* Match TreeEdit colors: container header (purple) and value wrapper (sky) */
  .chip.purple {
    background: #f3e8ff;
    color: #6b21a8;
    border-color: #c084fc;
  }
  .chip.blue {
    background: #e0f2fe;
    color: #075985;
    border-color: #bae6fd;
  }
  .chip-label {
    font-size: 0.875rem;
    line-height: 1.25rem;
    font-weight: 500;
  }
  .chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    border-radius: 9999px;
    background: transparent;
    color: #4f46e5;
    border: none;
    cursor: pointer;
  }
  .chip-remove:hover {
    background: #e0e7ff;
  }
  .adder {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
  }
  .input-wrapper {
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    padding: 0.125rem;
    background: #ffffff;
    flex: 1;
    width: 100%;
  }
  .input-wrapper :global(textarea) {
    min-height: 2rem;
    white-space: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .add-btn {
    font-size: 0.875rem;
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;
    background: #d1fae5;
    color: #065f46;
    border: 1px solid #a7f3d0;
    cursor: pointer;
  }
  .add-btn:hover {
    background: #a7f3d0;
  }
</style>

<script lang="ts">
  interface Props {
    value: string
    onSave: (newValue: string) => void
    placeholder?: string
    className?: string
  }

  let { value, onSave, placeholder = '', className = '' }: Props = $props()

  import { tick } from 'svelte'

  let isEditing = $state(false)
  let editingValue = $state('')
  let inputElement: HTMLInputElement | null = $state(null)

  function startEditing() {
    editingValue = value
    isEditing = true
  }

  function finishEditing() {
    if (editingValue.trim() && editingValue !== value) {
      onSave(editingValue.trim())
    }
    isEditing = false
  }

  function cancelEditing() {
    isEditing = false
    editingValue = ''
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      finishEditing()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelEditing()
    }
  }

  export async function activate() {
    // Programmatically start editing and focus/select input
    startEditing()
    await tick()
    if (inputElement) {
      inputElement.focus()
      inputElement.select()
    }
  }
</script>

{#if isEditing}
  <input
    class="inline-editor-input {className}"
    bind:value={editingValue}
    onblur={finishEditing}
    onkeydown={handleKeydown}
    {placeholder}
    bind:this={inputElement}
  />
{:else}
  <span
    class="inline-editor-display {className}"
    ondblclick={startEditing}
    role="button"
    tabindex="0"
    onkeydown={(e) => e.key === 'Enter' && startEditing()}
  >
    {value || placeholder}
  </span>
{/if}

<style>
  .inline-editor-display {
    padding: 0.125rem 0.25rem;
    font-size: 0.875rem;
    cursor: pointer;
    white-space: nowrap;
    user-select: none;
    min-width: 1.5rem;
  }
  .inline-editor-display:hover {
    background-color: rgba(255, 255, 255, 0.5);
  }
  .inline-editor-input {
    border: none;
    background: #ffffff;
    outline: none;
    padding: 0.125rem 0.25rem;
    font-size: 0.875rem;
    min-width: 1.5rem;
    border-radius: 0.25rem;
  }
</style>

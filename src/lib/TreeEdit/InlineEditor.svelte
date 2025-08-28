<script lang="ts">
  interface Props {
    value: string
    onSave: (newValue: string) => void
    placeholder?: string
    className?: string
    onTab?: () => void
    enableAutocomplete?: boolean
    onEditingChange?: (editing: boolean) => void
  }

  let {
    value,
    onSave,
    placeholder = '',
    className = '',
    onTab,
    enableAutocomplete = false,
    onEditingChange
  }: Props = $props()

  import { tick } from 'svelte'
  import AutoCompleteTextarea from '../AutoCompleteTextarea.svelte'

  let isEditing = $state(false)
  let editingValue = $state('')
  let inputElement: HTMLInputElement | null = $state(null)
  let acWrapper: HTMLDivElement | null = $state(null)

  async function startEditing() {
    editingValue = value
    isEditing = true
    onEditingChange?.(true)
    await tick()
    if (enableAutocomplete) {
      const ta = acWrapper?.querySelector('textarea') as HTMLTextAreaElement | null
      if (ta) {
        ta.focus()
        ta.select()
      }
    } else if (inputElement) {
      inputElement.focus()
      inputElement.select()
    }
  }

  function finishEditing() {
    if (editingValue.trim() && editingValue !== value) {
      onSave(editingValue.trim())
    }
    isEditing = false
    onEditingChange?.(false)
  }

  function cancelEditing() {
    isEditing = false
    editingValue = ''
    onEditingChange?.(false)
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      finishEditing()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelEditing()
    } else if (event.key === 'Tab' && !event.shiftKey) {
      // Commit current change and advance focus if requested
      if (onTab) {
        event.preventDefault()
        // Finish editing to persist the current value
        finishEditing()
        // Let parent move focus/start editing next field
        onTab()
      }
    }
  }

  export async function activate() {
    // Programmatically start editing and focus/select input
    startEditing()
    await tick()
    if (enableAutocomplete) {
      // Focus the inner textarea of AutoCompleteTextarea
      const ta = acWrapper?.querySelector('textarea') as HTMLTextAreaElement | null
      if (ta) {
        ta.focus()
        ta.select()
      }
    } else if (inputElement) {
      inputElement.focus()
      inputElement.select()
    }
  }
</script>

{#if isEditing}
  {#if enableAutocomplete}
    <div bind:this={acWrapper} onfocusout={finishEditing} class="w-full" style="width: 100%;">
      <AutoCompleteTextarea
        value={editingValue}
        {placeholder}
        class={'inline-editor-input ' + className}
        onValueChange={(v) => (editingValue = v)}
        onkeydown={(event: KeyboardEvent) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            finishEditing()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            cancelEditing()
          } else if (event.key === 'Tab' && !event.shiftKey) {
            if (onTab) {
              event.preventDefault()
              finishEditing()
              onTab()
            }
          }
        }}
      />
    </div>
  {:else}
    <input
      class="inline-editor-input {className}"
      bind:value={editingValue}
      onblur={finishEditing}
      onkeydown={handleKeydown}
      {placeholder}
      bind:this={inputElement}
    />
  {/if}
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
  }
</style>

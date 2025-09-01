<script lang="ts">
  import { tick } from 'svelte'
  import AutoCompleteTextarea from '../AutoCompleteTextarea.svelte'
  import PlaceholderChipDisplay from './PlaceholderChipDisplay.svelte'
  import type { TreeModel } from './model'

  interface Props {
    value: string
    onSave: (newValue: string) => void
    placeholder?: string
    className?: string
    onTab?: () => void
    enableAutocomplete?: boolean
    onEditingChange?: (editing: boolean) => void
    expandOnEdit?: boolean
    enterStartsEditing?: boolean
    onFinish?: (completed: boolean) => void
    model: TreeModel | null
    onChipDoubleClick?: (tagName: string) => void
  }

  let {
    value,
    onSave,
    placeholder = '',
    className = '',
    onTab,
    enableAutocomplete = false,
    onEditingChange,
    expandOnEdit = false,
    enterStartsEditing = true,
    onFinish,
    model = null,
    onChipDoubleClick
  }: Props = $props()

  let isEditing = $state(false)
  let editingValue = $state('')
  let inputElement: HTMLInputElement | null = $state(null)
  let acWrapper: HTMLDivElement | null = $state(null)

  async function startEditing(behavior: 'selectAll' | 'caretEnd' = 'selectAll') {
    editingValue = value
    isEditing = true
    onEditingChange?.(true)
    await tick()
    if (enableAutocomplete) {
      const ta = acWrapper?.querySelector('textarea') as HTMLTextAreaElement | null
      if (ta) {
        ta.focus()
        if (behavior === 'selectAll') {
          ta.select()
        } else {
          const end = ta.value?.length ?? 0
          ta.selectionStart = end
          ta.selectionEnd = end
        }
      }
    } else if (inputElement) {
      inputElement.focus()
      if (behavior === 'selectAll') {
        inputElement.select()
      } else {
        const end = inputElement.value?.length ?? 0
        inputElement.setSelectionRange?.(end, end)
      }
    }
  }

  function finishEditing() {
    if (editingValue.trim() && editingValue !== value) {
      onSave(editingValue.trim())
    }
    isEditing = false
    onEditingChange?.(false)
    onFinish?.(true) // completed = true
  }

  function cancelEditing() {
    isEditing = false
    editingValue = ''
    onEditingChange?.(false)
    onFinish?.(false) // completed = false (cancelled)
  }

  function handleKeydown(event: KeyboardEvent) {
    // Prevent bubbling to parent row handlers (e.g., space/enter on row)
    event.stopPropagation()
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
          event.stopPropagation()
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
      class="inline-editor-input {className} {expandOnEdit ? 'full-width' : ''}"
      bind:value={editingValue}
      onblur={finishEditing}
      onkeydown={handleKeydown}
      {placeholder}
      bind:this={inputElement}
    />
  {/if}
{:else}
  <div
    class="inline-editor-display {className}"
    ondblclick={() => startEditing('caretEnd')}
    role="button"
    tabindex="-1"
    onkeydown={(e) => {
      if (e.key === 'Enter' && enterStartsEditing) {
        e.preventDefault()
        e.stopPropagation()
        startEditing()
      }
    }}
  >
    <PlaceholderChipDisplay {value} {placeholder} {model} {onChipDoubleClick} />
  </div>
{/if}

<style>
  .inline-editor-display {
    padding: 0.125rem 0.25rem;
    font-size: 0.875rem;
    cursor: pointer;
    /* Allow wrapping across multiple lines when content exceeds parent width */
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
    user-select: none;
    min-width: 1.5rem;
    min-height: 1.25rem; /* Ensure minimum height for empty values */
  }

  /* Ensure empty values have proper height by adding content */
  .inline-editor-display:empty::before {
    content: '\200B'; /* Zero-width space to maintain height */
    display: inline-block;
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
  .inline-editor-input.full-width {
    width: 100%;
  }
</style>

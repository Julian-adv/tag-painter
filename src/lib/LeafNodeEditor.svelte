<!-- Component for leaf node style tag editing (like TreeEdit) -->
<script lang="ts">
  import AutoCompleteTextarea from './AutoCompleteTextarea.svelte'
  import PlaceholderChipDisplay from './TreeEdit/PlaceholderChipDisplay.svelte'
  import { combinedTags, getWildcardModel } from './stores/tagsStore'
  import type { TreeModel } from './TreeEdit/model'
  import { m } from '$lib/paraglide/messages'

  interface Props {
    id: string
    label: string
    value: string
    onValueChange?: () => void
    onCustomTagDoubleClick?: (tagName: string) => void
    currentRandomTagResolutions?: Record<string, string>
    testOverrideTag?: string
    disabled?: boolean
    parentTagType?: string // Add parent tag type for context menu logic
    onPinToggle?: (tagName: string, targetTag: string, shouldPin: boolean) => void
  }

  let {
    id,
    label,
    value = $bindable(),
    onValueChange,
    onCustomTagDoubleClick,
    currentRandomTagResolutions = {},
    testOverrideTag = '',
    disabled = false,
    parentTagType = '',
    onPinToggle
  }: Props = $props()

  let wildcardModel: TreeModel = $state(getWildcardModel())

  $effect(() => {
    $combinedTags
    wildcardModel = getWildcardModel()
  })

  function handleTextChange(newValue: string) {
    value = newValue
    onValueChange?.()
  }

  function handleKeydown(event: KeyboardEvent) {
    // Allow normal text editing - don't interfere with AutoCompleteTextarea's functionality
    // The AutoCompleteTextarea handles Tab/Enter for autocomplete, we don't need to override
  }

  function focusTextarea() {
    if (disabled) return
    const target = document.getElementById(id) as HTMLTextAreaElement | null
    if (!target) return
    target.focus()
    const cursor = target.value.length
    requestAnimationFrame(() => {
      target.setSelectionRange(cursor, cursor)
    })
  }
</script>

<div class={disabled ? 'pointer-events-none opacity-50' : ''}>
  <div class="mb-1 flex items-center justify-between">
    <label
      for={id}
      class="text-xs font-medium {disabled ? 'text-gray-400' : 'text-gray-700'} text-left"
      >{label}</label
    >
  </div>

  <div
    class="chip-display"
    role="button"
    tabindex={disabled ? -1 : 0}
    onclick={focusTextarea}
    onkeydown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        focusTextarea()
      }
    }}
  >
    <PlaceholderChipDisplay
      value={value}
      placeholder={m['tagInput.quickPlaceholder']()}
      model={wildcardModel}
      onChipDoubleClick={onCustomTagDoubleClick}
    />
  </div>

  <!-- Direct text editing with autocomplete -->
  <div class="mt-1">
    <AutoCompleteTextarea
      {id}
      bind:value
      placeholder={m['tagInput.quickPlaceholder']()}
      rows={3}
      class="w-full rounded border border-gray-200 p-2 text-sm focus:border-sky-500 focus:ring-sky-500"
      readonly={disabled}
      onValueChange={handleTextChange}
      onkeydown={handleKeydown}
    />
  </div>
</div>

<style>
  .chip-display {
    min-height: 3rem;
    padding: 0.5rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    background-color: #f9fafb;
    cursor: text;
    text-align: left;
    font-size: 0.875rem;
  }

  .chip-display:focus {
    outline: 2px solid #38bdf8;
    outline-offset: 1px;
  }

  .chip-display:focus:not(:focus-visible) {
    outline: none;
  }
</style>

<!-- Component for leaf node style tag editing (like TreeEdit) -->
<script lang="ts">
  import AutoCompleteTextarea from './AutoCompleteTextarea.svelte'
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

  // Initialize textarea value when value changes externally
  $effect(() => {
    // No conversion needed since we're working with strings directly
  })

  function handleTextChange(newValue: string) {
    value = newValue
    onValueChange?.()
  }

  function handleKeydown(event: KeyboardEvent) {
    // Allow normal text editing - don't interfere with AutoCompleteTextarea's functionality
    // The AutoCompleteTextarea handles Tab/Enter for autocomplete, we don't need to override
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
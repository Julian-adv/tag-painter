<!-- Component for individual tag input zone -->
<script lang="ts">
  import AutoCompleteTextarea from './AutoCompleteTextarea.svelte'
  import TagDisplay from './TagDisplay.svelte'
  import { isWildcardArray } from './stores/tagsStore'
  import type { CustomTag } from './types'

  interface Props {
    id: string
    label: string
    tags: CustomTag[]
    onTagsChange?: (removedTagName?: string) => void
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
    tags = $bindable(),
    onTagsChange,
    onCustomTagDoubleClick,
    currentRandomTagResolutions = {},
    testOverrideTag = '',
    disabled = false,
    parentTagType = '',
    onPinToggle
  }: Props = $props()

  let quickTagInput = $state('')

  function handleQuickTagChange(newValue: string) {
    quickTagInput = newValue
  }

  function addQuickTagToMain() {
    if (quickTagInput.trim()) {
      const tagName = quickTagInput.trim()
      const newTag: CustomTag = {
        name: tagName,
        tags: [tagName],
        // Determine type using wildcards.yaml: ArrayNode => 'random', otherwise 'regular'
        type: isWildcardArray(tagName) ? 'random' : 'regular'
      }
      tags = [...tags, newTag]
      quickTagInput = ''
      onTagsChange?.()
    }
  }

  function handleQuickTagKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      addQuickTagToMain()
    }
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
  <TagDisplay
    {id}
    bind:tags
    {onTagsChange}
    {onCustomTagDoubleClick}
    {currentRandomTagResolutions}
    {testOverrideTag}
    {disabled}
    {parentTagType}
    {onPinToggle}
  />

  <!-- Quick tag input with autocomplete -->
  <div class="mt-1">
    <AutoCompleteTextarea
      id={`${id}-quick`}
      bind:value={quickTagInput}
      placeholder="Type tags to add (press Enter to add)..."
      rows={1}
      class="w-full rounded border border-gray-200 p-1 text-sm focus:border-sky-500 focus:ring-sky-500"
      readonly={disabled}
      onValueChange={handleQuickTagChange}
      onkeydown={handleQuickTagKeydown}
    />
  </div>
</div>

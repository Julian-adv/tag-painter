<!-- Component for individual tag input zone -->
<script lang="ts">
  import AutoCompleteTextarea from './AutoCompleteTextarea.svelte'
  import TagDisplay from './TagDisplay.svelte'
  import { get } from 'svelte/store'
  import { promptsData } from './stores/promptsStore'
  import type { CustomTag } from './types'

  interface Props {
    id: string
    label: string
    tags: CustomTag[]
    onTagsChange?: () => void
    onCustomTagDoubleClick?: (tagName: string) => void
    onTagClick?: (tagName: string) => void
    currentRandomTagResolutions?: Record<string, string>
    testOverrideTag?: string
    disabled?: boolean
  }

  let { id, label, tags = $bindable(), onTagsChange, onCustomTagDoubleClick, onTagClick, currentRandomTagResolutions = {}, testOverrideTag = '', disabled = false }: Props = $props()

  let quickTagInput = $state('')

  function handleQuickTagChange(newValue: string) {
    quickTagInput = newValue
  }

  function addQuickTagToMain() {
    if (quickTagInput.trim()) {
      const tagName = quickTagInput.trim()
      const currentData = get(promptsData)
      const existingCustomTag = currentData.customTags[tagName]
      
      const newTag: CustomTag = {
        name: tagName,
        tags: [tagName],
        type: existingCustomTag ? existingCustomTag.type : 'regular'
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

<div class={disabled ? 'opacity-50 pointer-events-none' : ''}>
  <div class="flex items-center justify-between mb-1">
    <label for={id} class="text-xs font-medium {disabled ? 'text-gray-400' : 'text-gray-700'} text-left">{label}</label>
  </div>
  <TagDisplay {id} bind:tags {onTagsChange} {onCustomTagDoubleClick} {onTagClick} {currentRandomTagResolutions} {testOverrideTag} {disabled} />

  <!-- Quick tag input with autocomplete -->
  <div class="mt-1">
    <AutoCompleteTextarea
      id={`${id}-quick`}
      bind:value={quickTagInput}
      placeholder="Type tags to add (press Enter to add)..."
      rows={1}
      class="w-full p-1 border border-gray-200 rounded text-sm focus:ring-sky-500 focus:border-sky-500"
      readonly={disabled}
      onValueChange={handleQuickTagChange}
      onkeydown={handleQuickTagKeydown}
    />
  </div>

</div>

<!-- Component for individual tag input zone -->
<script lang="ts">
  import AutoCompleteTextarea from './AutoCompleteTextarea.svelte'
  import TagDisplay from './TagDisplay.svelte'
  import type { CustomTag } from './types'

  interface Props {
    id: string
    label: string
    tags: CustomTag[]
    onTagsChange?: () => void
    onCustomTagDoubleClick?: (tagName: string) => void
    currentRandomTagResolutions?: Record<string, string>
  }

  let { id, label, tags = $bindable(), onTagsChange, onCustomTagDoubleClick, currentRandomTagResolutions = {} }: Props = $props()

  let quickTagInput = $state('')

  function handleQuickTagChange(newValue: string) {
    quickTagInput = newValue
  }

  function addQuickTagToMain() {
    if (quickTagInput.trim()) {
      const newTag: CustomTag = {
        name: quickTagInput.trim(),
        tags: [quickTagInput.trim()],
        type: 'regular'
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

<div>
  <div class="flex items-center justify-between mb-1">
    <label for={id} class="text-xs font-medium text-gray-700 text-left">{label}</label>
  </div>
  <TagDisplay {id} bind:tags {onTagsChange} {onCustomTagDoubleClick} {currentRandomTagResolutions} />

  <!-- Quick tag input with autocomplete -->
  <div class="mt-1">
    <AutoCompleteTextarea
      id={`${id}-quick`}
      bind:value={quickTagInput}
      placeholder="Type tags to add (press Enter to add)..."
      rows={1}
      class="w-full p-1 border border-gray-200 rounded text-sm focus:ring-sky-500 focus:border-sky-500"
      onValueChange={handleQuickTagChange}
      onkeydown={handleQuickTagKeydown}
    />
  </div>

</div>

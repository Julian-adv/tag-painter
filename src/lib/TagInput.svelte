<!-- Component for individual tag input zone -->
<script lang="ts">
  import AutoCompleteTextarea from './AutoCompleteTextarea.svelte'
  import TagDisplay from './TagDisplay.svelte'

  interface Props {
    id: string
    label: string
    placeholder: string
    tags: string[]
    onTagsChange?: () => void
  }

  let { id, label, placeholder, tags = $bindable(), onTagsChange }: Props = $props()

  let quickTagInput = $state('')

  function handleQuickTagChange(newValue: string) {
    quickTagInput = newValue
  }

  function addQuickTagToMain() {
    if (quickTagInput.trim()) {
      tags = [...tags, quickTagInput.trim()]
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
  <label for={id} class="block text-xs font-medium text-gray-700 mb-1 text-left">{label}</label>
  <TagDisplay {id} bind:tags {placeholder} {onTagsChange} />

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

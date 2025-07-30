<!-- Component for individual tag input zone -->
<script lang="ts">
  import AutoCompleteTextarea from './AutoCompleteTextarea.svelte'
  import TagDisplay from './TagDisplay.svelte'
  import TagManageDialog from './TagManageDialog.svelte'
  import { Plus } from 'svelte-heros-v2'

  interface Props {
    id: string
    label: string
    placeholder: string
    tags: string[]
    onTagsChange?: () => void
  }

  let { id, label, placeholder, tags = $bindable(), onTagsChange }: Props = $props()

  let quickTagInput = $state('')
  let showDialog = $state(false)

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

  function openDialog() {
    showDialog = true
  }

  function handleDialogSave(newTags: string[]) {
    tags = newTags
    onTagsChange?.()
  }

  function handleDialogCancel() {
    // No action needed, dialog will close
  }
</script>

<div>
  <div class="flex items-center justify-between mb-1">
    <label for={id} class="text-xs font-medium text-gray-700 text-left">{label}</label>
    <button
      type="button"
      onclick={openDialog}
      class="w-5 h-5 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1 transition-colors flex items-center justify-center"
      title="Manage tags"
    >
      <Plus class="w-3 h-3" />
    </button>
  </div>
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

  <!-- Tag management dialog -->
  <TagManageDialog
    bind:isOpen={showDialog}
    title="Manage Custom Tags"
    {tags}
    onSave={handleDialogSave}
    onCancel={handleDialogCancel}
  />
</div>

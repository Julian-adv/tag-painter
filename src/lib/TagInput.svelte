<!-- Component for individual tag input zone -->
<script lang="ts">
  import AutoCompleteTextarea from './AutoCompleteTextarea.svelte'
  import TagDisplay from './TagDisplay.svelte'
  import TagManageDialog from './TagManageDialog.svelte'
  import { Plus } from 'svelte-heros-v2'
  import { promptsData } from './stores/promptsStore'
  import { get } from 'svelte/store'
  import type { CustomTag } from './types'

  interface Props {
    id: string
    label: string
    tags: CustomTag[]
    showPlusButton?: boolean
    onTagsChange?: () => void
    onCustomTagDoubleClick?: (tagName: string) => void
    currentRandomTagResolutions?: Record<string, string>
  }

  let { id, label, tags = $bindable(), showPlusButton = true, onTagsChange, onCustomTagDoubleClick, currentRandomTagResolutions = {} }: Props = $props()

  let quickTagInput = $state('')
  let showDialog = $state(false)

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

  function openDialog() {
    showDialog = true
  }

  async function handleDialogSave(customTagName: string, originalTags: string[]) {
    // New custom tag was created
    // Remove individual tags that are now part of the custom tag from current tags
    const filteredTags = tags.filter((tag) => !originalTags.includes(tag.name))
    
    // Get the newly created custom tag from the store
    const currentData = get(promptsData)
    const newCustomTag = currentData.customTags[customTagName]
    
    if (newCustomTag) {
      // Add the new custom tag
      tags = [...filteredTags, newCustomTag]
      onTagsChange?.()
    }
  }

  function handleDialogCancel() {
    // No action needed, dialog will close
  }
</script>

<div>
  <div class="flex items-center justify-between mb-1">
    <label for={id} class="text-xs font-medium text-gray-700 text-left">{label}</label>
    {#if showPlusButton}
      <button
        type="button"
        onclick={openDialog}
        class="w-5 h-5 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1 transition-colors flex items-center justify-center"
        title="Manage tags"
      >
        <Plus class="w-3 h-3" />
      </button>
    {/if}
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

  <!-- Tag management dialog -->
  <TagManageDialog
    bind:isOpen={showDialog}
    title="Manage Custom Tags"
    {tags}
    onSave={handleDialogSave}
    onCancel={handleDialogCancel}
  />
</div>

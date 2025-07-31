<!-- Component for displaying tags as boxes with delete functionality -->
<script lang="ts">
  import { XMark } from 'svelte-heros-v2'
  import { isCustomTag } from './stores/tagsStore'
  import { promptsData } from './stores/promptsStore'
  import { get } from 'svelte/store'

  interface Props {
    id: string
    tags: string[]
    placeholder?: string
    readonly?: boolean
    onTagsChange?: () => void
    onCustomTagDoubleClick?: (tagName: string) => void
  }

  let {
    id,
    tags = $bindable(),
    placeholder = '',
    readonly = false,
    onTagsChange,
    onCustomTagDoubleClick
  }: Props = $props()

  function removeTag(tagToRemove: string) {
    if (readonly) return

    tags = tags.filter((tag) => tag !== tagToRemove)
    onTagsChange?.()
  }

  function handleKeydown(event: KeyboardEvent) {
    // Allow focus navigation with Tab
    if (event.key === 'Tab') {
      return
    }
  }

  function handleTagDoubleClick(tag: string) {
    if (isCustomTag(tag) && onCustomTagDoubleClick) {
      onCustomTagDoubleClick(tag)
    }
  }

  function handleTagKeydown(event: KeyboardEvent, tag: string) {
    if (isCustomTag(tag) && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      handleTagDoubleClick(tag)
    }
  }

  function getCustomTagContent(tagName: string): string {
    if (!isCustomTag(tagName)) return ''

    const currentData = get(promptsData)
    const tagContent = currentData.customTags[tagName]

    if (!tagContent || tagContent.length === 0) {
      return 'Empty custom tag'
    }

    // Show first few tags with ellipsis if there are many
    const maxTags = 50
    if (tagContent.length <= maxTags) {
      return tagContent.join(', ')
    } else {
      return `${tagContent.slice(0, maxTags).join(', ')}... (${tagContent.length} tags total)`
    }
  }
</script>

<div
  {id}
  class="w-full min-h-[6rem] p-1 border border-gray-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-sky-500 focus-within:border-sky-500 {readonly
    ? 'bg-gray-50'
    : ''}"
  tabindex="0"
  role="textbox"
  aria-label={placeholder}
  onkeydown={handleKeydown}
>
  {#if tags.length > 0}
    <div class="flex flex-wrap gap-1 text-left">
      {#each tags as tag (tag)}
        <div
          class="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-md text-sm {isCustomTag(tag)
            ? 'bg-pink-100 text-pink-800'
            : 'bg-sky-100 text-sky-800'}"
        >
          {#if isCustomTag(tag)}
            <button
              type="button"
              class="text-left cursor-pointer bg-transparent border-none p-0 font-inherit text-inherit focus:outline-none"
              ondblclick={() => handleTagDoubleClick(tag)}
              onkeydown={(e) => handleTagKeydown(e, tag)}
              title={getCustomTagContent(tag)}
              aria-label={`Edit custom tag ${tag}`}
            >
              {tag}
            </button>
          {:else}
            <span class="text-left">
              {tag}
            </span>
          {/if}
          {#if !readonly}
            <button
              type="button"
              class="rounded-full w-4 h-4 inline-flex items-center justify-center {isCustomTag(tag)
                ? 'text-pink-600 hover:text-pink-800 hover:bg-pink-200'
                : 'text-sky-600 hover:text-sky-800 hover:bg-sky-200'}"
              onclick={() => removeTag(tag)}
              aria-label="Remove {tag}"
            >
              <XMark class="w-3 h-3" />
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="text-gray-400 text-sm italic">
      {placeholder}
    </div>
  {/if}
</div>

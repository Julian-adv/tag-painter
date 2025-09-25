<!-- Component for leaf node style tag editing (like TreeEdit) -->
<script lang="ts">
  import PlaceholderChipEditor from './PlaceholderChipEditor.svelte'
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
</script>

<div class={disabled ? 'pointer-events-none opacity-50' : ''}>
  <div class="mb-1 flex items-center justify-between">
    <label
      for={id}
      class="text-xs font-medium {disabled ? 'text-gray-400' : 'text-gray-700'} text-left"
      >{label}</label
    >
  </div>

  <PlaceholderChipEditor
    {id}
    bind:value
    placeholder={m['tagInput.quickPlaceholder']()}
    model={wildcardModel}
    disabled={disabled}
    onValueChange={handleTextChange}
    onChipDoubleClick={(tagName) => onCustomTagDoubleClick?.(tagName)}
  />
</div>

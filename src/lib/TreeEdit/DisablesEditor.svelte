<script lang="ts">
  import AutoCompleteTextarea from '../AutoCompleteTextarea.svelte'

  interface Props {
    items: string[]
    suggestions: string[]
    onAdd: (item: string) => void
    onRemove: (item: string) => void
    inputId?: string
  }

  let {
    items,
    suggestions,
    onAdd,
    onRemove,
    inputId = 'disables-input'
  }: Props = $props()

  let newItem: string = $state('')

  function addItem() {
    const value = newItem.trim()
    if (!value) return
    if (!items.includes(value)) {
      onAdd(value)
    }
    newItem = ''
  }
</script>

<div class="directive-multiedit">
  <div class="chips">
    {#each items as item (item)}
      <span class="chip" aria-label={`Disable ${item}`}>
        <span class="chip-label">{item}</span>
        <button class="chip-remove" title={`Remove ${item}`} onclick={() => onRemove(item)}>
          ×
        </button>
      </span>
    {/each}
  </div>
  <div class="adder">
    <div class="w-full min-w-[220px] max-w-[360px]">
      <AutoCompleteTextarea
        id={inputId}
        value={newItem}
        placeholder="Add disable (name or pattern)"
        onValueChange={(v) => (newItem = v)}
        onkeydown={(e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            addItem()
          }
        }}
        specialSuggestions={suggestions}
        specialTriggerPrefix=""
      />
    </div>
    <button class="add-btn" type="button" onclick={addItem} title="Add disable">
      Add
    </button>
  </div>
  
</div>

<style>
  .directive-multiedit {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    align-items: flex-start;
    flex: 1;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.375rem 0.125rem 0.5rem;
    border-radius: 9999px;
    background: #eef2ff;
    color: #4338ca;
    border: 1px solid #c7d2fe;
  }
  .chip-label {
    font-size: 0.75rem;
    line-height: 1rem;
    font-weight: 500;
  }
  .chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    border-radius: 9999px;
    background: transparent;
    color: #4f46e5;
    border: none;
    cursor: pointer;
  }
  .chip-remove:hover { background: #e0e7ff; }
  .adder {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
  }
  
  .add-btn {
    font-size: 0.875rem;
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;
    background: #d1fae5;
    color: #065f46;
    border: 1px solid #a7f3d0;
    cursor: pointer;
  }
  .add-btn:hover { background: #a7f3d0; }
</style>

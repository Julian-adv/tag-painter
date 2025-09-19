<script lang="ts">
  import { tick } from 'svelte'
  import { m } from '$lib/paraglide/messages'

  let { filterText = $bindable('') }: { filterText: string } = $props()

  function clear() {
    filterText = ''
    // Ensure any parent scrolling that relies on filter clearing can happen next tick
    tick()
  }
</script>

<div class="filter-container">
  <input
    type="text"
    class="filter-input"
    placeholder={m['treeEdit.filterPlaceholder']()}
    bind:value={filterText}
    onkeydown={(e) => e.stopPropagation()}
  />
  {#if filterText}
    <button
      type="button"
      class="filter-clear"
      onclick={clear}
      aria-label={m['treeEdit.filterClear']()}
    >
      ×
    </button>
  {/if}
</div>

<style>
  .filter-container {
    position: relative;
    margin: 0.5rem 0.5rem 0 0.5rem;
  }
  .filter-input {
    width: 100%;
    padding: 0.5rem;
    padding-right: 2rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background-color: white;
    color: #374151;
  }
  .filter-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 1px #3b82f6;
  }
  .filter-clear {
    position: absolute;
    right: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: #6b7280;
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0;
    width: 1.5rem;
    height: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.25rem;
  }
  .filter-clear:hover {
    color: #374151;
    background-color: #f3f4f6;
  }
</style>

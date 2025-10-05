<script lang="ts">
  interface Props {
    id?: string
    value: string
    options: { value: string; label: string }[]
    onchange?: (value: string) => void
    class?: string
  }

  let { id, value = $bindable(), options, onchange, class: className = '' }: Props = $props()

  let isOpen = $state(false)
  let selectElement: HTMLDivElement

  function toggleDropdown(event: MouseEvent) {
    event.stopPropagation()
    isOpen = !isOpen
  }

  function selectOption(optionValue: string) {
    value = optionValue
    isOpen = false
    if (onchange) {
      onchange(optionValue)
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      isOpen = false
    }
  }

  $effect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (selectElement && !selectElement.contains(event.target as Node)) {
        isOpen = false
      }
    }

    if (isOpen) {
      document.addEventListener('click', handleClickOutside, true)
      document.addEventListener('keydown', handleKeydown)

      return () => {
        document.removeEventListener('click', handleClickOutside, true)
        document.removeEventListener('keydown', handleKeydown)
      }
    }
  })

  function getSelectedLabel(): string {
    const selected = options.find((opt) => opt.value === value)
    return selected ? selected.label : ''
  }
</script>

<div class="custom-select {className}" bind:this={selectElement} {id}>
  <button
    type="button"
    class="select-trigger"
    onclick={(e) => toggleDropdown(e)}
    aria-expanded={isOpen}
  >
    <span class="select-value">{getSelectedLabel()}</span>
    <span class="select-arrow" class:open={isOpen}>▼</span>
  </button>

  {#if isOpen}
    <div class="select-dropdown">
      {#each options as option (option.value)}
        <button
          type="button"
          class="select-option"
          class:selected={option.value === value}
          onclick={() => selectOption(option.value)}
        >
          {option.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .custom-select {
    position: relative;
    width: 100%;
  }

  .select-trigger {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    transition: border-color 0.2s;
  }

  .select-trigger:hover {
    border-color: #bbb;
  }

  .select-trigger:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }

  .select-value {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .select-arrow {
    margin-left: 8px;
    font-size: 10px;
    transition: transform 0.2s;
    color: #666;
  }

  .select-arrow.open {
    transform: rotate(180deg);
  }

  .select-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: white;
    border: 2px solid #999;
    border-radius: 4px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    max-height: 300px;
    overflow-y: auto;
    z-index: 10000;
  }

  .select-option {
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: white;
    text-align: left;
    cursor: pointer;
    font-size: 13px;
    transition: background-color 0.15s;
  }

  .select-option:hover {
    background: #f0f0f0;
  }

  .select-option.selected {
    background: #e3f2fd;
    font-weight: 500;
  }

  .select-option:focus {
    outline: none;
    background: #f0f0f0;
  }

  /* Thin scrollbar for dropdown */
  .select-dropdown::-webkit-scrollbar {
    width: 6px;
  }

  .select-dropdown::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 3px;
  }

  .select-dropdown::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 3px;
  }

  .select-dropdown::-webkit-scrollbar-thumb:hover {
    background: #555;
  }
</style>

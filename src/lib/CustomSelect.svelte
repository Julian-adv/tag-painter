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
  let triggerElement: HTMLButtonElement
  let dropdownElement: HTMLDivElement
  let dropdownPosition = $state({ top: 0, left: 0, width: 0 })

  function toggleDropdown(event: MouseEvent) {
    event.stopPropagation()
    if (!isOpen && triggerElement) {
      const rect = triggerElement.getBoundingClientRect()
      dropdownPosition = {
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width
      }
    }
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

    function handleScroll(event: Event) {
      // Don't close if scrolling inside the dropdown itself
      if (dropdownElement && dropdownElement.contains(event.target as Node)) {
        return
      }
      isOpen = false
    }

    if (isOpen) {
      document.addEventListener('click', handleClickOutside, true)
      document.addEventListener('keydown', handleKeydown)
      window.addEventListener('scroll', handleScroll, true)

      return () => {
        document.removeEventListener('click', handleClickOutside, true)
        document.removeEventListener('keydown', handleKeydown)
        window.removeEventListener('scroll', handleScroll, true)
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
    bind:this={triggerElement}
    onclick={(e) => toggleDropdown(e)}
    aria-expanded={isOpen}
  >
    <span class="select-value">{getSelectedLabel()}</span>
    <span class="select-arrow" class:open={isOpen}>▼</span>
  </button>
</div>

{#if isOpen}
  <div
    bind:this={dropdownElement}
    class="select-dropdown"
    style="top: {dropdownPosition.top}px; left: {dropdownPosition.left}px; min-width: {dropdownPosition.width}px;"
  >
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
    position: fixed;
    background: white;
    border: 2px solid #999;
    border-radius: 4px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    max-height: 300px;
    overflow-y: auto;
    overflow-x: hidden;
    z-index: 10000;
    width: max-content;
  }

  .select-option {
    width: 100%;
    padding: 6px 12px;
    border: none;
    background: white;
    text-align: left;
    cursor: pointer;
    font-size: 13px;
    transition: background-color 0.15s;
    white-space: nowrap;
    display: block;
    box-sizing: border-box;
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

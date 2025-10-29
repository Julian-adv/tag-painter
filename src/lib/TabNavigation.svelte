<script lang="ts">
  type Tab = {
    id: string
    label: string
  }

  type Props = {
    tabs: Tab[]
    activeTabId?: string
    onTabChange?: (tabId: string) => void
  }

  let { tabs, activeTabId = $bindable(tabs[0]?.id || ''), onTabChange }: Props = $props()

  function handleTabClick(tabId: string) {
    activeTabId = tabId
    onTabChange?.(tabId)
  }
</script>

<div class="flex border-b border-gray-300 bg-white">
  {#each tabs as tab (tab.id)}
    <button
      type="button"
      class="px-4 py-2 text-sm font-medium transition {activeTabId === tab.id
        ? 'border-b-2 border-blue-500 text-blue-600'
        : 'text-gray-600 hover:text-gray-900'}"
      onclick={() => handleTabClick(tab.id)}
    >
      {tab.label}
    </button>
  {/each}
</div>

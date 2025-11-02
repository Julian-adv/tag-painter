<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte'

  type CharacterItem = {
    filename: string
    path: string
    name: string
    size: number
  }

  export let isOpen = false

  const dispatch = createEventDispatcher<{ select: { item: CharacterItem } }>()

  let items: CharacterItem[] = []
  let loading = false
  let error = ''
  let newName = ''
  let newFile: File | null = null

  async function fetchList() {
    loading = true
    error = ''
    try {
      const res = await fetch('/api/characters')
      const data = await res.json()
      items = Array.isArray(data?.characters) ? data.characters : []
    } catch (e) {
      error = 'Failed to load characters.'
    } finally {
      loading = false
    }
  }

  async function move(idx: number, dir: -1 | 1) {
    const j = idx + dir
    if (j < 0 || j >= items.length) return
    const copy = items.slice()
    ;[copy[idx], copy[j]] = [copy[j], copy[idx]]
    items = copy
    await saveOrder()
  }

  async function saveOrder() {
    await fetch('/api/characters/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: items.map((i) => i.filename) })
    })
  }

  function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement
    newFile = input.files && input.files[0] ? input.files[0] : null
  }

  function abToBase64(ab: ArrayBuffer): string {
    let binary = ''
    const bytes = new Uint8Array(ab)
    const len = bytes.byteLength
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
  }

  async function createNew() {
    if (!newName || !newFile) return
    const ab = await newFile.arrayBuffer()
    const jpegBase64 = abToBase64(ab)
    const res = await fetch('/api/characters/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, jpegBase64 })
    })
    if (res.ok) {
      newName = ''
      newFile = null
      await fetchList()
    }
  }

  async function remove(item: CharacterItem) {
    if (!confirm(`Delete ${item.name}?`)) return
    const res = await fetch('/api/characters/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: item.filename })
    })
    if (res.ok) {
      await fetchList()
    }
  }

  onMount(() => {
    if (isOpen) void fetchList()
  })

  $effect(() => {
    if (isOpen) void fetchList()
  })
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
    <div class="max-h-[80vh] w-[820px] overflow-auto rounded-md bg-white p-3 shadow">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-base font-semibold">Characters</h2>
        <button class="rounded border px-2 py-1 text-sm" onclick={() => (isOpen = false)}>
          Close
        </button>
      </div>

      <div class="mb-3 grid grid-cols-[1fr_auto] items-end gap-2">
        <div class="grid grid-cols-2 gap-2">
          <div class="flex flex-col">
            <label class="text-xs text-gray-600">Name</label>
            <input class="rounded border p-1 text-sm" bind:value={newName} placeholder="Name" />
          </div>
          <div class="flex flex-col">
            <label class="text-xs text-gray-600">JPEG</label>
            <input class="rounded border p-1 text-sm" type="file" accept="image/jpeg,image/jpg" on:change={onFileChange} />
          </div>
        </div>
        <button class="rounded bg-blue-600 px-3 py-1 text-sm text-white" onclick={createNew} disabled={!newName || !newFile}>
          New
        </button>
      </div>

      {#if loading}
        <div class="p-2 text-sm text-gray-500">Loading...</div>
      {:else if error}
        <div class="p-2 text-sm text-red-600">{error}</div>
      {:else}
        <div class="grid grid-cols-2 gap-2">
          {#each items as item, i (item.filename)}
            <div class="flex items-center gap-2 rounded border p-2">
              <img src={`/api/image?path=${encodeURIComponent(item.path)}`} alt={item.name} class="h-12 w-12 rounded object-cover" />
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium">{item.name}</div>
                <div class="text-xs text-gray-500">{item.filename}</div>
              </div>
              <div class="flex flex-col gap-1">
                <button class="rounded border px-2 py-1 text-xs" onclick={() => dispatch('select', { item })}>Select</button>
                <button class="rounded border px-2 py-1 text-xs" onclick={() => remove(item)}>Delete</button>
                <div class="flex gap-1">
                  <button class="rounded border px-2 py-0 text-xs" onclick={() => move(i, -1)}>↑</button>
                  <button class="rounded border px-2 py-0 text-xs" onclick={() => move(i, 1)}>↓</button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .fixed {
    position: fixed;
  }
</style>

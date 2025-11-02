<script lang="ts">
  import { onMount } from 'svelte'
  import { Trash, CheckCircle } from 'svelte-heros-v2'

  type CharacterItem = {
    filename: string
    path: string
    name: string
    size: number
  }

  type CharacterCard = {
    spec: string
    spec_version: string
    data: {
      name: string
      description?: string
      personality?: string
      scenario?: string
      first_mes?: string
      mes_example?: string
      creator_notes?: string
      system_prompt?: string
      post_history_instructions?: string
      alternate_greetings?: string[]
      tags?: string[]
      creator?: string
      character_version?: string
      [key: string]: unknown
    }
  }

  interface Props {
    isOpen: boolean
    selectedCharacterFilename?: string
    onSelect?: (payload: { item: CharacterItem }) => void
    onShowToast?: (message: string, type?: 'success' | 'error') => void
  }
  let {
    isOpen = $bindable(false),
    selectedCharacterFilename,
    onSelect,
    onShowToast
  }: Props = $props()

  // use callback prop instead of deprecated createEventDispatcher

  let items = $state<CharacterItem[]>([])
  let loading = $state(false)
  let error = $state('')
  let draggedIndex = $state<number | null>(null)
  let dragOverIndex = $state<number | null>(null)
  let selectedItem = $state<CharacterItem | null>(null)
  let selectedCard = $state<CharacterCard | null>(null)
  let loadingCard = $state(false)
  let editedCard = $state<CharacterCard | null>(null)
  let savingCard = $state(false)
  let isNewCharacter = $state(false)

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

  function handleDragStart(e: DragEvent, index: number) {
    draggedIndex = index
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
    }
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move'
    }
    dragOverIndex = index
  }

  function handleDragLeave() {
    dragOverIndex = null
  }

  async function handleDrop(e: DragEvent, dropIndex: number) {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === dropIndex) {
      draggedIndex = null
      dragOverIndex = null
      return
    }

    const copy = items.slice()
    const [draggedItem] = copy.splice(draggedIndex, 1)
    copy.splice(dropIndex, 0, draggedItem)
    items = copy
    draggedIndex = null
    dragOverIndex = null
    await saveOrder()
  }

  function handleDragEnd() {
    draggedIndex = null
    dragOverIndex = null
  }

  async function saveOrder() {
    await fetch('/api/characters/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: items.map((i) => i.filename) })
    })
  }

  function createNewCharacter() {
    // Create empty card in memory only
    const emptyCard: CharacterCard = {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {
        name: '',
        description: '',
        personality: '',
        scenario: '',
        first_mes: '',
        mes_example: '',
        creator_notes: '',
        system_prompt: '',
        post_history_instructions: '',
        tags: [],
        creator: '',
        character_version: '1.0'
      }
    }

    // Create a temporary item for display
    selectedItem = {
      filename: 'new_character.jpeg', // temporary, will be replaced on save
      path: '',
      name: 'New Character',
      size: 0
    }
    selectedCard = emptyCard
    editedCard = JSON.parse(JSON.stringify(emptyCard))
    isNewCharacter = true
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
    if (isOpen) {
      void fetchList()
      selectedItem = null
    }
  })

  // Select the character when dialog opens if there's a selected character
  $effect(() => {
    if (isOpen && selectedCharacterFilename && items.length > 0) {
      const matchedItem = items.find((item) => item.filename === selectedCharacterFilename)
      if (matchedItem) {
        selectedItem = matchedItem
        void fetchCardInfo(matchedItem.filename)
      }
    }
  })

  async function fetchCardInfo(filename: string) {
    loadingCard = true
    selectedCard = null
    editedCard = null
    try {
      const res = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      })
      const data = await res.json()
      selectedCard = data.card
      editedCard = JSON.parse(JSON.stringify(data.card)) // Deep clone for editing
    } catch (e) {
      console.error('Failed to load character card:', e)
    } finally {
      loadingCard = false
    }
  }

  function handleCardClick(item: CharacterItem) {
    selectedItem = item
    isNewCharacter = false
    void fetchCardInfo(item.filename)
  }

  async function saveCardChanges() {
    if (!selectedItem || !editedCard) return
    if (!editedCard.data.name || !editedCard.data.name.trim()) {
      onShowToast?.('Name is required', 'error')
      return
    }

    savingCard = true
    try {
      if (isNewCharacter) {
        // Create new character file
        const res = await fetch('/api/characters/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: editedCard.data.name,
            card: editedCard
          })
        })
        const data = await res.json()
        if (res.ok && data.filename) {
          selectedCard = JSON.parse(JSON.stringify(editedCard))
          isNewCharacter = false
          await fetchList()
          // Select the newly created item
          const newItem = items.find((item) => item.filename === data.filename)
          if (newItem) {
            selectedItem = newItem
          }
          onShowToast?.('Character created successfully!', 'success')
        } else {
          onShowToast?.('Failed to create character', 'error')
        }
      } else {
        // Update existing character
        const res = await fetch('/api/characters/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: selectedItem.filename,
            card: editedCard
          })
        })
        const data = await res.json()
        if (res.ok) {
          selectedCard = JSON.parse(JSON.stringify(editedCard))
          await fetchList()
          onShowToast?.('Character saved successfully!', 'success')
        } else {
          onShowToast?.('Failed to save character', 'error')
        }
      }
    } catch (e) {
      console.error('Failed to save character:', e)
      onShowToast?.('Failed to save character', 'error')
    } finally {
      savingCard = false
    }
  }

  const hasUnsavedChanges = $derived(
    editedCard && selectedCard && JSON.stringify(editedCard) !== JSON.stringify(selectedCard)
  )

  const canSave = $derived(
    editedCard &&
      editedCard.data.name &&
      editedCard.data.name.trim().length > 0 &&
      (hasUnsavedChanges || isNewCharacter)
  )

  function autoResize(textarea: HTMLTextAreaElement) {
    textarea.style.height = 'auto'
    const scrollHeight = textarea.scrollHeight
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight)
    const maxHeight = lineHeight * 15 // 15 lines max
    textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`
  }

  function handleTextareaInput(e: Event) {
    const textarea = e.target as HTMLTextAreaElement
    autoResize(textarea)
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div class="flex h-[80vh] w-[1100px] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
      <div class="flex items-center justify-between border-b border-gray-300 p-4">
        <h2 class="text-lg font-semibold text-gray-900">Characters</h2>
        <button
          class="flex h-7 w-7 items-center justify-center rounded-full text-2xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          onclick={() => (isOpen = false)}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div class="flex flex-1 overflow-hidden">
        <!-- Left: Character Grid -->
        <div class="flex w-[600px] flex-col border-r border-gray-200 p-4">
          {#if loading}
            <div class="p-2 text-sm text-gray-500">Loading...</div>
          {:else if error}
            <div class="p-2 text-sm text-red-600">{error}</div>
          {:else}
            <div class="flex-1 overflow-y-auto">
              <div class="grid grid-cols-4 gap-2">
                {#each items as item, i (item.filename)}
                  <div
                    role="button"
                    tabindex="0"
                    class="relative flex cursor-pointer flex-col items-center gap-2 rounded border p-2 transition-colors {selectedCharacterFilename ===
                    item.filename
                      ? 'border-green-500 bg-green-50'
                      : selectedItem?.filename === item.filename
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200'} {dragOverIndex === i
                      ? 'border-blue-300 bg-blue-50'
                      : selectedCharacterFilename !== item.filename &&
                          selectedItem?.filename !== item.filename
                        ? 'hover:border-gray-300 hover:bg-gray-50'
                        : ''}"
                    draggable="true"
                    ondragstart={(e) => handleDragStart(e, i)}
                    ondragover={(e) => handleDragOver(e, i)}
                    ondragleave={handleDragLeave}
                    ondrop={(e) => handleDrop(e, i)}
                    ondragend={handleDragEnd}
                    onclick={() => handleCardClick(item)}
                    onkeydown={(e) => e.key === 'Enter' && handleCardClick(item)}
                  >
                    {#if selectedCharacterFilename === item.filename}
                      <div class="absolute top-1 right-1 rounded-full bg-white p-0.5 shadow">
                        <CheckCircle class="h-5 w-5 text-green-600" />
                      </div>
                    {/if}
                    <img
                      src={`/api/image?path=${encodeURIComponent('character/' + item.filename)}`}
                      alt={item.name}
                      class="h-32 w-24 rounded object-cover"
                    />
                    <div class="w-full truncate text-center text-xs font-medium">{item.name}</div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <!-- Right: Detail Panel -->
        <div class="flex flex-1 flex-col overflow-hidden p-4">
          {#if selectedItem}
            <div class="flex h-full flex-col gap-4 overflow-hidden">
              <div class="flex items-start gap-4">
                <img
                  src={`/api/image?path=${encodeURIComponent('character/' + selectedItem.filename)}`}
                  alt={selectedItem.name}
                  class="h-64 w-48 flex-shrink-0 rounded object-cover"
                />
                <div class="flex-1 text-left">
                  {#if editedCard}
                    <div class="mb-2">
                      <input
                        type="text"
                        class="w-full rounded border border-gray-300 px-2 py-1 text-xl font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        bind:value={editedCard.data.name}
                        placeholder="Character Name"
                      />
                    </div>
                  {:else}
                    <h3 class="mb-2 text-xl font-semibold">{selectedItem.name}</h3>
                  {/if}
                  <div class="mb-4 space-y-1 text-sm text-gray-600">
                    <div><span class="font-medium">Filename:</span> {selectedItem.filename}</div>
                    <div>
                      <span class="font-medium">Size:</span>
                      {(selectedItem.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <div class="flex gap-2">
                    {#if selectedCharacterFilename === selectedItem.filename}
                      <button
                        class="rounded-md bg-gray-300 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-400 focus:ring-2 focus:ring-gray-400 focus:outline-none"
                        onclick={() => selectedItem && onSelect?.({ item: selectedItem })}
                      >
                        Unselect
                      </button>
                    {:else}
                      <button
                        class="rounded-md bg-blue-500 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        onclick={() => selectedItem && onSelect?.({ item: selectedItem })}
                      >
                        Select
                      </button>
                    {/if}
                    <button
                      class="flex items-center gap-2 rounded-md bg-red-100 px-4 py-2 text-sm text-red-700 transition-colors hover:bg-red-200 focus:ring-2 focus:ring-red-500 focus:outline-none"
                      onclick={() => selectedItem && remove(selectedItem)}
                      title="Delete character"
                    >
                      <Trash class="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              {#if loadingCard}
                <div class="flex items-center justify-center p-4 text-sm text-gray-500">
                  Loading character data...
                </div>
              {:else if editedCard}
                <div class="flex-1 overflow-y-auto">
                  <div class="space-y-4 text-left text-sm">
                    {#if editedCard.data.description !== undefined}
                      <div>
                        <h4 class="mb-1 font-semibold text-gray-900">Description</h4>
                        <textarea
                          class="w-full resize-none overflow-y-auto rounded border border-gray-300 p-2 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          rows="2"
                          bind:value={editedCard.data.description}
                          oninput={handleTextareaInput}
                          use:autoResize
                        ></textarea>
                      </div>
                    {/if}

                    {#if editedCard.data.personality !== undefined}
                      <div>
                        <h4 class="mb-1 font-semibold text-gray-900">Personality</h4>
                        <textarea
                          class="w-full resize-none overflow-y-auto rounded border border-gray-300 p-2 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          rows="2"
                          bind:value={editedCard.data.personality}
                          oninput={handleTextareaInput}
                          use:autoResize
                        ></textarea>
                      </div>
                    {/if}

                    {#if editedCard.data.scenario !== undefined}
                      <div>
                        <h4 class="mb-1 font-semibold text-gray-900">Scenario</h4>
                        <textarea
                          class="w-full resize-none overflow-y-auto rounded border border-gray-300 p-2 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          rows="2"
                          bind:value={editedCard.data.scenario}
                          oninput={handleTextareaInput}
                          use:autoResize
                        ></textarea>
                      </div>
                    {/if}

                    {#if editedCard.data.first_mes !== undefined}
                      <div>
                        <h4 class="mb-1 font-semibold text-gray-900">First Message</h4>
                        <textarea
                          class="w-full resize-none overflow-y-auto rounded border border-gray-300 p-2 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          rows="2"
                          bind:value={editedCard.data.first_mes}
                          oninput={handleTextareaInput}
                          use:autoResize
                        ></textarea>
                      </div>
                    {/if}

                    {#if editedCard.data.mes_example !== undefined}
                      <div>
                        <h4 class="mb-1 font-semibold text-gray-900">Message Examples</h4>
                        <textarea
                          class="w-full resize-none overflow-y-auto rounded border border-gray-300 p-2 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          rows="2"
                          bind:value={editedCard.data.mes_example}
                          oninput={handleTextareaInput}
                          use:autoResize
                        ></textarea>
                      </div>
                    {/if}

                    {#if editedCard.data.system_prompt !== undefined}
                      <div>
                        <h4 class="mb-1 font-semibold text-gray-900">System Prompt</h4>
                        <textarea
                          class="w-full resize-none overflow-y-auto rounded border border-gray-300 p-2 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          rows="2"
                          bind:value={editedCard.data.system_prompt}
                          oninput={handleTextareaInput}
                          use:autoResize
                        ></textarea>
                      </div>
                    {/if}

                    {#if editedCard.data.post_history_instructions !== undefined}
                      <div>
                        <h4 class="mb-1 font-semibold text-gray-900">Post-History Instructions</h4>
                        <textarea
                          class="w-full resize-none overflow-y-auto rounded border border-gray-300 p-2 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          rows="2"
                          bind:value={editedCard.data.post_history_instructions}
                          oninput={handleTextareaInput}
                          use:autoResize
                        ></textarea>
                      </div>
                    {/if}

                    {#if editedCard.data.tags && editedCard.data.tags.length > 0}
                      <div>
                        <h4 class="mb-1 font-semibold text-gray-900">Tags</h4>
                        <div class="flex flex-wrap gap-1">
                          {#each editedCard.data.tags as tag}
                            <span class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                              >{tag}</span
                            >
                          {/each}
                        </div>
                      </div>
                    {/if}

                    {#if editedCard.data.creator || editedCard.data.character_version}
                      <div class="space-y-1 text-xs text-gray-500">
                        {#if editedCard.data.creator}
                          <div>
                            <span class="font-medium">Creator:</span>
                            {editedCard.data.creator}
                          </div>
                        {/if}
                        {#if editedCard.data.character_version}
                          <div>
                            <span class="font-medium">Version:</span>
                            {editedCard.data.character_version}
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {:else}
            <div class="flex h-full items-center justify-center text-gray-400">
              Select a character to view details
            </div>
          {/if}
        </div>
      </div>

      <!-- Footer with New Character, Save and Close buttons -->
      <div class="flex items-center justify-between border-t border-gray-300 p-4">
        <button
          class="rounded-md bg-green-500 px-4 py-2 text-sm text-white transition-colors hover:bg-green-600 focus:ring-2 focus:ring-green-500 focus:outline-none"
          onclick={createNewCharacter}
        >
          New Character
        </button>
        <div class="flex gap-2">
          <button
            class="rounded-md bg-blue-500 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:cursor-default disabled:opacity-50"
            onclick={saveCardChanges}
            disabled={!canSave || savingCard}
          >
            {savingCard ? 'Saving...' : 'Save'}
          </button>
          <button
            class="rounded-md bg-gray-200 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-300 focus:ring-2 focus:ring-gray-500 focus:outline-none"
            onclick={() => (isOpen = false)}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

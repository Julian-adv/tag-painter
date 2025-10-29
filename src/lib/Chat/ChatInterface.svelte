<script lang="ts">
  type Message = {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
  }

  let messages = $state<Message[]>([])
  let inputMessage = $state('')
  let chatContainer: HTMLDivElement | undefined

  // Scroll to bottom when new messages arrive
  $effect(() => {
    if (messages.length > 0 && chatContainer) {
      setTimeout(() => {
        chatContainer?.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' })
      }, 100)
    }
  })

  function handleSendMessage() {
    const trimmed = inputMessage.trim()
    if (!trimmed) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date()
    }

    messages = [...messages, userMessage]
    inputMessage = ''
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSendMessage()
    }
  }
</script>

<div class="flex h-full flex-col bg-white">
  <!-- Chat messages area -->
  <div bind:this={chatContainer} class="flex-1 overflow-y-auto p-4" aria-live="polite">
    {#if messages.length === 0}
      <div class="flex h-full items-center justify-center text-gray-400">
        <p>Start a conversation...</p>
      </div>
    {:else}
      <div class="flex flex-col gap-4">
        {#each messages as message (message.id)}
          <div
            class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}"
          >
            <div
              class="max-w-[80%] rounded-lg p-3 {message.role === 'user'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-900'}"
            >
              <p class="whitespace-pre-wrap text-sm">{message.content}</p>
              <p class="mt-1 text-xs opacity-70">
                {message.timestamp.toLocaleTimeString()}
              </p>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Input area -->
  <div class="border-t border-gray-200 p-4">
    <div class="flex gap-2">
      <textarea
        bind:value={inputMessage}
        onkeydown={handleKeydown}
        placeholder="Type a message..."
        class="flex-1 resize-none rounded-lg border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
        rows="3"
      ></textarea>
      <button
        type="button"
        onclick={handleSendMessage}
        disabled={!inputMessage.trim()}
        class="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Send
      </button>
    </div>
  </div>
</div>

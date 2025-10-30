<script lang="ts">
  import { onMount } from 'svelte'

  interface Props {
    apiKey: string
    onGeneratePrompt?: (prompt: string) => void
  }

  type Message = {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
  }

  let { apiKey = '', onGeneratePrompt }: Props = $props()

  let messages = $state<Message[]>([])
  let inputMessage = $state('')
  let isLoading = $state(false)
  let errorMessage = $state('')
  let chatContainer: HTMLDivElement | undefined
  let systemPrompt = $state('')

  const GEMINI_MODEL_ID = 'gemini-2.5-pro'

  // Scroll to bottom when new messages arrive
  $effect(() => {
    if (messages.length > 0 && chatContainer) {
      setTimeout(() => {
        chatContainer?.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' })
      }, 100)
    }
  })

  function createId(): string {
    const globalCrypto =
      typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined
    if (globalCrypto?.randomUUID) {
      return globalCrypto.randomUUID()
    }
    if (globalCrypto?.getRandomValues) {
      const buffer = new Uint8Array(16)
      globalCrypto.getRandomValues(buffer)
      return Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('')
    }
    return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  onMount(async () => {
    try {
      const response = await fetch('/api/system-prompt')
      if (!response.ok) return
      const data: unknown = await response.json()
      const prompt = (data as { prompt?: string })?.prompt
      if (typeof prompt === 'string') {
        systemPrompt = prompt.trim()
      }
    } catch (error) {
      console.error('Failed to load system prompt', error)
    }
  })

  function toGeminiContents(history: Message[]) {
    return history.map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }]
    }))
  }

  function extractEnglishPrompt(text: string): string | null {
    const match = text.match(/<english>([\s\S]*?)<\/english>/i)
    if (!match) return null
    const prompt = match[1].trim()
    return prompt || null
  }

  function stripEnglishTags(text: string): string {
    return text.replace(/<english>([\s\S]*?)<\/english>/gi, (_match, inner) => inner.trim())
  }

  async function requestGemini(history: Message[], key: string): Promise<string> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_ID}:generateContent?key=${encodeURIComponent(
      key
    )}`

    const body = {
      contents: [
        ...(systemPrompt
          ? [
              {
                role: 'user',
                parts: [{ text: systemPrompt }]
              }
            ]
          : []),
        ...toGeminiContents(history)
      ]
    }
    console.log('Gemini request payload:', body)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new Error('Failed to parse Gemini response.')
    }

    const data: any = payload

    if (!response.ok) {
      const message =
        data && data.error && typeof data.error.message === 'string'
          ? data.error.message
          : 'Gemini request failed.'
      throw new Error(message)
    }

    const candidates = Array.isArray(data?.candidates) ? data.candidates : []
    const firstCandidate = candidates.length > 0 ? candidates[0] : undefined
    const parts = Array.isArray(firstCandidate?.content?.parts) ? firstCandidate.content.parts : []

    if (parts.length > 0) {
      const text = parts
        .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
        .join('')
        .trim()
      if (text) {
        return text
      }
    }

    if (typeof firstCandidate?.output_text === 'string' && firstCandidate.output_text.trim()) {
      return firstCandidate.output_text.trim()
    }

    if (typeof data?.text === 'string' && data.text.trim()) {
      return data.text.trim()
    }

    return ''
  }

  async function handleSendMessage(): Promise<void> {
    if (isLoading) return

    const trimmed = inputMessage.trim()
    if (!trimmed) return

    const userMessage: Message = {
      id: createId(),
      role: 'user',
      content: trimmed,
      timestamp: new Date()
    }

    const updatedMessages = [...messages, userMessage]
    messages = updatedMessages
    inputMessage = ''
    errorMessage = ''

    const trimmedKey = apiKey.trim()
    const conversation = [...updatedMessages]

    if (!trimmedKey) {
      const warning = 'Add your Gemini API key in Settings to enable chat.'
      errorMessage = warning
      const assistantMessage: Message = {
        id: createId(),
        role: 'assistant',
        content: warning,
        timestamp: new Date()
      }
      messages = [...conversation, assistantMessage]
      return
    }

    isLoading = true
    try {
      const replyText = await requestGemini(conversation, trimmedKey)
      const content = replyText || 'Gemini returned an empty response.'
      const extractedPrompt = extractEnglishPrompt(content)
      const stripped = stripEnglishTags(content).trim()
      const finalContent = stripped || content
      const assistantMessage: Message = {
        id: createId(),
        role: 'assistant',
        content: finalContent,
        timestamp: new Date()
      }
      messages = [...conversation, assistantMessage]
      if (extractedPrompt) {
        onGeneratePrompt?.(extractedPrompt)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to contact Gemini.'
      errorMessage = message
      const assistantMessage: Message = {
        id: createId(),
        role: 'assistant',
        content: `Error: ${message}`,
        timestamp: new Date()
      }
      messages = [...conversation, assistantMessage]
    } finally {
      isLoading = false
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.isComposing) return
    if (isLoading) return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSendMessage()
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
          <div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
            <div
              class="max-w-[80%] rounded-lg p-3 {message.role === 'user'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-900'}"
            >
              <p class="text-sm whitespace-pre-wrap">{message.content}</p>
              <p class="mt-1 text-xs opacity-70">
                {message.timestamp.toLocaleTimeString()}
              </p>
            </div>
          </div>
        {/each}
        {#if isLoading}
          <div class="flex justify-start">
            <div class="max-w-[80%] rounded-lg bg-gray-100 p-3 text-gray-900">
              <p class="text-sm">Thinking...</p>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Input area -->
  <div class="border-t border-gray-200 p-4">
    <div class="flex gap-2">
      <textarea
        bind:value={inputMessage}
        onkeydown={handleKeydown}
        oninput={() => (errorMessage = '')}
        placeholder="Type a message..."
        class="flex-1 resize-none rounded-lg border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
        rows="3"
        disabled={isLoading}
      ></textarea>
      <button
        type="button"
        onclick={handleSendMessage}
        disabled={!inputMessage.trim() || isLoading}
        class="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Send
      </button>
    </div>
    {#if errorMessage}
      <p class="mt-2 text-sm text-red-600">{errorMessage}</p>
    {/if}
  </div>
</div>

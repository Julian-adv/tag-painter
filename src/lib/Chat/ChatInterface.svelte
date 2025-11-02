<script lang="ts">
  import { onMount } from 'svelte'
  import { Cog8Tooth, ArrowPath } from 'svelte-heros-v2'
  import SettingsDialog from '$lib/SettingsDialog.svelte'
  import CharacterManagerDialog from './CharacterManagerDialog.svelte'
  import { getEffectiveModelSettings } from '$lib/generation/generationCommon'
  import { promptsData } from '$lib/stores/promptsStore'
  import type { Settings } from '$lib/types'

  interface Props {
    apiKey: string
    promptLanguage: 'english' | 'chinese'
    onGeneratePrompt?: (prompt: string, options?: { isRedraw?: boolean }) => void
    settings: Settings
    onSettingsChange?: (settings: Settings) => void
    onShowToast: (message: string) => void
  }

  type Message = {
    id: string
    role: 'user' | 'assistant'
    content: string
  }

  type GeminiContent = {
    role: 'model' | 'user' | 'assistant'
    parts: { text: string }[]
  }

  let {
    apiKey = '',
    promptLanguage = 'english',
    onGeneratePrompt,
    settings,
    onSettingsChange,
    onShowToast
  }: Props = $props()

  let messages = $state<Message[]>([])
  let inputMessage = $state('')
  let isLoading = $state(false)
  let errorMessage = $state('')
  let chatContainer: HTMLDivElement | undefined
  let showCharacterDialog = $state(false)
  let selectedCharacter: { name: string; path: string } | null = $state(null)
  let systemPrompt = $state<GeminiContent[]>([])
  let showSettings = $state(false)
  let lastLoadedPromptFile = $state('')
  let hasLoadedHistory = $state(false)
  let loadingPromptFile = $state('')
  let failedPromptFilename = $state<string | null>(null)

  const GEMINI_MODEL_ID = 'gemini-2.5-pro'

  let activeModelType = $derived.by(() => {
    const checkpoint = $promptsData.selectedCheckpoint || 'Default'
    const effectiveModel = getEffectiveModelSettings(settings, checkpoint)
    return effectiveModel?.modelType || 'sdxl'
  })

  let systemPromptFilename = $derived.by(() => {
    return activeModelType === 'qwen' ||
      activeModelType === 'chroma' ||
      activeModelType === 'flux1_krea'
      ? 'system_prompt.qwen.json'
      : 'system_prompt.sdxl.json'
  })

  let canResendLastMessage = $derived.by(() => {
    if (messages.length < 2) return false
    return (
      messages[messages.length - 1].role === 'assistant' &&
      messages[messages.length - 2].role === 'user'
    )
  })

  // Scroll to bottom when new messages arrive (instant, no smooth)
  $effect(() => {
    if (messages.length > 0 && chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight
    }
  })

  // Save chat history when messages change
  $effect(() => {
    if (messages.length > 0) {
      saveChatHistory()
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

  async function loadChatHistory() {
    try {
      const response = await fetch('/api/chat-history', { cache: 'no-store' })
      if (!response.ok) return
      const data: unknown = await response.json()
      const rawMessages = (data as { messages?: unknown })?.messages
      const loadedMessages: unknown[] = Array.isArray(rawMessages) ? rawMessages : []
      messages = loadedMessages.map((item) => {
        const entry = item as { id?: unknown; role?: unknown; content?: unknown }
        return {
          id: typeof entry.id === 'string' && entry.id ? entry.id : createId(),
          role: entry.role === 'assistant' ? 'assistant' : 'user',
          content: typeof entry.content === 'string' ? entry.content : ''
        }
      })
    } catch (error) {
      console.error('Failed to load chat history', error)
    } finally {
      hasLoadedHistory = true
    }
  }

  async function saveChatHistory() {
    try {
      await fetch('/api/chat-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
      })
    } catch (error) {
      console.error('Failed to save chat history', error)
    }
  }

  function notifyToastOnce(message: string, filename: string) {
    if (failedPromptFilename !== filename) {
      onShowToast(message)
    }
  }

  async function loadSystemPromptFile(jsonFilename: string, txtFilename: string) {
    try {
      const response = await fetch(`/api/wildcard-file?name=${encodeURIComponent(jsonFilename)}`)
      if (!response.ok) {
        notifyToastOnce('Failed to load system prompt.', jsonFilename)
        failedPromptFilename = jsonFilename
        systemPrompt = []
        return
      }
      if (loadingPromptFile !== jsonFilename) {
        return
      }

      const raw = await response.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch (parseError) {
        notifyToastOnce('Failed to parse system prompt JSON.', jsonFilename)
        failedPromptFilename = jsonFilename
        systemPrompt = []
        return
      }

      let promptEntries: GeminiContent[] = Array.isArray(parsed) ? (parsed as GeminiContent[]) : []

      let injectedText = ''
      let textLoadFailed = false
      try {
        const txtResponse = await fetch(
          `/api/wildcard-file?name=${encodeURIComponent(txtFilename)}`
        )
        if (txtResponse.ok) {
          injectedText = await txtResponse.text()
        } else {
          textLoadFailed = true
        }
      } catch (textError) {
        textLoadFailed = true
      }

      if (textLoadFailed) {
        notifyToastOnce(`Failed to load system prompt text file: ${txtFilename}`, jsonFilename)
        failedPromptFilename = jsonFilename
      }

      if (promptEntries.length === 0) {
        promptEntries = [{ role: 'model', parts: [{ text: injectedText }] }]
      } else {
        promptEntries[0] = { role: 'model', parts: [{ text: injectedText }] }
      }

      systemPrompt = promptEntries
      lastLoadedPromptFile = jsonFilename
      if (!textLoadFailed) {
        failedPromptFilename = null
      }
    } catch (error) {
      console.error('Failed to load system prompt', error)
      notifyToastOnce('Failed to load system prompt.', jsonFilename)
      failedPromptFilename = jsonFilename
      systemPrompt = []
    } finally {
      if (loadingPromptFile === jsonFilename) {
        loadingPromptFile = ''
      }
    }
  }

  $effect(() => {
    const jsonFilename = systemPromptFilename
    if (!jsonFilename) return
    if (failedPromptFilename && failedPromptFilename !== jsonFilename) {
      failedPromptFilename = null
    }
    if (jsonFilename === failedPromptFilename) return
    if (jsonFilename === lastLoadedPromptFile) return
    if (jsonFilename === loadingPromptFile) return
    const txtFilename = jsonFilename.replace(/\.json$/i, '.txt')
    loadingPromptFile = jsonFilename
    systemPrompt = []
    void loadSystemPromptFile(jsonFilename, txtFilename)
  })

  onMount(async () => {
    await loadChatHistory()
  })

  function toGeminiContents(history: Message[]) {
    return history.map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }]
    }))
  }

  function extractPrompt(text: string, language: 'english' | 'chinese'): string | null {
    const tag = language === 'chinese' ? 'chinese' : 'english'
    const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i')
    const match = text.match(regex)
    if (!match) return null
    const prompt = match[1].trim()
    return prompt || null
  }

  function removeUnusedLanguageTag(text: string, language: 'english' | 'chinese'): string {
    const unusedTag = language === 'chinese' ? 'english' : 'chinese'
    const regex = new RegExp(`<${unusedTag}>[\\s\\S]*?</${unusedTag}>`, 'gi')
    return text.replace(regex, '').trim()
  }

  async function requestGemini(history: Message[], key: string): Promise<string> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_ID}:generateContent?key=${encodeURIComponent(
      key
    )}`

    const body = {
      contents: [...systemPrompt, ...toGeminiContents(history)]
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
      content: trimmed
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
        content: warning
      }
      messages = [...conversation, assistantMessage]
      return
    }

    isLoading = true
    try {
      const replyText = await requestGemini(conversation, trimmedKey)
      const content = replyText || 'Gemini returned an empty response.'
      const extractedPrompt = extractPrompt(content, promptLanguage)
      const cleanedContent = removeUnusedLanguageTag(content, promptLanguage)
      const assistantMessage: Message = {
        id: createId(),
        role: 'assistant',
        content: cleanedContent
      }
      messages = [...conversation, assistantMessage]
      if (extractedPrompt) {
        onGeneratePrompt?.(extractedPrompt, { isRedraw: false })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to contact Gemini.'
      errorMessage = message
      const assistantMessage: Message = {
        id: createId(),
        role: 'assistant',
        content: `Error: ${message}`
      }
      messages = [...conversation, assistantMessage]
    } finally {
      isLoading = false
    }
  }

  async function handleResendLast(): Promise<void> {
    if (isLoading) return
    if (!canResendLastMessage) return

    const trimmedKey = apiKey.trim()
    if (!trimmedKey) {
      const warning = 'Add your Gemini API key in Settings to enable chat.'
      errorMessage = warning
      return
    }

    const lastAssistantIndex = messages.length - 1
    let lastUserIndex = -1
    for (let index = lastAssistantIndex - 1; index >= 0; index -= 1) {
      if (messages[index].role === 'user') {
        lastUserIndex = index
        break
      }
    }
    if (lastAssistantIndex < 0 || lastUserIndex === -1) return

    const updatedMessages = messages.slice(0, lastAssistantIndex)
    messages = updatedMessages
    errorMessage = ''
    isLoading = true

    const conversation = [...updatedMessages]

    try {
      const replyText = await requestGemini(conversation, trimmedKey)
      const content = replyText || 'Gemini returned an empty response.'
      const extractedPrompt = extractPrompt(content, promptLanguage)
      const cleanedContent = removeUnusedLanguageTag(content, promptLanguage)
      const assistantMessage: Message = {
        id: createId(),
        role: 'assistant',
        content: cleanedContent
      }
      messages = [...conversation, assistantMessage]
      if (extractedPrompt) {
        onGeneratePrompt?.(extractedPrompt, { isRedraw: false })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to contact Gemini.'
      errorMessage = message
      const assistantMessage: Message = {
        id: createId(),
        role: 'assistant',
        content: `Error: ${message}`
      }
      messages = [...conversation, assistantMessage]
    } finally {
      isLoading = false
    }
  }

  function findLatestPrompt(): string | null {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const candidate = messages[index]
      if (candidate.role === 'assistant') {
        const content = candidate.content ?? ''
        const prompt = extractPrompt(content, promptLanguage)
        if (prompt) {
          return prompt
        }
      }
    }
    return null
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.isComposing) return
    if (isLoading) return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSendMessage()
    }
  }

  function handleRedraw() {
    const latestPrompt = findLatestPrompt()
    if (!latestPrompt) return
    onGeneratePrompt?.(latestPrompt, { isRedraw: true })
  }

  function handleSettingsSave(newSettings: Settings) {
    onSettingsChange?.(newSettings)
    showSettings = false
  }
</script>

<div class="flex h-full flex-col bg-white">
  {#if selectedCharacter}
    <div class="flex items-center gap-2 border-b px-2 py-1">
      <img src={`/api/image?path=${encodeURIComponent(selectedCharacter.path)}`} alt={selectedCharacter.name} class="h-6 w-6 rounded object-cover" />
      <div class="text-xs text-gray-700">{selectedCharacter.name}</div>
    </div>
  {/if}
  <!-- Chat messages area -->
  <div bind:this={chatContainer} class="flex-1 overflow-y-auto p-1" aria-live="polite">
    {#if !hasLoadedHistory}
      <div class="flex h-full items-center justify-center text-gray-400">
        <p>Loading chat history...</p>
      </div>
    {:else if messages.length === 0}
      <div class="flex h-full items-center justify-center text-gray-400">
        <p>Start a conversation...</p>
      </div>
    {:else}
      <div class="flex flex-col gap-2">
        {#each messages as message (message.id)}
          <div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
            <div
              class="max-w-full rounded-lg p-2 text-left {message.role === 'user'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-900'}"
            >
              <p class="text-sm whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>
        {/each}
        {#if isLoading}
          <div class="flex justify-start">
            <div class="max-w-full rounded-lg bg-gray-100 p-2 text-gray-900">
              <p class="text-sm">Thinking...</p>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Input area -->
  <div class="p-1">
    <div class="flex flex-col gap-1">
      <textarea
        bind:value={inputMessage}
        onkeydown={handleKeydown}
        oninput={() => (errorMessage = '')}
        placeholder="Type a message..."
        class="w-full resize-none rounded-lg border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
        rows="3"
        disabled={isLoading}
      ></textarea>
      <div class="flex gap-1">
        <button
          type="button"
          onclick={() => {
            messages = []
          }}
          class="rounded-md border border-gray-300 bg-gray-100 px-4 py-1 text-sm font-medium text-gray-600 transition hover:bg-gray-200"
        >
          New
        </button>
        <button
          type="button"
          onclick={handleSendMessage}
          disabled={!inputMessage.trim() || isLoading}
          class="rounded-md border border-gray-300 bg-gray-100 px-4 py-1 text-sm font-medium text-gray-600 transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
        <button
          type="button"
          onclick={handleResendLast}
          disabled={!canResendLastMessage || isLoading}
          class="rounded-md border border-gray-300 bg-gray-100 px-4 py-1 text-sm font-medium text-gray-600 transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Resend
        </button>
        <button
          type="button"
          onclick={handleRedraw}
          disabled={!findLatestPrompt()}
          class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-gray-300 bg-gray-100 text-gray-600 transition-all duration-200 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Redraw"
        >
          <ArrowPath size="20" />
        </button>
        <button
          type="button"
          class="rounded-md border border-gray-300 bg-gray-100 px-4 py-1 text-sm font-medium text-gray-600 transition hover:bg-gray-200"
          onclick={() => (showCharacterDialog = true)}
        >
          Characters
        </button>
        <button
          type="button"
          onclick={() => (showSettings = !showSettings)}
          class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-gray-300 bg-gray-100 text-gray-600 transition-all duration-200 hover:bg-gray-200"
          aria-label="Settings"
        >
          <Cog8Tooth size="20" />
        </button>
      </div>
    </div>
    {#if errorMessage}
      <p class="mt-2 text-sm text-red-600">{errorMessage}</p>
    {/if}
  </div>
</div>

<CharacterManagerDialog
  bind:isOpen={showCharacterDialog}
  on:select={(e) => {
    selectedCharacter = { name: e.detail.item.name, path: e.detail.item.path }
    showCharacterDialog = false
  }}
/>

{#if settings}
  <SettingsDialog
    show={showSettings}
    {settings}
    initialFocus={null}
    onClose={() => (showSettings = false)}
    onSave={handleSettingsSave}
  />
{/if}

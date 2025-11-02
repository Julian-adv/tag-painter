<script lang="ts">
  import type { Toast } from '$lib/types'
  import { XMark } from 'svelte-heros-v2'
  let toasts: Toast[] = $state([])
  let counter = 0
  const AUTO_DISMISS_MS = 60000
  const SUCCESS_DISMISS_MS = 5000

  function push(message: string, type: Toast['type'], duration = AUTO_DISMISS_MS) {
    const id = ++counter
    toasts = [...toasts, { id, message, type }]
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id)
    }, duration)
  }

  function dismiss(id: number) {
    toasts = toasts.filter((t) => t.id !== id)
  }

  export function error(message: string) {
    push(message, 'error')
  }
  export function info(message: string) {
    push(message, 'info')
  }
  export function success(message: string) {
    push(message, 'success', SUCCESS_DISMISS_MS)
  }

  export function clear() {
    toasts = []
  }

  function bgClass(type?: string): string {
    if (type === 'error') return 'bg-red-600'
    if (type === 'success') return 'bg-green-600'
    return 'bg-gray-800'
  }
</script>

<div class="pointer-events-none fixed top-3 right-3 z-[100] flex flex-col gap-2">
  {#each toasts as t (t.id)}
    <div
      class={`pointer-events-auto relative max-w-[28rem] rounded-md px-3 py-2 text-sm text-white shadow-md shadow-black/20 ${bgClass(t.type)}`}
    >
      <div class="flex items-start gap-2">
        <div class="flex-1">
          {t.message}
        </div>
        <button
          type="button"
          class="-mr-1 inline-flex h-5 w-5 items-center justify-center self-center rounded text-white/80 hover:text-white focus:outline-none"
          aria-label="Close"
          onclick={() => dismiss(t.id)}
        >
          <XMark class="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  {/each}
</div>

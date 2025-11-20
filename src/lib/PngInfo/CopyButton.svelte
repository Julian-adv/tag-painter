<!-- Reusable copy-to-clipboard button component -->
<script lang="ts">
  import ClipboardDocument from 'svelte-heros-v2/ClipboardDocument.svelte'

  interface Props {
    text: string
  }

  let { text }: Props = $props()

  let isCopied = $state(false)

  async function copyToClipboard() {
    try {
      // Try using the modern clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
        isCopied = true
        setTimeout(() => {
          isCopied = false
        }, 300)
      } else {
        // Fallback for older browsers or insecure contexts
        const textArea = document.createElement('textarea')
        textArea.value = text
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        document.body.appendChild(textArea)
        textArea.select()
        try {
          document.execCommand('copy')
          isCopied = true
          setTimeout(() => {
            isCopied = false
          }, 300)
        } catch (fallbackErr) {
          console.error('Fallback copy failed:', fallbackErr)
          alert('Failed to copy to clipboard')
        }
        document.body.removeChild(textArea)
      }
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
      alert('Failed to copy to clipboard')
    }
  }
</script>

<button
  onclick={copyToClipboard}
  class="rounded p-1 {isCopied
    ? 'bg-green-500 text-white'
    : 'text-gray-600 hover:bg-gray-200 hover:text-gray-800'}"
  title={isCopied ? 'Copied!' : 'Copy to clipboard'}
>
  <ClipboardDocument class="h-4 w-4" />
</button>

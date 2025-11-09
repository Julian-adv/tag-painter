<!-- Component for displaying PNG metadata information -->
<script lang="ts">
  interface Props {
    metadata: Record<string, unknown> | null
  }

  let { metadata }: Props = $props()

  function formatMetadata(data: Record<string, unknown> | null): string {
    if (!data) {
      return 'No metadata available'
    }

    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return 'Failed to parse metadata'
    }
  }
</script>

<div class="flex h-full flex-col rounded-lg border border-gray-300 bg-white p-4 shadow-sm">
  <h2 class="mb-3 text-lg font-semibold text-gray-800">PNG Metadata</h2>
  <div class="flex-1 overflow-auto">
    <pre
      class="whitespace-pre-wrap break-words rounded bg-gray-50 p-3 font-mono text-sm text-gray-700">{formatMetadata(metadata)}</pre>
  </div>
</div>

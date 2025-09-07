<script lang="ts">
  import type { TreeModel } from './model'
  import { tick } from 'svelte'

  let {
    model,
    selectedIds,
    onSelectNode,
    onScrollToSelected
  }: {
    model: TreeModel
    selectedIds: string[]
    onSelectNode?: (nodeId: string) => void
    onScrollToSelected?: () => void
  } = $props()

  function getPathSegments(nodeId: string): { id: string; name: string }[] {
    const segments: { id: string; name: string }[] = []
    let current = model.nodes[nodeId]
    const selectedNode = current

    while (current && current.parentId) {
      segments.unshift({ id: current.id, name: current.name })
      current = model.nodes[current.parentId]
    }

    // Remove 'root' if it's the first segment
    if (segments.length > 0 && segments[0].name === 'root') {
      segments.shift()
    }

    // If selected node is a leaf and its parent is an array, remove the array index (last segment)
    if (selectedNode && selectedNode.kind === 'leaf' && selectedNode.parentId) {
      const parent = model.nodes[selectedNode.parentId]
      if (parent && parent.kind === 'array' && segments.length > 0) {
        segments.pop() // Remove the array index from the path
      }
    }

    return segments
  }

  async function handleSegmentClick(segmentId: string) {
    onSelectNode?.(segmentId)
    await tick()
    onScrollToSelected?.()
  }
</script>

<div class="path-breadcrumb">
  {#if selectedIds.length === 1}
    {@const selectedId = selectedIds[0]}
    {@const pathSegments = getPathSegments(selectedId)}
    {#if pathSegments.length > 0}
      {#each pathSegments as segment, index (segment.id)}
        {#if index > 0}
          <span class="separator">/</span>
        {/if}
        <button
          type="button"
          class="path-segment"
          class:current={segment.id === selectedId}
          onclick={() => handleSegmentClick(segment.id)}
        >
          {segment.name}
        </button>
      {/each}
    {:else}
      <span class="no-selection">No path available</span>
    {/if}
  {:else if selectedIds.length > 1}
    <span class="multiple-selection">{selectedIds.length} nodes selected</span>
  {:else}
    <span class="no-selection">No node selected</span>
  {/if}
</div>

<style>
  .path-breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem;
    background-color: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    margin: 0.5rem;
    margin-bottom: 0;
    font-size: 0.875rem;
    min-height: 2rem;
    overflow: hidden;
    white-space: nowrap;
  }

  .path-segment {
    background: none;
    border: none;
    color: #374151;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: inherit;
    font-family: inherit;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .path-segment:hover {
    background-color: #e5e7eb;
    color: #111827;
  }

  .path-segment.current {
    background-color: #3b82f6;
    color: white;
    font-weight: 500;
  }

  .path-segment.current:hover {
    background-color: #2563eb;
  }

  .separator {
    color: #6b7280;
    font-weight: 400;
    user-select: none;
  }

  .multiple-selection,
  .no-selection {
    color: #6b7280;
    font-style: italic;
    padding: 0.25rem 0.5rem;
  }
</style>

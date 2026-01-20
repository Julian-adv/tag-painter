<!-- Individual LoRA item component with weight adjustment and removal functionality -->
<script lang="ts">
  import { XMark } from 'svelte-heros-v2'
  import { m } from '$lib/paraglide/messages'

  interface LoraData {
    name: string
    weight: number
  }

  interface Props {
    lora: LoraData
    disabled?: boolean
    onRemove: (loraName: string) => void
    onWeightChange: (loraName: string, weight: number) => void
  }

  let { lora, disabled = false, onRemove, onWeightChange }: Props = $props()

  function handleWheel(event: WheelEvent) {
    // Don't handle weight adjustment if disabled
    if (disabled) return

    // Only handle weight adjustment when Ctrl key is pressed
    if (!event.ctrlKey) {
      return // Let the normal scroll behavior happen
    }

    event.preventDefault()

    const delta = event.deltaY > 0 ? -0.05 : 0.05 // Scroll down = decrease, scroll up = increase
    const currentWeight = lora.weight ?? 1.0
    const newWeight = Math.max(-2.0, Math.min(2.0, currentWeight + delta)) // Clamp between -2.0 and 2.0

    // Round to 2 decimal places
    const roundedWeight = Math.round(newWeight * 100) / 100

    // Notify parent of weight change
    onWeightChange(lora.name, roundedWeight)
  }

  let displayParts = $derived.by(() => {
    const weight = lora.weight ?? 1.0
    // Remove .safetensors extension from display name
    const displayName = lora.name.endsWith('.safetensors') ? lora.name.slice(0, -12) : lora.name
    return {
      name: displayName,
      weight: weight !== 1.0 ? weight.toString() : ''
    }
  })
</script>

<div
  onwheel={handleWheel}
  role="button"
  tabindex="-1"
  aria-label={m['loraItem.aria']({ name: lora.name, weight: String(lora.weight) })}
  class="relative inline-block max-w-full rounded-md border border-purple-300 bg-purple-50 px-3 py-0.5 pr-1 pl-1.5 text-left text-sm text-purple-800 hover:bg-purple-100"
>
  <div class="inline-block">
    <span class="min-w-0 font-medium break-words">{displayParts.name}</span>
    <!-- Invisible dummy to reserve right-edge space for weight + X -->
    <span class="invisible align-top whitespace-nowrap" aria-hidden="true"
      >{#if displayParts.weight}
        <span class="font-semibold text-purple-600">{displayParts.weight}</span>
      {/if}xxx</span
    >
  </div>
  <!-- Real weight + X pinned to bottom-right corner -->
  <span class="absolute right-1 bottom-0.5 z-20 inline-flex items-center gap-0.5 whitespace-nowrap">
    {#if displayParts.weight}
      <span class="font-semibold text-purple-600">{displayParts.weight}</span>
    {/if}
    <button
      type="button"
      class="flex h-4 w-4 items-center justify-center rounded-full bg-transparent text-purple-600 hover:bg-purple-200 hover:text-purple-800"
      tabindex="-1"
      onclick={() => onRemove(lora.name)}
      aria-label={m['loraItem.removeAria']({ name: lora.name })}
    >
      <XMark class="h-3 w-3" />
    </button>
  </span>
</div>

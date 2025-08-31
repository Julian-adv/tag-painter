<!-- Individual LoRA item component with weight adjustment and removal functionality -->
<script lang="ts">
  import { XMark } from 'svelte-heros-v2'

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

  let {
    lora = $bindable(),
    disabled = false,
    onRemove,
    onWeightChange
  }: Props = $props()

  function handleWheel(event: WheelEvent) {
    // Don't handle weight adjustment if disabled
    if (disabled) return

    // Only handle weight adjustment when Ctrl key is pressed
    if (!event.ctrlKey) {
      return // Let the normal scroll behavior happen
    }

    event.preventDefault()

    const delta = event.deltaY > 0 ? -0.1 : 0.1 // Scroll down = decrease, scroll up = increase
    const currentWeight = lora.weight ?? 1.0
    const newWeight = Math.max(0.1, Math.min(2.0, currentWeight + delta)) // Clamp between 0.1 and 2.0

    // Round to 1 decimal place
    const roundedWeight = Math.round(newWeight * 10) / 10

    // Update the lora weight
    lora.weight = roundedWeight

    // Notify parent of weight change
    onWeightChange(lora.name, roundedWeight)
  }

  let displayParts = $derived.by(() => {
    const weight = lora.weight ?? 1.0
    // Remove .safetensors extension from display name
    const displayName = lora.name.endsWith('.safetensors') 
      ? lora.name.slice(0, -12) 
      : lora.name
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
  aria-label="LoRA: {lora.name}. Weight: {lora.weight}. Ctrl+Scroll to adjust weight."
  class="inline-flex items-center gap-1 rounded-md border border-purple-300 bg-purple-50 px-3 py-0.5 pr-0.5 pl-1.5 text-sm text-purple-800 hover:bg-purple-100 max-w-full"
>
  <span class="font-medium break-words min-w-0 flex-1">{displayParts.name}</span>
  {#if displayParts.weight}
    <span class="mx-1 self-stretch border-l border-dashed border-purple-400"></span>
    <span class="font-semibold text-purple-600">{displayParts.weight}</span>
  {/if}
  <button
    type="button"
    class="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-transparent text-purple-600 hover:bg-purple-200 hover:text-purple-800"
    tabindex="-1"
    onclick={() => onRemove(lora.name)}
    aria-label="Remove {lora.name}"
  >
    <XMark class="h-3 w-3" />
  </button>
</div>
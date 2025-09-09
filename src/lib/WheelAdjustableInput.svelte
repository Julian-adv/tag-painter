<!-- Wheel and keyboard adjustable number input component -->
<script lang="ts">
  interface Props {
    value: number
    min?: number
    max?: number
    step?: number
    wheelStep?: number
    ctrlWheelStep?: number
    arrowStep?: number
    class?: string
    title?: string
    onchange?: (value: number) => void
  }

  let {
    value = $bindable(),
    min = 0,
    max = 999,
    step = 0.1,
    wheelStep = 10,
    ctrlWheelStep = 1,
    arrowStep = 0.1,
    class: className = '',
    title = '',
    onchange
  }: Props = $props()

  function updateValue(newValue: number) {
    // Clamp value within bounds
    const clampedValue = Math.max(min, Math.min(max, newValue))
    value = clampedValue
    onchange?.(clampedValue)
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault()

    let stepSize: number

    if (event.ctrlKey) {
      stepSize = ctrlWheelStep
    } else {
      stepSize = wheelStep
    }

    // Snap to next/previous multiple of stepSize
    let newValue: number
    if (event.deltaY > 0) {
      // Scroll down: go to previous multiple
      newValue = Math.floor(value / stepSize) * stepSize
      // If already on exact multiple, go to previous one
      if (newValue === value) {
        newValue = (Math.floor(value / stepSize) - 1) * stepSize
      }
    } else {
      // Scroll up: go to next multiple
      newValue = Math.ceil(value / stepSize) * stepSize
      // If already on exact multiple, go to next one
      if (newValue === value) {
        newValue = (Math.ceil(value / stepSize) + 1) * stepSize
      }
    }

    updateValue(newValue)
  }

  function handleKeydown(event: KeyboardEvent) {
    let delta = 0

    if (event.key === 'ArrowUp') {
      delta = arrowStep
      event.preventDefault()
    } else if (event.key === 'ArrowDown') {
      delta = -arrowStep
      event.preventDefault()
    }

    if (delta !== 0) {
      // Round to avoid floating point precision issues
      const newValue = Math.round((value + delta) / arrowStep) * arrowStep
      updateValue(newValue)
    }
  }

  function handleInputChange(event: Event) {
    const target = event.currentTarget as HTMLInputElement
    const newValue = parseFloat(target.value) || 0
    updateValue(newValue)
  }

  // Generate default title if not provided
  let defaultTitle = $derived(
    title ||
      `Wheel: snap to ${wheelStep}s, Ctrl+Wheel: snap to ${ctrlWheelStep}s, Arrow keys: ±${arrowStep}`
  )
</script>

<input
  type="number"
  {min}
  {max}
  {step}
  class="wheel-adjustable-input {className}"
  {value}
  title={defaultTitle}
  onchange={handleInputChange}
  onwheel={handleWheel}
  onkeydown={handleKeydown}
/>

<style>
  .wheel-adjustable-input {
    font-size: 0.875rem;
    color: #374151;
    font-weight: 500;
    font-family: monospace;
    padding: 0.25rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    background-color: white;
    min-width: 80px;
    text-align: center;
  }

  .wheel-adjustable-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 1px #3b82f6;
  }
</style>

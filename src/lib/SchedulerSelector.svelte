<script lang="ts">
  interface Props {
    value: string
    id?: string
    class?: string
    disabled?: boolean
  }

  let { value = $bindable(), id, class: className, disabled = false }: Props = $props()

  const schedulers = [
    { value: 'normal', label: 'Normal' },
    { value: 'karras', label: 'Karras' },
    { value: 'exponential', label: 'Exponential' },
    { value: 'sgm_uniform', label: 'SGM Uniform' },
    { value: 'simple', label: 'Simple' },
    { value: 'ddim_uniform', label: 'DDIM Uniform' },
    { value: 'beta', label: 'Beta' }
  ]
</script>

<select {id} bind:value class={className} {disabled} class:styled-select={true}>
  {#each schedulers as scheduler}
    <option value={scheduler.value}>{scheduler.label}</option>
  {/each}
</select>

<style>
  .styled-select {
    padding: 6px 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 13px;
    width: 100%;
    background-color: white;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .styled-select:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }

  .styled-select:hover:not(:disabled) {
    border-color: #aaa;
  }

  .styled-select:disabled {
    background-color: #f5f5f5;
    color: #666;
    cursor: not-allowed;
  }
</style>
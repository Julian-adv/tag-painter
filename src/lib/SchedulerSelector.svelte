<script lang="ts">
  import CustomSelect from './CustomSelect.svelte'

  interface Props {
    value: string
    id?: string
    class?: string
  }

  let { value = $bindable(), id, class: className }: Props = $props()

  const schedulers = [
    { value: 'simple', label: 'Simple' },
    { value: 'sgm_uniform', label: 'SGM Uniform' },
    { value: 'karras', label: 'Karras' },
    { value: 'exponential', label: 'Exponential' },
    { value: 'ddim_uniform', label: 'DDIM Uniform' },
    { value: 'beta', label: 'Beta' },
    { value: 'beta57', label: 'Beta57' },
    { value: 'normal', label: 'Normal' },
    { value: 'linear_quadratic', label: 'Linear Quadratic' },
    { value: 'kl_optimal', label: 'KL Optimal' },
    { value: 'bong_tangent', label: 'Bong Tangent' }
  ]
</script>

<CustomSelect {id} bind:value options={schedulers} class={className} />

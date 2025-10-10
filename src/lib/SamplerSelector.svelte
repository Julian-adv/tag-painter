<script lang="ts">
  interface Props {
    value: string
    id?: string
    class?: string
    disabled?: boolean
  }

  let { value = $bindable(), id, class: className, disabled = false }: Props = $props()

  const samplers = [
    { value: 'euler', label: 'Euler' },
    { value: 'euler_cfg_pp', label: 'Euler CFG++' },
    { value: 'euler_ancestral', label: 'Euler Ancestral' },
    { value: 'euler_ancestral_cfg_pp', label: 'Euler Ancestral CFG++' },
    { value: 'heun', label: 'Heun' },
    { value: 'heunpp2', label: 'Heun++2' },
    { value: 'dpm_2', label: 'DPM 2' },
    { value: 'dpm_2_ancestral', label: 'DPM 2 Ancestral' },
    { value: 'lms', label: 'LMS' },
    { value: 'dpm_fast', label: 'DPM Fast' },
    { value: 'dpm_adaptive', label: 'DPM Adaptive' },
    { value: 'dpmpp_2s_ancestral', label: 'DPM++ 2S Ancestral' },
    { value: 'dpmpp_2s_ancestral_cfg_pp', label: 'DPM++ 2S Ancestral CFG++' },
    { value: 'dpmpp_sde', label: 'DPM++ SDE' },
    { value: 'dpmpp_sde_gpu', label: 'DPM++ SDE GPU' },
    { value: 'dpmpp_2m', label: 'DPM++ 2M' },
    { value: 'dpmpp_2m_cfg_pp', label: 'DPM++ 2M CFG++' },
    { value: 'dpmpp_2m_sde', label: 'DPM++ 2M SDE' },
    { value: 'dpmpp_2m_sde_gpu', label: 'DPM++ 2M SDE GPU' },
    { value: 'dpmpp_2m_sde_heun', label: 'DPM++ 2M SDE Heun' },
    { value: 'dpmpp_2m_sde_heun_gpu', label: 'DPM++ 2M SDE Heun GPU' },
    { value: 'dpmpp_3m_sde', label: 'DPM++ 3M SDE' },
    { value: 'dpmpp_3m_sde_gpu', label: 'DPM++ 3M SDE GPU' },
    { value: 'ddpm', label: 'DDPM' },
    { value: 'lcm', label: 'LCM' },
    { value: 'ipndm', label: 'IPNDM' },
    { value: 'ipndm_v', label: 'IPNDM V' },
    { value: 'deis', label: 'DEIS' },
    { value: 'res_multistep', label: 'RES Multistep' },
    { value: 'res_multistep_cfg_pp', label: 'RES Multistep CFG++' },
    { value: 'res_multistep_ancestral', label: 'RES Multistep Ancestral' },
    { value: 'res_multistep_ancestral_cfg_pp', label: 'RES Multistep Ancestral CFG++' },
    { value: 'gradient_estimation', label: 'Gradient Estimation' },
    { value: 'gradient_estimation_cfg_pp', label: 'Gradient Estimation CFG++' },
    { value: 'er_sde', label: 'ER SDE' },
    { value: 'seeds_2', label: 'Seeds 2' },
    { value: 'seeds_3', label: 'Seeds 3' },
    { value: 'sa_solver', label: 'SA Solver' },
    { value: 'sa_solver_pece', label: 'SA Solver PECE' },
    { value: 'ddim', label: 'DDIM' },
    { value: 'uni_pc', label: 'Uni PC' },
    { value: 'uni_pc_bh2', label: 'Uni PC BH2' }
  ]
</script>

<select {id} bind:value class={className} {disabled} class:styled-select={true}>
  {#each samplers as sampler}
    <option value={sampler.value}>{sampler.label}</option>
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

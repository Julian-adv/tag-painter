import type { Component } from 'svelte'
import ComfyInstallStep from './ComfyInstallStep.svelte'
import CustomNodesInstallStep from './CustomNodesInstallStep.svelte'
import StartComfyStep from './StartComfyStep.svelte'
import NunchakuInstallStep from './NunchakuInstallStep.svelte'

export interface StepConfig {
  id: string
  name: string
  component: Component
}

// Step configuration for installation wizard
export const INSTALLATION_STEPS: StepConfig[] = [
  {
    id: 'comfy-install',
    name: 'ComfyUI Installation',
    component: ComfyInstallStep
  },
  {
    id: 'custom-nodes',
    name: 'Custom Nodes Installation',
    component: CustomNodesInstallStep
  },
  {
    id: 'start-comfy',
    name: 'Start ComfyUI',
    component: StartComfyStep
  },
  {
    id: 'nunchaku',
    name: 'Nunchaku Runtime',
    component: NunchakuInstallStep
  }
]

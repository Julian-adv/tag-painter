import type { Component } from 'svelte'
import { m } from '$lib/paraglide/messages'
import ComfyInstallStep from './ComfyInstallStep.svelte'
import CustomNodesInstallStep from './CustomNodesInstallStep.svelte'
import StartComfyStep from './StartComfyStep.svelte'
import NunchakuInstallStep from './NunchakuInstallStep.svelte'
import EssentialDownloadsStep from './EssentialDownloadsStep.svelte'
import ModelDownloadsStep from './ModelDownloadsStep.svelte'

export interface StepConfig {
  id: string
  name: () => string
  component: Component
}

// Step configuration for installation wizard
export const INSTALLATION_STEPS: StepConfig[] = [
  {
    id: 'comfy-install',
    name: () => m['comfyInstall.title'](),
    component: ComfyInstallStep
  },
  {
    id: 'custom-nodes',
    name: () => m['customNodes.installRequired'](),
    component: CustomNodesInstallStep
  },
  {
    id: 'start-comfy',
    name: () => m['customNodes.start'](),
    component: StartComfyStep
  },
  {
    id: 'nunchaku',
    name: () => m['downloads.nunchakuTitle'](),
    component: NunchakuInstallStep
  },
  {
    id: 'core-downloads',
    name: () => m['downloads.step1Title'](),
    component: EssentialDownloadsStep
  },
  {
    id: 'model-downloads',
    name: () => m['downloads.step2Title'](),
    component: ModelDownloadsStep
  }
]

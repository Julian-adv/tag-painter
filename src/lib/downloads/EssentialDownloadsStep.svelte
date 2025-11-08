<script lang="ts">
  import { m } from '$lib/paraglide/messages'
  import DownloadGroupStep from './DownloadGroupStep.svelte'
  import type { StepController, StepStatus } from './stepInterface'

  interface Props {
    controller?: StepController
    onStatusChange?: (status: StepStatus) => void
    onError?: (error: string) => void
  }

  let { controller = $bindable(), onStatusChange, onError }: Props = $props()
</script>

<DownloadGroupStep
  bind:controller={controller}
  {onStatusChange}
  {onError}
  mode="essential"
  title={m['downloads.step1Title']()}
  description={m['downloads.step1Description']()}
  emptyMessage={m['downloads.essentialComplete']()}
/>

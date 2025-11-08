<script lang="ts">
  import { m } from '$lib/paraglide/messages'
  import DownloadGroupStep from './DownloadGroupStep.svelte'
  import type { StepController } from './stepInterface'

  interface Props {
    controller?: StepController
  }

  let { controller = $bindable() }: Props = $props()
</script>

<DownloadGroupStep
  bind:controller={controller}
  mode="essential"
  title={m['downloads.step1Title']()}
  description={m['downloads.step1Description']()}
  emptyMessage={m['downloads.essentialComplete']()}
/>

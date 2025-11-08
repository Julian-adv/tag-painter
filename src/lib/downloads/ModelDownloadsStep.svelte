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
  mode="models"
  title={m['downloads.step2Title']()}
  description={m['downloads.step2Description']()}
  emptyMessage={m['downloads.modelComplete']()}
/>

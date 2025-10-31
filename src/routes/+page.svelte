<script lang="ts">
  import ImageGenerator from '$lib/ImageGenerator/ImageGenerator.svelte'
</script>

<svelte:head>
  <title>Tag Painter</title>
  <meta name="description" content="Tag Painter" />
</svelte:head>

<section>
  <ImageGenerator />
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 80vh; /* Make section take at least 80% of viewport height */
    text-align: center;
  }
</style>

<script lang="ts">
  import ImageGenerator from '$lib/ImageGenerator.svelte'
</script>

<svelte:head>
  <title>Toon Maker</title>
  <meta name="description" content="Toon Maker" />
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

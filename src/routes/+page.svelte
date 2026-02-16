<script lang="ts">
  import MapView from '$lib/components/MapView.svelte';
</script>

<svelte:head>
  <title>Polygon Map Generator</title>
</svelte:head>

<main>
  <h1>Polygon Map Generator</h1>
  <p>Based on Amit Patel's procedural map generation algorithm</p>
  <MapView />
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background: #0f0f1a;
    min-height: 100vh;
  }

  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem;
    color: #fff;
    font-family: system-ui, -apple-system, sans-serif;
  }

  h1 {
    margin: 0 0 0.5rem 0;
    font-size: 2rem;
    color: #fff;
  }

  p {
    margin: 0 0 1.5rem 0;
    color: #888;
  }
</style>

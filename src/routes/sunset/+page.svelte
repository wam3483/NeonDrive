<script lang="ts">
  import SunsetView from '$lib/components/SunsetView.svelte';
</script>

<svelte:head>
  <title>Synthwave Sunset</title>
</svelte:head>

<main>
  <h1>Synthwave Sunset</h1>
  <p>Procedural synthwave sunset renderer — seed-driven visuals</p>
  <SunsetView />
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

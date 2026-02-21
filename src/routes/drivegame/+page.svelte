<script lang="ts">
  import DriveGameView from '$lib/components/DriveGameView.svelte';
</script>

<svelte:head>
  <title>NeonDrive</title>
</svelte:head>

<main>
  <h1>NeonDrive</h1>
  <p>Synthwave arcade racer</p>
  <DriveGameView />
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

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { DriveGameRenderer } from '$lib/drivegame';

  let canvas: HTMLCanvasElement;
  let renderer: DriveGameRenderer | null = $state(null);

  const width  = 800;
  const height = 600;

  async function initRenderer() {
    const r = new DriveGameRenderer();
    await r.init(canvas, width, height);
    r.setConfig({
      seed: Math.floor(Math.random() * 1_000_000),
      palette: 'terra',
      gridSpeed: 2,
      showGrid: true,
      showStars: true,
      showMountains: true,
      showClouds: true,
      showTrees: true,
      sunStripes: true,
      starDensity: 300,
      roadStyle: 'road',
    });
    r.setCarStyle('sport');
    renderer = r;
  }

  onMount(() => { initRenderer(); });
  onDestroy(() => { renderer?.destroy(); });
</script>

<div class="drivegame-container">
  <div class="canvas-wrapper">
    <canvas bind:this={canvas}></canvas>
  </div>
  <div class="controls-hint">
    <span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span>
    <span class="hint-text">to drive</span>
  </div>
</div>

<style>
  .drivegame-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .canvas-wrapper {
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.45);
  }

  canvas { display: block; }

  .controls-hint {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: #888;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 0.85rem;
  }

  .key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.8rem;
    height: 1.8rem;
    border: 1px solid #555;
    border-radius: 4px;
    background: #1a1a2e;
    color: #ccc;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .hint-text {
    margin-left: 0.3rem;
  }
</style>

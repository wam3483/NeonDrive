<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { SunsetRenderer } from '$lib/sunset';

  let canvas: HTMLCanvasElement;
  let renderer: SunsetRenderer | null = $state(null);

  // Config state
  let seed = $state(42);
  let sunY = $state(0.35);
  let sunSize = $state(80);
  let gridSpeed = $state(1);
  let starDensity = $state(150);
  let mountainHeight = $state(0.25);
  let showGrid = $state(true);
  let showStars = $state(true);
  let showMountains = $state(true);

  const width = 800;
  const height = 600;

  async function initRenderer() {
    const r = new SunsetRenderer();
    await r.init(canvas, width, height);
    renderer = r;
    updateConfig();
  }

  function updateConfig() {
    if (!renderer) return;
    renderer.setConfig({
      seed,
      sunY,
      sunSize,
      gridSpeed,
      starDensity,
      mountainHeight,
      showGrid,
      showStars,
      showMountains,
    });
  }

  function randomSeed() {
    seed = Math.floor(Math.random() * 1000000);
    updateConfig();
  }

  onMount(() => {
    initRenderer();
  });

  onDestroy(() => {
    if (renderer) {
      renderer.destroy();
    }
  });
</script>

<div class="sunset-container">
  <div class="controls">
    <div class="control-group">
      <label>
        Seed:
        <input type="number" bind:value={seed} onchange={updateConfig} />
      </label>
      <button onclick={randomSeed}>Random</button>
    </div>

    <div class="control-group">
      <label>
        Sun Position:
        <input type="range" min="0" max="1" step="0.01" bind:value={sunY} onchange={updateConfig} />
        <span>{sunY.toFixed(2)}</span>
      </label>
    </div>

    <div class="control-group">
      <label>
        Sun Size:
        <input type="range" min="20" max="150" step="1" bind:value={sunSize} onchange={updateConfig} />
        <span>{sunSize}</span>
      </label>
    </div>

    <div class="control-group">
      <label>
        Grid Speed:
        <input type="range" min="0" max="5" step="0.1" bind:value={gridSpeed} onchange={updateConfig} />
        <span>{gridSpeed.toFixed(1)}</span>
      </label>
    </div>

    <div class="control-group">
      <label>
        Stars:
        <input type="range" min="0" max="300" step="10" bind:value={starDensity} onchange={updateConfig} />
        <span>{starDensity}</span>
      </label>
    </div>

    <div class="control-group">
      <label>
        Mountain Height:
        <input type="range" min="0" max="1" step="0.05" bind:value={mountainHeight} onchange={updateConfig} />
        <span>{mountainHeight.toFixed(2)}</span>
      </label>
    </div>

    <div class="control-group">
      <label>
        <input type="checkbox" bind:checked={showGrid} onchange={updateConfig} />
        Grid
      </label>
      <label>
        <input type="checkbox" bind:checked={showStars} onchange={updateConfig} />
        Stars
      </label>
      <label>
        <input type="checkbox" bind:checked={showMountains} onchange={updateConfig} />
        Mountains
      </label>
    </div>
  </div>

  <div class="canvas-wrapper">
    <canvas bind:this={canvas}></canvas>
  </div>
</div>

<style>
  .sunset-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
    padding: 1rem;
    background: #1a1a2e;
    border-radius: 8px;
    color: #fff;
  }

  .control-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  input[type='number'] {
    width: 100px;
    padding: 0.25rem 0.5rem;
    border: 1px solid #444;
    border-radius: 4px;
    background: #2a2a4e;
    color: #fff;
  }

  input[type='range'] {
    width: 100px;
  }

  input[type='checkbox'] {
    cursor: pointer;
  }

  span {
    min-width: 2.5rem;
    font-size: 0.85rem;
    color: #aaa;
  }

  button {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    background: #4a4a8e;
    color: #fff;
    cursor: pointer;
    transition: background 0.2s;
  }

  button:hover {
    background: #5a5aae;
  }

  .canvas-wrapper {
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }

  canvas {
    display: block;
  }
</style>

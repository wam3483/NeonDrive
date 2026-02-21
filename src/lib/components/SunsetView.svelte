<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { SunsetRenderer } from '$lib/sunset';

  let canvas: HTMLCanvasElement;
  let renderer: SunsetRenderer | null = $state(null);

  // Config state
  let seed          = $state(42);
  let sunY          = $state(0.35);
  let sunSize       = $state(80);
  let sunStripes    = $state(true);
  let gridSpeed     = $state(1);
  let starDensity   = $state(150);
  let mountainHeight = $state(0.25);
  let mountainLayers = $state(3);
  let cloudDensity  = $state(0.6);
  let roadStyle     = $state<'grid' | 'road'>('road');
  let showGrid      = $state(true);
  let showStars     = $state(true);
  let showMountains = $state(true);
  let showClouds    = $state(true);
  let showTrees     = $state(true);
  let palette       = $state<'auto'|'ember'|'dusk'|'amber'|'neon'|'terra'>('auto');
  let cloudStyle    = $state<'auto'|'puff'|'wispy'>('auto');

  const width  = 800;
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
      seed, sunY, sunSize, sunStripes,
      gridSpeed, starDensity,
      mountainHeight, mountainLayers,
      cloudDensity,
      showGrid, showStars, showMountains, showClouds, showTrees,
      palette, cloudStyle, roadStyle,
    });
  }

  function randomSeed() {
    seed = Math.floor(Math.random() * 1_000_000);
    updateConfig();
  }

  onMount(() => { initRenderer(); });
  onDestroy(() => { renderer?.destroy(); });
</script>

<div class="sunset-container">
  <div class="controls">

    <!-- Seed -->
    <div class="control-group">
      <label>
        Seed
        <input type="number" bind:value={seed} onchange={updateConfig} />
      </label>
      <button onclick={randomSeed}>Random</button>
    </div>

    <!-- Palette -->
    <div class="control-group">
      <label>
        Palette
        <select bind:value={palette} onchange={updateConfig}>
          <option value="auto">Auto</option>
          <option value="ember">Ember</option>
          <option value="dusk">Dusk</option>
          <option value="amber">Amber</option>
          <option value="neon">Neon</option>
          <option value="terra">Terra</option>
        </select>
      </label>
    </div>

    <!-- Sun -->
    <div class="control-group">
      <label>
        Sun Y
        <input type="range" min="0" max="1" step="0.01" bind:value={sunY} onchange={updateConfig} />
        <span>{sunY.toFixed(2)}</span>
      </label>
    </div>

    <div class="control-group">
      <label>
        Sun Size
        <input type="range" min="20" max="150" step="1" bind:value={sunSize} onchange={updateConfig} />
        <span>{sunSize}</span>
      </label>
    </div>

    <!-- Mountains -->
    <div class="control-group">
      <label>
        Mtn Height
        <input type="range" min="0" max="1" step="0.05" bind:value={mountainHeight} onchange={updateConfig} />
        <span>{mountainHeight.toFixed(2)}</span>
      </label>
    </div>

    <div class="control-group">
      <label>
        Mtn Layers
        <input type="range" min="1" max="3" step="1" bind:value={mountainLayers} onchange={updateConfig} />
        <span>{mountainLayers}</span>
      </label>
    </div>

    <!-- Clouds -->
    <div class="control-group">
      <label>
        Clouds
        <input type="range" min="0" max="1" step="0.05" bind:value={cloudDensity} onchange={updateConfig} />
        <span>{cloudDensity.toFixed(2)}</span>
      </label>
    </div>

    <div class="control-group">
      <label>
        Cloud Style
        <select bind:value={cloudStyle} onchange={updateConfig}>
          <option value="auto">Auto</option>
          <option value="puff">Puff</option>
          <option value="wispy">Wispy</option>
        </select>
      </label>
    </div>

    <!-- Stars -->
    <div class="control-group">
      <label>
        Stars
        <input type="range" min="0" max="300" step="10" bind:value={starDensity} onchange={updateConfig} />
        <span>{starDensity}</span>
      </label>
    </div>

    <!-- Road -->
    <div class="control-group">
      <label>
        Road
        <select bind:value={roadStyle} onchange={updateConfig}>
          <option value="grid">Grid</option>
          <option value="road">Road</option>
        </select>
      </label>
    </div>

    <!-- Road/Grid speed -->
    <div class="control-group">
      <label>
        Road Speed
        <input type="range" min="0" max="5" step="0.1" bind:value={gridSpeed} onchange={updateConfig} />
        <span>{gridSpeed.toFixed(1)}</span>
      </label>
    </div>

    <!-- Toggles -->
    <div class="control-group toggles">
      <label><input type="checkbox" bind:checked={showGrid}      onchange={updateConfig} /> Grid</label>
      <label><input type="checkbox" bind:checked={showStars}     onchange={updateConfig} /> Stars</label>
      <label><input type="checkbox" bind:checked={showMountains} onchange={updateConfig} /> Mountains</label>
      <label><input type="checkbox" bind:checked={showClouds}    onchange={updateConfig} /> Clouds</label>
      <label><input type="checkbox" bind:checked={showTrees}     onchange={updateConfig} /> Trees</label>
      <label><input type="checkbox" bind:checked={sunStripes}    onchange={updateConfig} /> Sun Stripes</label>
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
    gap: 0.75rem 1.25rem;
    align-items: center;
    padding: 0.875rem 1rem;
    background: #1a1a2e;
    border-radius: 8px;
    color: #fff;
    max-width: 820px;
    width: 100%;
  }

  .control-group {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .toggles {
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
  }

  label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  input[type='number'] {
    width: 80px;
    padding: 0.2rem 0.4rem;
    border: 1px solid #444;
    border-radius: 4px;
    background: #2a2a4e;
    color: #fff;
    font-size: 0.85rem;
  }

  input[type='range'] { width: 90px; }

  input[type='checkbox'] { cursor: pointer; }

  select {
    padding: 0.2rem 0.4rem;
    border: 1px solid #444;
    border-radius: 4px;
    background: #2a2a4e;
    color: #fff;
    font-size: 0.85rem;
    cursor: pointer;
  }

  span {
    min-width: 2.2rem;
    font-size: 0.8rem;
    color: #aaa;
  }

  button {
    padding: 0.35rem 0.75rem;
    border: none;
    border-radius: 4px;
    background: #4a4a8e;
    color: #fff;
    cursor: pointer;
    font-size: 0.85rem;
    transition: background 0.15s;
  }

  button:hover { background: #5a5aae; }

  .canvas-wrapper {
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.45);
  }

  canvas { display: block; }
</style>

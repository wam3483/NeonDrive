<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    generateMap,
    MapRenderer,
    TownGenerator,
    DEFAULT_CONFIG,
    DEFAULT_TOWN_CONFIG,
  } from '$lib/map';

  let canvas: HTMLCanvasElement;
  let renderer: MapRenderer | null = $state(null);
  let generating = $state(false);
  let townStats = $state<Record<string, number>>({});

  // Map configuration
  let seed = $state(DEFAULT_CONFIG.seed);
  let numPoints = $state(DEFAULT_CONFIG.numPoints);
  let riverCount = $state(DEFAULT_CONFIG.riverCount);

  // Town configuration
  let totalTowns = $state(DEFAULT_TOWN_CONFIG.totalTowns);
  let showTowns = $state(true);

  // Render options
  let showEdges = $state(false);
  let showElevation = $state(false);
  let showMoisture = $state(false);

  const width = 800;
  const height = 600;

  async function initRenderer() {
    const r = new MapRenderer();
    await r.init(canvas, width, height);
    renderer = r;
    await generate();
  }

  async function generate() {
    if (!renderer) return;
    generating = true;

    // Use setTimeout to allow UI to update
    await new Promise((resolve) => setTimeout(resolve, 10));

    const mapData = generateMap({
      width,
      height,
      seed,
      numPoints,
      riverCount,
    });

    renderer.setMap(mapData);

    // Generate towns
    const townGenerator = new TownGenerator(mapData, {
      totalTowns,
      minDistance: 40,
      rules: [
        {
          type: 'shoreline',
          targetPercent: 0.3,
          minCount: 2,
          maxCount: 0,
          priority: 10,
        },
        {
          type: 'river',
          targetPercent: 0.25,
          minCount: 2,
          maxCount: 0,
          priority: 8,
        },
        {
          type: 'elevation',
          targetPercent: 0.15,
          minCount: 1,
          maxCount: 3,
          elevationMin: 0.6,
          elevationMax: 1.0,
          priority: 6,
        },
        {
          type: 'elevation',
          targetPercent: 0.2,
          minCount: 1,
          maxCount: 0,
          elevationMin: 0.3,
          elevationMax: 0.6,
          priority: 4,
        },
        {
          type: 'inland',
          targetPercent: 0.1,
          minCount: 0,
          maxCount: 0,
          priority: 2,
        },
      ],
    });

    const result = townGenerator.generate();
    renderer.setTowns(result.towns);
    townStats = result.stats.byType;

    generating = false;
  }

  function randomSeed() {
    seed = Math.floor(Math.random() * 1000000);
    generate();
  }

  function handleCheckboxChange() {
    if (!renderer) return;
    renderer.setOptions({
      showEdges,
      showElevation,
      showMoisture,
      showTowns,
    });
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

<div class="map-container">
  <div class="controls">
    <div class="control-group">
      <label>
        Seed:
        <input type="number" bind:value={seed} onchange={generate} />
      </label>
      <button onclick={randomSeed}>Random</button>
    </div>

    <div class="control-group">
      <label>
        Points:
        <input
          type="range"
          min="500"
          max="5000"
          step="100"
          bind:value={numPoints}
          onchange={generate}
        />
        <span>{numPoints}</span>
      </label>
    </div>

    <div class="control-group">
      <label>
        Rivers:
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          bind:value={riverCount}
          onchange={generate}
        />
        <span>{riverCount}</span>
      </label>
    </div>

    <div class="control-group">
      <label>
        Towns:
        <input
          type="range"
          min="0"
          max="30"
          step="1"
          bind:value={totalTowns}
          onchange={generate}
        />
        <span>{totalTowns}</span>
      </label>
    </div>

    <div class="control-group">
      <label>
        <input type="checkbox" bind:checked={showTowns} onchange={handleCheckboxChange} />
        Towns
      </label>
      <label>
        <input type="checkbox" bind:checked={showEdges} onchange={handleCheckboxChange} />
        Edges
      </label>
      <label>
        <input type="checkbox" bind:checked={showElevation} onchange={handleCheckboxChange} />
        Elevation
      </label>
      <label>
        <input type="checkbox" bind:checked={showMoisture} onchange={handleCheckboxChange} />
        Moisture
      </label>
    </div>

    <button class="generate-btn" onclick={generate} disabled={generating}>
      {generating ? 'Generating...' : 'Regenerate'}
    </button>
  </div>

  {#if Object.keys(townStats).length > 0}
    <div class="town-stats">
      {#each Object.entries(townStats) as [type, count]}
        <span class="stat stat-{type}">{type}: {count}</span>
      {/each}
    </div>
  {/if}

  <div class="canvas-wrapper">
    <canvas bind:this={canvas}></canvas>
    {#if generating}
      <div class="loading">Generating map...</div>
    {/if}
  </div>
</div>

<style>
  .map-container {
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

  button {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    background: #4a4a8e;
    color: #fff;
    cursor: pointer;
    transition: background 0.2s;
  }

  button:hover:not(:disabled) {
    background: #5a5aae;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .generate-btn {
    background: #2d8f6f;
  }

  .generate-btn:hover:not(:disabled) {
    background: #3daf8f;
  }

  .town-stats {
    display: flex;
    gap: 1rem;
    padding: 0.5rem 1rem;
    background: #1a1a2e;
    border-radius: 4px;
    font-size: 0.85rem;
  }

  .stat {
    padding: 0.25rem 0.5rem;
    border-radius: 3px;
    color: #fff;
  }

  .stat-shoreline {
    background: #8b6914;
  }

  .stat-river {
    background: #1a5a8c;
  }

  .stat-elevation {
    background: #666666;
  }

  .stat-inland {
    background: #4a2f17;
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

  .loading {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    padding: 1rem 2rem;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    border-radius: 8px;
  }
</style>

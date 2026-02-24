<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { MusicEngine, DEFAULT_CONFIG } from '$lib/music/engine';
  import { KEY_OPTIONS, PROGRESSIONS, NOTE_NAMES } from '$lib/music/theory';

  // ── Engine ────────────────────────────────────────────────────────────────
  let engine: MusicEngine | null = null;

  // ── Reactive state ────────────────────────────────────────────────────────
  let isPlaying   = $state(false);
  let currentStep = $state(-1);
  let currentBar  = $state(0);

  // Config
  let bpm           = $state(DEFAULT_CONFIG.bpm);
  let keyRoot       = $state(DEFAULT_CONFIG.keyRoot);
  let progression   = $state(DEFAULT_CONFIG.progression);
  let electronicMix = $state(Math.round(DEFAULT_CONFIG.electronicMix * 100));
  let reverbAmount  = $state(Math.round(DEFAULT_CONFIG.reverbAmount  * 100));
  let bassLevel     = $state(Math.round(DEFAULT_CONFIG.bassLevel     * 100));
  let padLevel      = $state(Math.round(DEFAULT_CONFIG.padLevel      * 100));
  let drumsLevel    = $state(Math.round(DEFAULT_CONFIG.drumsLevel    * 100));
  let arpEnabled    = $state(DEFAULT_CONFIG.arpEnabled);
  let arpSpeed      = $state(DEFAULT_CONFIG.arpSpeed);

  // ── Derived chord label ───────────────────────────────────────────────────
  let chordLabel = $derived.by(() => {
    const prog  = PROGRESSIONS[progression];
    if (!prog || currentStep < 0) return '';
    const chord = prog[currentBar % prog.length];
    return `${keyRoot} ${chord.label}`;
  });

  // ── Sync config to engine whenever sliders change ─────────────────────────
  $effect(() => {
    engine?.updateConfig({
      bpm,
      keyRoot,
      progression,
      electronicMix: electronicMix / 100,
      reverbAmount:  reverbAmount  / 100,
      bassLevel:     bassLevel     / 100,
      padLevel:      padLevel      / 100,
      drumsLevel:    drumsLevel    / 100,
      arpEnabled,
      arpSpeed,
    });
  });

  // ── Visualiser ────────────────────────────────────────────────────────────
  let canvas: HTMLCanvasElement;
  let rafId: number;

  function drawVisualiser() {
    rafId = requestAnimationFrame(drawVisualiser);
    const analyser = engine?.getAnalyser();
    if (!analyser || !canvas) return;

    const ctx  = canvas.getContext('2d')!;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const bins  = Math.floor(data.length * 0.65); // skip ultrasonic bins
    const bw    = W / bins;

    for (let i = 0; i < bins; i++) {
      const v   = data[i] / 255;
      const h   = Math.max(1, v * H);
      const hue = 170 + v * 40;           // teal → cyan
      const lum = 20  + v * 55;
      ctx.fillStyle = `hsl(${hue},80%,${lum}%)`;
      ctx.fillRect(i * bw, H - h, Math.max(1, bw - 1), h);
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  onMount(() => {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    engine = new MusicEngine();
    engine.onStep = (step, bar) => {
      currentStep = step;
      currentBar  = bar;
    };

    drawVisualiser();
  });

  onDestroy(() => {
    engine?.stop();
    cancelAnimationFrame(rafId);
  });

  // ── Controls ──────────────────────────────────────────────────────────────
  async function togglePlay() {
    if (!engine) return;
    if (isPlaying) {
      engine.stop();
      isPlaying   = false;
      currentStep = -1;
    } else {
      await engine.start();
      isPlaying = true;
    }
  }

  const progressionKeys = Object.keys(PROGRESSIONS);
  const arpSpeeds = [
    { value: 1, label: '♩ Quarter' },
    { value: 2, label: '♪ 8th'     },
    { value: 4, label: '♬ 16th'    },
  ];
</script>

<svelte:head>
  <title>NeonDrive Music</title>
</svelte:head>

<main>
  <header>
    <h1>NeonDrive <span class="accent">Music</span></h1>
    <p>Bossa nova × electronic — procedurally generated in the browser</p>
  </header>

  <!-- Beat indicator -->
  <div class="beat-row">
    {#each Array.from({ length: 16 }) as _, i}
      <div
        class="beat-dot"
        class:active={currentStep === i}
        class:bar-start={i % 4 === 0}
      ></div>
    {/each}
  </div>

  <!-- Frequency visualiser -->
  <div class="visualiser-wrap">
    <canvas bind:this={canvas}></canvas>
    {#if isPlaying && chordLabel}
      <div class="chord-label">{chordLabel}</div>
    {/if}
  </div>

  <!-- Play / Stop -->
  <button class="play-btn" onclick={togglePlay} class:playing={isPlaying}>
    {isPlaying ? '■ STOP' : '▶ PLAY'}
  </button>

  <!-- Controls grid -->
  <div class="panels">

    <!-- Tempo & Composition -->
    <div class="panel">
      <div class="panel-title">Tempo &amp; Key</div>

      <label>
        <span>BPM <em>{bpm}</em></span>
        <input type="range" min="70" max="130" step="1" bind:value={bpm} />
      </label>

      <label>
        <span>Key</span>
        <select bind:value={keyRoot}>
          {#each KEY_OPTIONS as k}
            <option value={k}>{k}</option>
          {/each}
        </select>
      </label>

      <label>
        <span>Progression</span>
        <select bind:value={progression}>
          {#each progressionKeys as p}
            <option value={p}>{p}</option>
          {/each}
        </select>
      </label>
    </div>

    <!-- Character -->
    <div class="panel">
      <div class="panel-title">Character</div>

      <label class="wide">
        <span>Electronic Mix <em>{electronicMix}%</em></span>
        <div class="mix-labels"><span>Bossa</span><span>Electronic</span></div>
        <input type="range" min="0" max="100" bind:value={electronicMix} />
      </label>

      <label class="wide">
        <span>Reverb <em>{reverbAmount}%</em></span>
        <input type="range" min="0" max="100" bind:value={reverbAmount} />
      </label>
    </div>

    <!-- Mix -->
    <div class="panel">
      <div class="panel-title">Mix</div>

      <label>
        <span>Drums <em>{drumsLevel}%</em></span>
        <input type="range" min="0" max="100" bind:value={drumsLevel} />
      </label>

      <label>
        <span>Bass <em>{bassLevel}%</em></span>
        <input type="range" min="0" max="100" bind:value={bassLevel} />
      </label>

      <label>
        <span>Pad <em>{padLevel}%</em></span>
        <input type="range" min="0" max="100" bind:value={padLevel} />
      </label>
    </div>

    <!-- Arpeggio -->
    <div class="panel">
      <div class="panel-title">Arpeggio</div>

      <label class="toggle-row">
        <span>Enable</span>
        <button
          class="toggle"
          class:on={arpEnabled}
          onclick={() => arpEnabled = !arpEnabled}
        >{arpEnabled ? 'ON' : 'OFF'}</button>
      </label>

      <label>
        <span>Speed</span>
        <select bind:value={arpSpeed} disabled={!arpEnabled}>
          {#each arpSpeeds as s}
            <option value={s.value}>{s.label}</option>
          {/each}
        </select>
      </label>
    </div>

  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background: #08081a;
    min-height: 100vh;
  }

  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem 1.5rem 4rem;
    color: #b8cce0;
    font-family: system-ui, -apple-system, sans-serif;
    max-width: 820px;
    margin: 0 auto;
  }

  /* ── Header ── */
  header { text-align: center; margin-bottom: 2rem; }

  h1 {
    margin: 0 0 0.4rem;
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: #d0e8f0;
  }
  .accent { color: #40e8d8; }

  header p {
    margin: 0;
    color: #5a7a90;
    font-size: 0.9rem;
    letter-spacing: 0.03em;
  }

  /* ── Beat dots ── */
  .beat-row {
    display: flex;
    gap: 6px;
    margin-bottom: 1.2rem;
  }

  .beat-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #161830;
    border: 1px solid #222848;
    transition: background 80ms, box-shadow 80ms;
  }
  .beat-dot.bar-start {
    width: 14px;
    height: 14px;
    border-color: #2a3860;
  }
  .beat-dot.active {
    background: #40e8d8;
    border-color: #40e8d8;
    box-shadow: 0 0 8px #40e8d8, 0 0 16px #40e8d840;
  }

  /* ── Visualiser ── */
  .visualiser-wrap {
    position: relative;
    width: 100%;
    max-width: 700px;
    height: 90px;
    margin-bottom: 1.8rem;
    border-radius: 6px;
    overflow: hidden;
    background: #0a0a1e;
    border: 1px solid #1a2040;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .chord-label {
    position: absolute;
    bottom: 8px;
    right: 12px;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    color: #40e8d880;
    font-variant-numeric: tabular-nums;
  }

  /* ── Play button ── */
  .play-btn {
    padding: 0.7rem 3rem;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    border: 2px solid #40e8d8;
    border-radius: 4px;
    background: transparent;
    color: #40e8d8;
    cursor: pointer;
    margin-bottom: 2.5rem;
    transition: background 150ms, box-shadow 150ms;
  }
  .play-btn:hover {
    background: #40e8d815;
    box-shadow: 0 0 14px #40e8d840;
  }
  .play-btn.playing {
    background: #40e8d820;
    box-shadow: 0 0 20px #40e8d860;
  }

  /* ── Panels ── */
  .panels {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
    width: 100%;
    max-width: 760px;
  }

  .panel {
    background: #0d0d22;
    border: 1px solid #1a2040;
    border-radius: 6px;
    padding: 1.1rem 1.2rem 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .panel-title {
    font-size: 0.65rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: #40e8d8;
    border-bottom: 1px solid #1a2848;
    padding-bottom: 0.5rem;
    margin-bottom: 0.1rem;
  }

  /* ── Labels & inputs ── */
  label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 0.78rem;
    color: #7a9ab0;
  }

  label span { display: flex; justify-content: space-between; }
  label em   { color: #40e8d8; font-style: normal; font-variant-numeric: tabular-nums; }

  .mix-labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.65rem;
    color: #405060;
    margin-top: -2px;
  }

  input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 4px;
    background: #1a2040;
    border-radius: 2px;
    outline: none;
  }
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: #40e8d8;
    cursor: pointer;
    box-shadow: 0 0 5px #40e8d860;
  }
  input[type="range"]::-moz-range-thumb {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: #40e8d8;
    cursor: pointer;
    border: none;
  }

  select {
    background: #0a0a20;
    border: 1px solid #1e2848;
    border-radius: 3px;
    color: #9ab8cc;
    font-size: 0.78rem;
    padding: 4px 6px;
    outline: none;
    cursor: pointer;
  }
  select:disabled { opacity: 0.4; cursor: default; }

  /* ── Toggle ── */
  .toggle-row {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .toggle {
    padding: 3px 14px;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    border: 1px solid #2a3860;
    border-radius: 3px;
    background: transparent;
    color: #405070;
    cursor: pointer;
    transition: all 120ms;
  }
  .toggle.on {
    border-color: #40e8d8;
    color: #40e8d8;
    background: #40e8d815;
    box-shadow: 0 0 8px #40e8d840;
  }
</style>

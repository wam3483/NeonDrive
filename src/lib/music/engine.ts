import {
  NOTE_NAMES, midiToFreq, getChordMidis, getChordRootMidi,
  PROGRESSIONS, type ChordDef,
} from './theory';

// ─── Config ──────────────────────────────────────────────────────────────────

export interface MusicConfig {
  bpm:           number;
  keyRoot:       string;   // e.g. 'A'
  progression:   string;   // key into PROGRESSIONS
  electronicMix: number;   // 0–1: acoustic bossa ↔ electronic
  reverbAmount:  number;   // 0–1
  bassLevel:     number;   // 0–1
  padLevel:      number;   // 0–1
  drumsLevel:    number;   // 0–1
  arpEnabled:    boolean;
  arpSpeed:      number;   // 1=quarter | 2=8th | 4=16th
  seed:          number;   // 0–999
  leadLevel:     number;   // 0–1
}

export const DEFAULT_CONFIG: MusicConfig = {
  bpm:           100,
  keyRoot:       'A',
  progression:   'Outrun',
  electronicMix: 0.5,
  reverbAmount:  0.5,
  bassLevel:     0.8,
  padLevel:      0.65,
  drumsLevel:    0.75,
  arpEnabled:    false,
  arpSpeed:      4,
  seed:          42,
  leadLevel:     0.55,
};

// ─── Drum patterns (16 steps, velocity 0–1, 0 = silent) ──────────────────────

// Acoustic bossa: kick on 1 and near-3, strong syncopated feel
const KICK_A  = [1,0,0,0, 0,0,0,0, 0,0,.8,0, 1,0,0,0];
// Electronic: four-on-the-floor
const KICK_E  = [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0];

// Rim: syncopated bossa clave feel
const RIM_A   = [0,0,.6,0, 0,.5,0,0, 0,0,.6,0, 0,.5,0,0];
// Snare: 2 and 4
const SNARE_E = [0,0,0,0, .8,0,0,0, 0,0,0,0, .8,0,0,0];

// Acoustic bossa hi-hat: 8th notes with open hat on "and of 2" and "and of 4"
const HH_A    = [.7,0,.5,0, .6,0,.5,0, .7,0,.5,0, .6,0,.5,0];
const OH_A    = [0,0,0,0, 0,0,0,.5, 0,0,0,0, 0,0,0,.5];

// Bass patterns
const BASS_A  = [1,0,0,0, 0,0,1,0, 0,1,0,0, 0,0,0,0];
const BASS_E  = [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0];

// ─── Hi-hat templates (4 styles) ─────────────────────────────────────────────

const HH_TEMPLATES: number[][] = [
  [.7,0,.6,0,  .7,0,.6,0,  .7,0,.6,0,  .7,0,.6,0 ],  // straight 8ths
  [.7,.3,.6,.2, .7,.3,.6,.2, .7,.3,.6,.2, .7,.3,.6,.2], // 8ths + ghost 16ths
  [.7,.4,.4,0,  .7,.4,.4,0,  .7,.4,.4,0,  .7,.4,.4,0 ], // gallop
  [.6,.5,.6,.5, .6,.5,.6,.5, .6,.5,.6,.5, .6,.5,.6,.5], // driving 16ths
];

// ─── Seed data ───────────────────────────────────────────────────────────────

interface SeedData {
  hihat:            number[][];  // [4 bars][16 steps] closed HH velocity
  openHH:           number[][];  // [4 bars][16 steps] open HH velocity
  fillKick:         number[];    // [16] fill kick velocities
  fillSnare:        number[];    // [16] fill snare velocities
  fillHH:           number[];    // [16] fill HH velocities (light 16ths)
  leadDensity:      number;      // 0–1: controls notes-per-bar count
  leadSyncopation:  number;      // 0=on-beat preference, 1=off-beat preference
  leadOctaveChance: number;      // 0–1: probability of playing high octave
  leadType:         string;      // oscillator/filter character for this seed
  padType:          string;      // pad voice type for this seed
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function blendPattern(a: number[], b: number[], t: number): number[] {
  return a.map((av, i) => lerp(av, b[i], t));
}

// Shell voicing: 2 → root+7th, 3 → root+3rd+7th, 4+ → all tones
function selectPadNotes(midis: number[], count: number): number[] {
  if (count >= midis.length) return midis;
  if (count === 2) return [midis[0], midis[midis.length - 1]];
  if (count === 3) return [midis[0], midis[1], midis[midis.length - 1]];
  return midis.slice(0, count);
}

// Xorshift32 seeded RNG — returns values in [0, 1)
function mkRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class MusicEngine {
  private ctx:           AudioContext | null = null;
  private masterGain!:   GainNode;
  private reverbNode!:   ConvolverNode;
  private reverbGain!:   GainNode;
  private dryGain!:      GainNode;
  private drumBus!:      GainNode;
  private bassBus!:      GainNode;
  private padBus!:       GainNode;
  private arpBus!:       GainNode;
  private leadBus!:      GainNode;
  private analyserNode!: AnalyserNode;
  private noiseBuffer:   AudioBuffer | null = null;

  private schedulerId:   ReturnType<typeof setTimeout> | null = null;
  private nextNoteTime = 0;
  private currentStep  = 0;
  private currentBar   = 0;
  private arpIndex     = 0;
  private prevSeed:      number   = DEFAULT_CONFIG.seed;
  private seedData!:     SeedData;
  private leadPattern = {
    steps: new Array(16).fill(0)     as number[],
    notes: new Array(16).fill(0)     as number[],
    high:  new Array(16).fill(false) as boolean[],
    type:  'saw-lp' as string,
  };

  private currentPadConfig: {
    step:        number;
    durMult:     number;
    velocity:    number;
    noteCount:   number;
    filterMult:  number;
    extraStep:   number | null;
    extraVel:    number;
    type:        string;
  } | null = null;

  config:    MusicConfig = { ...DEFAULT_CONFIG };
  isPlaying: boolean     = false;

  onStep: ((step: number, bar: number) => void) | null = null;

  getAnalyser(): AnalyserNode | null {
    return this.analyserNode ?? null;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.isPlaying) return;
    if (!this.ctx) {
      await this.setup();
    } else if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    this.isPlaying    = true;
    this.currentStep  = 0;
    this.currentBar   = 0;
    this.arpIndex     = 0;
    this.nextNoteTime = this.ctx!.currentTime + 0.05;
    this.schedule();
  }

  stop(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.schedulerId !== null) {
      clearTimeout(this.schedulerId);
      this.schedulerId = null;
    }
  }

  updateConfig(partial: Partial<MusicConfig>): void {
    this.config = { ...this.config, ...partial };
    if (!this.ctx) return;
    const t  = this.ctx.currentTime;
    const tc = 0.05;
    this.drumBus.gain.setTargetAtTime(this.config.drumsLevel * 0.9,                    t, tc);
    this.bassBus.gain.setTargetAtTime(this.config.bassLevel,                           t, tc);
    this.padBus.gain.setTargetAtTime( this.config.padLevel   * 0.35,                   t, tc);
    this.arpBus.gain.setTargetAtTime(
      this.config.arpEnabled ? this.config.padLevel * 0.22 : 0,                        t, tc
    );
    this.reverbGain.gain.setTargetAtTime(this.config.reverbAmount,                     t, tc);
    this.leadBus.gain.setTargetAtTime(   this.config.leadLevel * 0.28,                 t, tc);

    if (this.config.seed !== this.prevSeed) {
      this.prevSeed = this.config.seed;
      this.seedData = this.generateSeedData(this.config.seed);
    }
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  private async setup(): Promise<void> {
    this.ctx = new AudioContext();

    this.masterGain            = this.ctx.createGain();
    this.masterGain.gain.value = 0.85;

    this.analyserNode                       = this.ctx.createAnalyser();
    this.analyserNode.fftSize               = 256;
    this.analyserNode.smoothingTimeConstant = 0.8;

    this.reverbNode        = this.ctx.createConvolver();
    this.reverbNode.buffer = this.buildReverbImpulse(2.2, 2.8);
    this.reverbGain        = this.ctx.createGain();
    this.reverbGain.gain.value = this.config.reverbAmount;

    this.dryGain           = this.ctx.createGain();
    this.dryGain.gain.value = 1;

    this.drumBus = this.ctx.createGain();
    this.drumBus.gain.value = this.config.drumsLevel * 0.9;
    this.bassBus = this.ctx.createGain();
    this.bassBus.gain.value = this.config.bassLevel;
    this.padBus  = this.ctx.createGain();
    this.padBus.gain.value  = this.config.padLevel * 0.35;
    this.arpBus  = this.ctx.createGain();
    this.arpBus.gain.value  = this.config.arpEnabled ? this.config.padLevel * 0.22 : 0;
    this.leadBus = this.ctx.createGain();
    this.leadBus.gain.value = this.config.leadLevel * 0.28;

    for (const bus of [this.drumBus, this.bassBus, this.padBus, this.arpBus, this.leadBus]) {
      bus.connect(this.dryGain);
      bus.connect(this.reverbNode);
    }
    this.reverbNode.connect(this.reverbGain);
    this.reverbGain.connect(this.masterGain);
    this.dryGain.connect(this.masterGain);
    this.masterGain.connect(this.analyserNode);
    this.analyserNode.connect(this.ctx.destination);

    this.noiseBuffer = this.buildNoiseBuffer(2);
    this.seedData    = this.generateSeedData(this.config.seed);
    this.prevSeed    = this.config.seed;
  }

  private buildNoiseBuffer(seconds: number): AudioBuffer {
    const sr  = this.ctx!.sampleRate;
    const len = Math.ceil(sr * seconds);
    const buf = this.ctx!.createBuffer(1, len, sr);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private buildReverbImpulse(durationSec: number, decay: number): AudioBuffer {
    const sr  = this.ctx!.sampleRate;
    const len = Math.ceil(sr * durationSec);
    const buf = this.ctx!.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  // ── Seed data generation ──────────────────────────────────────────────────

  private generateSeedData(seed: number): SeedData {
    const rng = mkRng(seed);

    // Hi-hats: 4 bars, each picks a template with velocity jitter
    const hihat:  number[][] = [];
    const openHH: number[][] = [];

    for (let b = 0; b < 4; b++) {
      const tmplIdx = Math.floor(rng() * HH_TEMPLATES.length);
      const tmpl    = HH_TEMPLATES[tmplIdx];
      const hhBar: number[] = tmpl.map(v => v > 0 ? Math.max(0, v + (rng() - 0.5) * 0.2) : 0);
      const ohBar: number[] = new Array(16).fill(0);

      // Place 0–2 open hi-hats on "and" positions (steps 6, 7, 14, 15)
      const andPositions = [6, 7, 14, 15];
      const numOpen      = Math.floor(rng() * 3);
      const shuffled     = [...andPositions].sort(() => rng() - 0.5);
      for (let i = 0; i < numOpen; i++) {
        const pos  = shuffled[i];
        ohBar[pos] = 0.4 + rng() * 0.2;
        hhBar[pos] = 0; // suppress closed HH at open positions
      }

      hihat.push(hhBar);
      openHH.push(ohBar);
    }

    // Fill patterns (bar 3 of every 4-bar phrase)
    const fillKick:  number[] = new Array(16).fill(0);
    const fillSnare: number[] = new Array(16).fill(0);
    const fillHH:    number[] = new Array(16).fill(0);

    // Light 16th HH underneath all fill types
    for (let i = 0; i < 16; i++) fillHH[i] = 0.3 + rng() * 0.1;

    const fillType = Math.floor(rng() * 3);
    if (fillType === 0) {
      // Snare 8th roll with crescendo, kick on 1
      fillKick[0] = 0.9;
      for (let i = 0; i < 8; i++) fillSnare[i * 2] = 0.4 + (i / 7) * 0.5;
    } else if (fillType === 1) {
      // Kick on 1+3, 16th snare roll from beat 3
      fillKick[0] = 0.9;
      fillKick[8] = 0.8;
      for (let i = 8; i < 16; i++) fillSnare[i] = 0.5 + ((i - 8) / 7) * 0.4;
    } else {
      // Alternating kick/snare 8ths
      for (let i = 0; i < 8; i++) {
        if (i % 2 === 0) fillKick[i * 2]  = 0.7 + rng() * 0.2;
        else             fillSnare[i * 2] = 0.6 + rng() * 0.3;
      }
    }

    // Lead style — per-bar patterns are generated live in regenLeadPattern()
    const leadDensity      = 0.25 + rng() * 0.4;
    const leadSyncopation  = rng();
    const leadOctaveChance = 0.1  + rng() * 0.35;
    const leadTypes = ['saw-lp', 'saw-lp', 'tri-lp', 'pluck'];
    const leadType  = leadTypes[Math.floor(rng() * leadTypes.length)];
    const padTypes  = ['dual', 'chorus', 'fifths', 'fifths', 'sub-shimmer'];
    const padType   = padTypes[Math.floor(rng() * padTypes.length)];

    return { hihat, openHH, fillKick, fillSnare, fillHH, leadDensity, leadSyncopation, leadOctaveChance, leadType, padType };
  }

  // ── Scheduler ─────────────────────────────────────────────────────────────

  private schedule(): void {
    if (!this.isPlaying || !this.ctx) return;

    const stepDur = 60 / (this.config.bpm * 4);

    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this.scheduleStep(this.currentStep, this.currentBar, this.nextNoteTime);

      const step  = this.currentStep;
      const bar   = this.currentBar;
      const delay = Math.max(0, (this.nextNoteTime - this.ctx.currentTime) * 1000);
      setTimeout(() => { if (this.onStep) this.onStep(step, bar); }, delay);

      this.currentStep = (this.currentStep + 1) % 16;
      if (this.currentStep === 0) this.currentBar++;
      this.nextNoteTime += stepDur;
    }

    this.schedulerId = setTimeout(() => this.schedule(), 25);
  }

  private scheduleStep(step: number, bar: number, time: number): void {
    const mix       = this.config.electronicMix;
    const stepDur   = 60 / (this.config.bpm * 4);
    const chord     = this.getCurrentChord(bar);
    const keyPc     = NOTE_NAMES.indexOf(this.config.keyRoot);
    const sd        = this.seedData;
    const phraseBar = bar % 4;
    const isFill    = phraseBar === 3;

    // ── Drums ──────────────────────────────────────────────────────────────
    if (isFill) {
      if (sd.fillKick[step]  > 0.02) this.playKick(time,  sd.fillKick[step]);
      if (sd.fillSnare[step] > 0.02) this.playSnare(time, sd.fillSnare[step]);
      if (sd.fillHH[step]    > 0.02) this.playHihat(time, sd.fillHH[step], false);
    } else {
      const kickVel = blendPattern(KICK_A, KICK_E, mix)[step];
      if (kickVel > 0.02) this.playKick(time, kickVel);

      const rimVel = RIM_A[step] * (1 - mix);
      if (rimVel  > 0.02) this.playRim(time, rimVel);

      const snareVel = SNARE_E[step] * mix;
      if (snareVel > 0.02) this.playSnare(time, snareVel);

      const ohVel = lerp(OH_A[step], sd.openHH[phraseBar][step], mix);
      const hhVel = lerp(HH_A[step], sd.hihat[phraseBar][step],  mix);
      if (ohVel > 0.02)      this.playHihat(time, ohVel, true);
      else if (hhVel > 0.02) this.playHihat(time, hhVel, false);
    }

    // ── Bass ───────────────────────────────────────────────────────────────
    const bassVel = blendPattern(BASS_A, BASS_E, mix)[step];
    if (bassVel > 0.02) {
      const rootMidi = getChordRootMidi(keyPc, chord, 2);
      this.playBass(time, midiToFreq(rootMidi), stepDur * 3.2, bassVel);
    }

    // ── Pad ────────────────────────────────────────────────────────────────
    if (step === 0) this.regenPadConfig(bar);
    const pc     = this.currentPadConfig;
    const barDur = stepDur * 16;

    if (pc && step === pc.step) {
      const midis = getChordMidis(keyPc, chord, 3);
      const notes = selectPadNotes(midis, pc.noteCount);
      this.playPad(time, notes.map(midiToFreq), barDur * pc.durMult, pc.velocity, pc.filterMult, pc.type);
    }

    if (pc && pc.extraStep !== null && step === pc.extraStep) {
      const midis = getChordMidis(keyPc, chord, 3);
      const notes = selectPadNotes(midis, Math.min(2, pc.noteCount));
      this.playPad(time, notes.map(midiToFreq), stepDur * (16 - step) * 0.75, pc.extraVel, pc.filterMult, pc.type);
    }

    // ── Arpeggio ───────────────────────────────────────────────────────────
    if (step === 0) this.arpIndex = 0;
    const arpStride = Math.round(4 / this.config.arpSpeed);
    if (this.config.arpEnabled && step % arpStride === 0) {
      const midis = getChordMidis(keyPc, chord, 4);
      const freq  = midiToFreq(midis[this.arpIndex % midis.length]);
      this.playArp(time, freq, stepDur * 0.8, 0.75);
      this.arpIndex++;
    }

    // ── Lead melody ────────────────────────────────────────────────────────
    if (step === 0) this.regenLeadPattern(bar);
    if (this.leadPattern.steps[step] > 0.02) {
      const octave  = this.leadPattern.high[step] ? 5 : 4;
      const midis   = getChordMidis(keyPc, chord, octave);
      const noteIdx = this.leadPattern.notes[step] % midis.length;
      // Cap duration so the note never spills past the bar boundary
      const dur     = Math.min(stepDur * 1.8, stepDur * (16 - step) - 0.01);
      this.playLead(time, midiToFreq(midis[noteIdx]), dur, this.leadPattern.steps[step], this.leadPattern.type);
    }
  }

  private regenLeadPattern(bar: number): void {
    const rng        = mkRng(this.config.seed * 997 + bar);
    const sd         = this.seedData;
    const steps      = new Array(16).fill(0)     as number[];
    const notes      = new Array(16).fill(0)     as number[];
    const high       = new Array(16).fill(false) as boolean[];

    const allPool    = [0, 2, 3, 4, 6, 7, 8, 10, 12, 14, 15];
    const offBeatSet = new Set([2, 3, 6, 7, 10, 14, 15]);

    // Score each position: syncopation shifts weight toward off-beats
    const scored = allPool.map(pos => ({
      pos,
      score: (offBeatSet.has(pos) ? sd.leadSyncopation : (1 - sd.leadSyncopation)) + rng() * 0.4,
    }));
    scored.sort((a, b) => b.score - a.score);

    const numNotes = Math.max(2, Math.round(3 + sd.leadDensity * 5 + (rng() - 0.5) * 3));
    for (let i = 0; i < numNotes && i < scored.length; i++) {
      const pos  = scored[i].pos;
      steps[pos] = 0.6 + rng() * 0.35;
      notes[pos] = Math.floor(rng() * 4);
      high[pos]  = rng() < sd.leadOctaveChance;
    }

    this.leadPattern = { steps, notes, high, type: sd.leadType };
  }

  private regenPadConfig(bar: number): void {
    const phraseBar = bar % 4;
    const rng       = mkRng(this.config.seed * 1013 + bar);

    const padType = this.seedData.padType;

    // Phrase downbeat always lands — full chord, long swell
  //  if (phraseBar === 0) {
      this.currentPadConfig = {
        step:       0,
        durMult:    0.92,
        velocity:   0.85 + rng() * 0.2,
        noteCount:  4,//+ Math.floor(rng() * 2),
        filterMult: 0.7  + rng() * 0.6,
        extraStep:  rng() < 0.3 ? 8 + Math.floor(rng() * 3) : null,
        extraVel:   0.45 + rng() * 0.3,
        type:       padType,
      };
      return;
//    }

      this.currentPadConfig = null;
      return;
    // Fill bar: 40% chance to rest entirely
    // if (phraseBar === 3 && rng() < -1) {
    //   this.currentPadConfig = null;
    //   return;
    // }

    // // Other bars: 15% chance of rest
    // if (rng() < 0.15) {
    //   this.currentPadConfig = null;
    //   return;
    // }

    // // Entry step — can be anywhere on beats 1–3 (steps 0,2,4,6,8)
    // const stepPool = [0, 0, 0, 2, 2, 4, 6, 8];
    // const step     = stepPool[Math.floor(rng() * stepPool.length)];

    // const r       = rng();
    // const durMult = r < 0.4 ? 0.92 : r < 0.72 ? 0.5 : 0.15;

    // const extraStep = durMult === 0.92 && rng() < 0.3
    //   ? 8 + Math.floor(rng() * 3)
    //   : null;

    // this.currentPadConfig = {
    //   step,
    //   durMult,
    //   velocity:   0.6  + rng() * 0.6, // slightly higher velocity range for non-downbeat entries
    //   noteCount:  4   ,//+ Math.floor(rng() * 3),
    //   filterMult: 0.55 + rng() * 1.1, // wider filter range for non-downbeat entries
    //   extraStep,
    //   extraVel:   0.4  + rng() * 0.35, // velocity for extra chord hit when durMult=0.92
    //   type:       padType,
    // };
  }

  private getCurrentChord(bar: number): ChordDef {
    const prog = PROGRESSIONS[this.config.progression] ?? PROGRESSIONS['Outrun'];
    return prog[bar % prog.length];
  }

  // ── Synthesis ─────────────────────────────────────────────────────────────

  private playKick(time: number, vel: number): void {
    const ctx = this.ctx!;

    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.28);
    env.gain.setValueAtTime(vel * 1.5, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.38);
    osc.connect(env); env.connect(this.drumBus);
    osc.start(time); osc.stop(time + 0.4);

    const click = ctx.createOscillator();
    const cenv  = ctx.createGain();
    click.type = 'triangle';
    click.frequency.value = 1400;
    cenv.gain.setValueAtTime(vel * 0.45, time);
    cenv.gain.exponentialRampToValueAtTime(0.001, time + 0.012);
    click.connect(cenv); cenv.connect(this.drumBus);
    click.start(time); click.stop(time + 0.015);
  }

  private playRim(time: number, vel: number): void {
    const ctx  = this.ctx!;
    const src  = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3200;
    filter.Q.value = 1.8;
    const env = ctx.createGain();
    env.gain.setValueAtTime(vel * 0.55, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.055);
    src.connect(filter); filter.connect(env); env.connect(this.drumBus);
    src.start(time); src.stop(time + 0.07);
  }

  private playSnare(time: number, vel: number): void {
    const ctx = this.ctx!;

    const osc = ctx.createOscillator();
    const og  = ctx.createGain();
    osc.frequency.value = 185;
    og.gain.setValueAtTime(vel * 0.45, time);
    og.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
    osc.connect(og); og.connect(this.drumBus);
    osc.start(time); osc.stop(time + 0.15);

    const src  = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1500;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vel * 0.65, time);
    ng.gain.exponentialRampToValueAtTime(0.001, time + 0.17);
    src.connect(filter); filter.connect(ng); ng.connect(this.drumBus);
    src.start(time); src.stop(time + 0.2);
  }

  private playHihat(time: number, vel: number, open: boolean): void {
    const ctx  = this.ctx!;
    const src  = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 9000;
    const env = ctx.createGain();
    const dur = open ? 0.22 : 0.042;
    env.gain.setValueAtTime(vel * 0.28, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + dur);
    src.connect(filter); filter.connect(env); env.connect(this.drumBus);
    src.start(time); src.stop(time + dur + 0.01);
  }

  private playBass(time: number, freq: number, duration: number, vel: number): void {
    const ctx = this.ctx!;
    const mix = this.config.electronicMix;

    const osc = ctx.createOscillator();
    osc.type  = mix > 0.5 ? 'sawtooth' : 'triangle';
    osc.frequency.value = freq;

    const filter = ctx.createBiquadFilter();
    filter.type  = 'lowpass';
    filter.frequency.value = lerp(350, 900, mix);
    filter.Q.value = lerp(0.8, 2.5, mix);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(vel, time + 0.012);
    env.gain.setValueAtTime(vel * 0.85, time + duration * 0.6);
    env.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter); filter.connect(env); env.connect(this.bassBus);
    osc.start(time); osc.stop(time + duration + 0.01);
  }

  private playPad(time: number, freqs: number[], duration: number, velMult = 1.0, filterMult = 1.0, type = 'dual'): void {
    const ctx      = this.ctx!;
    const mix      = this.config.electronicMix;
    const attack   = Math.min(duration * 0.35, lerp(0.12, 0.28, mix));
    const baseFreq = Math.max(300, lerp(1400, 3200, mix) * filterMult);
    const oscType: OscillatorType = mix > 0.55 ? 'sawtooth' : 'triangle';
    const relT     = Math.max(attack + 0.05, duration - 0.18);

    const voice = (freq: number, detune: number, gainMult: number, cutoff = baseFreq) => {
      const osc = ctx.createOscillator();
      osc.type  = oscType;
      osc.frequency.value = freq;
      osc.detune.value    = detune;

      const filt = ctx.createBiquadFilter();
      filt.type  = 'lowpass';
      filt.frequency.value = cutoff;
      filt.Q.value = 0.6;

      const peak = 0.11 * velMult * gainMult;
      const env  = ctx.createGain();
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(peak, time + attack);
      env.gain.setValueAtTime(peak * 0.82, time + relT);
      env.gain.linearRampToValueAtTime(0, time + duration);

      osc.connect(filt); filt.connect(env); env.connect(this.padBus);
      osc.start(time); osc.stop(time + duration + 0.05);
    };

    if (type === 'chorus') {
      // Four voices at wide spread — obvious beating and shimmer
      for (const freq of freqs)
        for (const d of [-28, -8, 8, 28]) voice(freq, d, 0.6);

    } else if (type === 'fifth') {
      // Chord + perfect fifth on the root at equal weight — open, hollow
      const FIFTH = Math.pow(2, 7 / 12);
      for (const freq of freqs)        voice(freq,             0, 1.0);
      for (const d of [-6, 6])         voice(freqs[0] * FIFTH, d, 0.9, baseFreq * 1.4);

    } else if (type === 'fifths') {
      // Every chord tone paired with its perfect fifth — wide, orchestral
      const FIFTH = Math.pow(2, 7 / 12);
      for (const freq of freqs) {
        for (const d of [-6, 6]) {
          voice(freq,         d,   1.0);
          voice(freq * FIFTH, d,   0.8);
        }
      }

    } else if (type === 'sub-shimmer') {
      // Shimmer: chord voices at a bright open filter
      for (const freq of freqs)
        for (const d of [-6, 6]) voice(freq, d, 0.85, Math.min(8000, baseFreq * 2.8));

      // Sub: sine on root one octave down, heavy lowpass, prominent gain
      const sub = ctx.createOscillator();
      sub.type  = 'sine';
      sub.frequency.value = freqs[0] / 2;
      const subFilt = ctx.createBiquadFilter();
      subFilt.type  = 'lowpass';
      subFilt.frequency.value = 220;
      const subEnv  = ctx.createGain();
      const subPeak = 0.22 * velMult;
      subEnv.gain.setValueAtTime(0, time);
      subEnv.gain.linearRampToValueAtTime(subPeak, time + attack * 1.5);
      subEnv.gain.setValueAtTime(subPeak * 0.85, time + relT);
      subEnv.gain.linearRampToValueAtTime(0, time + duration);
      sub.connect(subFilt); subFilt.connect(subEnv); subEnv.connect(this.padBus);
      sub.start(time); sub.stop(time + duration + 0.05);

    } else if (type === 'deep-sine') {
      // One octave down: pure sine + detuned sine at 50% amplitude
      for (const freq of freqs) {
        const f = freq / 2;

        const o1 = ctx.createOscillator();
        o1.type = 'sawtooth';
        o1.frequency.value = f;
        const e1 = ctx.createGain();
        const p1 = 0.18 * velMult;
        e1.gain.setValueAtTime(0, time);
        e1.gain.linearRampToValueAtTime(p1, time + attack);
        e1.gain.setValueAtTime(p1 * 0.82, time + relT);
        e1.gain.linearRampToValueAtTime(0, time + duration);
        o1.connect(e1); e1.connect(this.padBus);
        o1.start(time); o1.stop(time + duration + 0.05);

        const o2 = ctx.createOscillator();
        o2.type = 'sawtooth';
        o2.frequency.value = f;
        o2.detune.value = 50;
        const e2 = ctx.createGain();
        const p2 = p1;
        e2.gain.setValueAtTime(0, time);
        e2.gain.linearRampToValueAtTime(p2, time + attack);
        e2.gain.setValueAtTime(p2 * 0.82, time + relT);
        e2.gain.linearRampToValueAtTime(0, time + duration);
        o2.connect(e2); e2.connect(this.padBus);
        o2.start(time); o2.stop(time + duration + 0.05);
      }

    } else {
      // 'dual' — two voices ±6¢, the default
      for (const freq of freqs)
        for (const d of [-6, 6]) voice(freq, d, 1.0);
    }
  }

  private playArp(time: number, freq: number, duration: number, vel: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type  = 'sawtooth';
    osc.frequency.value = freq;

    const filter = ctx.createBiquadFilter();
    filter.type  = 'bandpass';
    filter.frequency.value = freq * 2.2;
    filter.Q.value = 1.8 + this.config.electronicMix * 2;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(vel * 0.45, time + 0.006);
    env.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter); filter.connect(env); env.connect(this.arpBus);
    osc.start(time); osc.stop(time + duration + 0.01);
  }

  private playLead(time: number, freq: number, duration: number, vel: number, type = 'saw-lp'): void {
    const ctx = this.ctx!;
    const mix = this.config.electronicMix;

    type LeadSpec = {
      detunes:    number[];
      oscType:    OscillatorType;
      filterType: BiquadFilterType;
      filterFreq: number;
      filterQ:    number;
    };

    const specs: Record<string, LeadSpec> = {
      'saw-lp':   { detunes: [-8,  8],  oscType: 'sawtooth', filterType: 'lowpass',  filterFreq: lerp(1800, 4500, mix), filterQ: 1.2 },
      'tri-lp':   { detunes: [-10, 10], oscType: 'triangle', filterType: 'lowpass',  filterFreq: lerp(1600, 4000, mix), filterQ: 0.8 },
    };

    if (type === 'pluck') {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;

      // Filter envelope: open bright, snap shut
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 2.5;
      filter.frequency.setValueAtTime(lerp(4000, 9000, mix), time);
      filter.frequency.exponentialRampToValueAtTime(lerp(300, 700, mix), time + 0.18);

      // Amplitude: instant spike, fast decay to near-silence
      const env = ctx.createGain();
      env.gain.setValueAtTime(vel * 0.7, time);
      env.gain.exponentialRampToValueAtTime(vel * 0.04, time + 0.12);
      env.gain.exponentialRampToValueAtTime(0.001, time + duration);

      osc.connect(filter); filter.connect(env); env.connect(this.leadBus);
      osc.start(time); osc.stop(time + duration + 0.01);
      return;
    }

    const spec = specs[type] ?? specs['saw-lp'];

    for (const detune of spec.detunes) {
      const osc = ctx.createOscillator();
      osc.type  = spec.oscType;
      osc.frequency.value = freq;
      osc.detune.value    = detune;

      const filter = ctx.createBiquadFilter();
      filter.type  = spec.filterType;
      filter.frequency.value = spec.filterFreq;
      filter.Q.value = spec.filterQ;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(vel * 0.4, time + 0.018);
      env.gain.setValueAtTime(vel * 0.28, time + duration * 0.5);
      env.gain.exponentialRampToValueAtTime(0.001, time + duration);

      osc.connect(filter); filter.connect(env); env.connect(this.leadBus);
      osc.start(time); osc.stop(time + duration + 0.01);
    }
  }
}

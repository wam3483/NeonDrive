import {
  NOTE_NAMES, midiToFreq, getChordMidis, getChordRootMidi,
  PROGRESSIONS, type ChordDef,
} from './theory';

// ─── Config ──────────────────────────────────────────────────────────────────

export interface MusicConfig {
  bpm:           number;
  keyRoot:       string;   // e.g. 'F'
  progression:   string;   // key into PROGRESSIONS
  electronicMix: number;   // 0–1: acoustic bossa ↔ electronic
  reverbAmount:  number;   // 0–1
  bassLevel:     number;   // 0–1
  padLevel:      number;   // 0–1
  drumsLevel:    number;   // 0–1
  arpEnabled:    boolean;
  arpSpeed:      number;   // 1=quarter | 2=8th | 4=16th
}

export const DEFAULT_CONFIG: MusicConfig = {
  bpm:           100,
  keyRoot:       'F',
  progression:   'Classic',
  electronicMix: 0.35,
  reverbAmount:  0.5,
  bassLevel:     0.8,
  padLevel:      0.65,
  drumsLevel:    0.75,
  arpEnabled:    false,
  arpSpeed:      4,
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

// Closed hi-hat
const HH_A    = [.7,0,.5,0, .6,0,.5,0, .7,0,.5,0, .6,0,.5,0]; // 8th notes
const HH_E    = [.5,.4,.5,.4, .5,.4,.5,.4, .5,.4,.5,.4, .5,.4,.5,.4]; // 16ths

// Open hi-hat: on the "and" of 2 and 4
const OH_A    = [0,0,0,0, 0,0,0,.5, 0,0,0,0, 0,0,0,.5];
const OH_E    = [0,0,0,0, 0,0,.4,0, 0,0,0,0, 0,0,.4,0];

// Bass patterns: 1 = play root, 0 = rest
// Acoustic bossa: root on 1, "and of 2", "and of 3"
const BASS_A  = [1,0,0,0, 0,0,1,0, 0,1,0,0, 0,0,0,0];
// Electronic: quarter-note pump
const BASS_E  = [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function blendPattern(a: number[], b: number[], t: number): number[] {
  return a.map((av, i) => lerp(av, b[i], t));
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class MusicEngine {
  private ctx:             AudioContext | null = null;
  private masterGain!:     GainNode;
  private reverbNode!:     ConvolverNode;
  private reverbGain!:     GainNode;
  private dryGain!:        GainNode;
  private drumBus!:        GainNode;
  private bassBus!:        GainNode;
  private padBus!:         GainNode;
  private arpBus!:         GainNode;
  private analyserNode!:   AnalyserNode;
  private noiseBuffer:     AudioBuffer | null = null;

  private schedulerId:     ReturnType<typeof setTimeout> | null = null;
  private nextNoteTime  =  0;
  private currentStep   =  0;
  private currentBar    =  0;
  private arpIndex      =  0;

  config:    MusicConfig = { ...DEFAULT_CONFIG };
  isPlaying: boolean     = false;

  /** Called (from main thread, timed to audio) on every 16th-note step */
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
    const t = this.ctx.currentTime;
    const tc = 0.05; // smoothing time constant
    this.drumBus.gain.setTargetAtTime(this.config.drumsLevel * 0.9, t, tc);
    this.bassBus.gain.setTargetAtTime(this.config.bassLevel,        t, tc);
    this.padBus.gain.setTargetAtTime(this.config.padLevel  * 0.35,  t, tc);
    this.arpBus.gain.setTargetAtTime(
      this.config.arpEnabled ? this.config.padLevel * 0.22 : 0,     t, tc
    );
    this.reverbGain.gain.setTargetAtTime(this.config.reverbAmount,  t, tc);
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  private async setup(): Promise<void> {
    this.ctx = new AudioContext();

    this.masterGain  = this.ctx.createGain();
    this.masterGain.gain.value = 0.85;

    this.analyserNode           = this.ctx.createAnalyser();
    this.analyserNode.fftSize   = 256;
    this.analyserNode.smoothingTimeConstant = 0.8;

    // Reverb
    this.reverbNode   = this.ctx.createConvolver();
    this.reverbNode.buffer = this.buildReverbImpulse(2.2, 2.8);
    this.reverbGain   = this.ctx.createGain();
    this.reverbGain.gain.value = this.config.reverbAmount;

    // Dry / wet
    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 1;

    // Instrument buses
    this.drumBus = this.ctx.createGain();
    this.drumBus.gain.value = this.config.drumsLevel * 0.9;
    this.bassBus = this.ctx.createGain();
    this.bassBus.gain.value = this.config.bassLevel;
    this.padBus  = this.ctx.createGain();
    this.padBus.gain.value  = this.config.padLevel * 0.35;
    this.arpBus  = this.ctx.createGain();
    this.arpBus.gain.value  = this.config.arpEnabled ? this.config.padLevel * 0.22 : 0;

    // Route all buses to both dry and reverb
    for (const bus of [this.drumBus, this.bassBus, this.padBus, this.arpBus]) {
      bus.connect(this.dryGain);
      bus.connect(this.reverbNode);
    }
    this.reverbNode.connect(this.reverbGain);
    this.reverbGain.connect(this.masterGain);
    this.dryGain.connect(this.masterGain);
    this.masterGain.connect(this.analyserNode);
    this.analyserNode.connect(this.ctx.destination);

    this.noiseBuffer = this.buildNoiseBuffer(2);
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

  // ── Scheduler ─────────────────────────────────────────────────────────────

  private schedule(): void {
    if (!this.isPlaying || !this.ctx) return;

    const stepDur = 60 / (this.config.bpm * 4); // 16th-note duration in seconds

    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this.scheduleStep(this.currentStep, this.currentBar, this.nextNoteTime);

      // Fire UI callback timed to the actual audio beat
      const step = this.currentStep;
      const bar  = this.currentBar;
      const delay = Math.max(0, (this.nextNoteTime - this.ctx.currentTime) * 1000);
      setTimeout(() => { if (this.onStep) this.onStep(step, bar); }, delay);

      this.currentStep = (this.currentStep + 1) % 16;
      if (this.currentStep === 0) this.currentBar++;
      this.nextNoteTime += stepDur;
    }

    this.schedulerId = setTimeout(() => this.schedule(), 25);
  }

  private scheduleStep(step: number, bar: number, time: number): void {
    const mix     = this.config.electronicMix;
    const stepDur = 60 / (this.config.bpm * 4);
    const chord   = this.getCurrentChord(bar);
    const keyPc   = NOTE_NAMES.indexOf(this.config.keyRoot);

    // ── Drums ──────────────────────────────────────────────────────────────
    const kickVel = blendPattern(KICK_A, KICK_E, mix)[step];
    if (kickVel > 0.02) this.playKick(time, kickVel);

    const rimVel  = RIM_A[step] * (1 - mix);
    if (rimVel  > 0.02) this.playRim(time, rimVel);

    const snareVel = SNARE_E[step] * mix;
    if (snareVel > 0.02) this.playSnare(time, snareVel);

    const ohVel = blendPattern(OH_A, OH_E, mix)[step];
    const hhVel = blendPattern(HH_A, HH_E, mix)[step];
    if (ohVel > 0.02)      this.playHihat(time, ohVel, true);
    else if (hhVel > 0.02) this.playHihat(time, hhVel, false);

    // ── Bass ───────────────────────────────────────────────────────────────
    const bassVel = blendPattern(BASS_A, BASS_E, mix)[step];
    if (bassVel > 0.02) {
      const rootMidi = getChordRootMidi(keyPc, chord, 2);
      this.playBass(time, midiToFreq(rootMidi), stepDur * 3.2, bassVel);
    }

    // ── Pad: new chord on bar downbeat ─────────────────────────────────────
    if (step === 0) {
      const barDur = stepDur * 16;
      const midis  = getChordMidis(keyPc, chord, 3);
      this.playPad(time, midis.map(midiToFreq), barDur * 0.92);
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
  }

  private getCurrentChord(bar: number): ChordDef {
    const prog = PROGRESSIONS[this.config.progression] ?? PROGRESSIONS['Classic'];
    return prog[bar % prog.length];
  }

  // ── Synthesis ─────────────────────────────────────────────────────────────

  private playKick(time: number, vel: number): void {
    const ctx = this.ctx!;

    // Body: sine with pitch fall
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.28);
    env.gain.setValueAtTime(vel * 1.5, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.38);
    osc.connect(env); env.connect(this.drumBus);
    osc.start(time); osc.stop(time + 0.4);

    // Click transient
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

    // Tone layer
    const osc = ctx.createOscillator();
    const og  = ctx.createGain();
    osc.frequency.value = 185;
    og.gain.setValueAtTime(vel * 0.45, time);
    og.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
    osc.connect(og); og.connect(this.drumBus);
    osc.start(time); osc.stop(time + 0.15);

    // Noise layer
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
    osc.type  = mix > 0.5 ? 'sawtooth' : 'sine';
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

  private playPad(time: number, freqs: number[], duration: number): void {
    const ctx    = this.ctx!;
    const mix    = this.config.electronicMix;
    const attack = lerp(0.12, 0.28, mix);

    for (const freq of freqs) {
      for (const detune of [-6, 6]) {
        const osc   = ctx.createOscillator();
        osc.type    = mix > 0.55 ? 'sawtooth' : 'triangle';
        osc.frequency.value = freq;
        osc.detune.value    = detune;

        const filter = ctx.createBiquadFilter();
        filter.type  = 'lowpass';
        filter.frequency.value = lerp(1400, 3200, mix);
        filter.Q.value = 0.6;

        const env = ctx.createGain();
        env.gain.setValueAtTime(0, time);
        env.gain.linearRampToValueAtTime(0.11, time + attack);
        env.gain.setValueAtTime(0.09, time + duration - 0.35);
        env.gain.linearRampToValueAtTime(0, time + duration);

        osc.connect(filter); filter.connect(env); env.connect(this.padBus);
        osc.start(time); osc.stop(time + duration + 0.05);
      }
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
}

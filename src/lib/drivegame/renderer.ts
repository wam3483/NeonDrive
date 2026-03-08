import { Graphics, Text } from 'pixi.js';
import { SunsetRenderer } from '$lib/sunset';
import type { PaletteConfig, RoadRenderContext } from '$lib/sunset';
import { generateTrack, computeTargetCurveOffset } from './track';
import type { TrackPt } from './track';
import { createCarRenderer } from './car';
import type { CarRenderer, CarStyle } from './car';
import { SceneryManager } from './scenery';
import { CassetteMinigame } from './cassette';

export type { CarStyle } from './car';

export class DriveGameRenderer extends SunsetRenderer {
  // ── car ────────────────────────────────────────────────────────────────────
  private carDepth = 0.82;
  private car: CarRenderer = createCarRenderer('classic');

  // ── scenery ─────────────────────────────────────────────────────────────
  private scenery = new SceneryManager();

  // ── track & steering state ────────────────────────────────────────────────
  private trackPoints: TrackPt[] = [];
  private trackT = 0;
  private lateralOffset = 0;
  private curveOffset = 0;
  private carLean = 0;

  // ── cassette minigame ────────────────────────────────────────────────────
  private cassette = new CassetteMinigame();
  private paused = false;

  // ── FPS display ──────────────────────────────────────────────────────────
  private showFps = false;
  private fpsText: Text | null = null;
  private fpsFrames = 0;
  private fpsElapsed = 0;
  private fpsDisplay = 0;

  // ── input ─────────────────────────────────────────────────────────────────
  private keysDown = new Set<string>();
  private onKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (key === 'c') {
      this.toggleCassette();
      return;
    }
    if (!this.paused) this.keysDown.add(key);
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keysDown.delete(e.key.toLowerCase()); };

  // ── public API ─────────────────────────────────────────────────────────────
  setShowFps(show: boolean): void {
    this.showFps = show;
    if (!show && this.fpsText) {
      this.fpsText.destroy();
      this.fpsText = null;
    }
  }

  setCarStyle(style: CarStyle): void {
    this.car = createCarRenderer(style);
    const g = this.findByLabel('car');
    if (g) { g.clear(); this.renderCarGraphics(g); }
  }

  async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
    await super.init(canvas, width, height);
    this.trackPoints = generateTrack();
    this.scenery.generate(this.trackPoints);
    this.scenery.bakeTextures(this.app.renderer, this.getActivePalette());
    this.app.stage.addChild(this.cassette.container);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup',   this.onKeyUp);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup',   this.onKeyUp);
    this.cassette.destroy();
    this.scenery.destroy();
    super.destroy();
  }

  private toggleCassette(): void {
    if (this.paused) {
      this.cassette.hide();
      this.paused = false;
      this.keysDown.clear();
    } else {
      this.paused = true;
      this.keysDown.clear();
      this.cassette.show(this.app.canvas as HTMLCanvasElement, this.width, this.height);
    }
  }

  // ── overrides ─────────────────────────────────────────────────────────────
  protected override render(): void {
    super.render();
    this.container.addChild(this.scenery.container);
    this.drawCar();
  }

  protected override animate(ticker: { deltaTime: number }): void {
    if (this.paused) {
      this.cassette.update(ticker.deltaTime);
      this.updateFps(ticker.deltaTime);
      return;
    }
    super.animate(ticker);
    this.processInput(ticker.deltaTime);
    this.scenery.update({
      width: this.width,
      height: this.height,
      animationTime: this.animationTime,
      curveOffset: this.curveOffset,
      trackPoints: this.trackPoints,
      trackT: this.trackT,
    });
    this.updateCar();
    this.updateFps(ticker.deltaTime);
  }

  protected override buildRoadCtx(horizonY: number, palette: PaletteConfig): RoadRenderContext {
    return { ...super.buildRoadCtx(horizonY, palette), curveOffset: this.curveOffset };
  }

  // ── per-frame update ───────────────────────────────────────────────────────
  private updateFps(dt: number): void {
    if (!this.showFps) return;
    this.fpsFrames++;
    this.fpsElapsed += dt / 60;
    if (this.fpsElapsed >= 0.5) {
      this.fpsDisplay = Math.round(this.fpsFrames / this.fpsElapsed);
      this.fpsFrames = 0;
      this.fpsElapsed = 0;
    }
    if (!this.fpsText) {
      this.fpsText = new Text({ text: '', style: { fontFamily: 'monospace', fontSize: 14, fill: 0x00ff00 } });
      this.fpsText.position.set(4, 4);
      this.app.stage.addChild(this.fpsText);
    }
    this.fpsText.text = `${this.fpsDisplay} fps`;
  }

  private processInput(dt: number): void {
    const N          = this.trackPoints.length;
    const baseSpeed  = 0.4 * dt;
    const turnSpeed  = 0.022 * dt;

    const speedMult =
      (this.keysDown.has('w') || this.keysDown.has('arrowup'))   ? 2.0 :
      (this.keysDown.has('s') || this.keysDown.has('arrowdown')) ? 0.2 : 1.0;

    this.trackT += baseSpeed * speedMult;
    this.trackT  = ((this.trackT % N) + N) % N;

    const turnInput =
      (this.keysDown.has('a') || this.keysDown.has('arrowleft'))  ? -1 :
      (this.keysDown.has('d') || this.keysDown.has('arrowright')) ? +1 : 0;

    this.lateralOffset += turnInput * turnSpeed;
    this.lateralOffset  = Math.max(-0.85, Math.min(0.85, this.lateralOffset));

    if (turnInput === 0) this.lateralOffset *= Math.pow(0.97, dt);

    const driftRate = (this.curveOffset / (this.width * 20)) * dt;
    this.lateralOffset = Math.max(-0.85, Math.min(0.85, this.lateralOffset + driftRate));

    const target = computeTargetCurveOffset(this.trackPoints, this.trackT);
    this.curveOffset += (target - this.curveOffset) * Math.min(1, 0.04 * dt);

    this.carLean += (turnInput - this.carLean) * Math.min(1, 0.12 * dt);
  }

  // ── car drawing ────────────────────────────────────────────────────────────
  private getCarScreenPos() {
    const horizonY = this.height * 0.55;
    const groundH  = this.height - horizonY;
    const cx       = this.width / 2;
    const spread   = this.width * 1.5;

    const screenY             = horizonY + this.carDepth * groundH;
    const roadHalfAtDepth     = this.carDepth * (spread / 2);
    const screenX             = cx + this.lateralOffset * roadHalfAtDepth * 0.6;
    const scale               = this.carDepth;

    return { x: screenX, y: screenY, scale };
  }

  private drawCar(): void {
    const g = new Graphics();
    g.label = 'car';
    this.renderCarGraphics(g);
    this.container.addChild(g);
  }

  private updateCar(): void {
    const g = this.findByLabel('car');
    if (!g) return;
    g.clear();
    this.renderCarGraphics(g);
  }

  private renderCarGraphics(g: Graphics): void {
    this.car.render(g, this.getCarScreenPos(), this.animationTime, this.getActivePalette());
  }
}

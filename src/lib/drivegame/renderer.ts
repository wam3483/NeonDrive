import { Graphics, Text, Container, RenderTexture, Sprite } from 'pixi.js';
import { SunsetRenderer } from '$lib/sunset';
import type { PaletteConfig, RoadRenderContext } from '$lib/sunset';
import { Random } from '$lib/map/random';

export type CarStyle = 'classic' | 'sport';

// ---------------------------------------------------------------------------
// Roadside scenery
// ---------------------------------------------------------------------------
interface RoadsideSprite {
  type: 'palm' | 'rock';
  side: -1 | 1;
  z: number;          // 0–1 loop phase (position along the scroll cycle)
  extraFrac: number;  // lateral offset beyond guard rail, in halfBottom units
  scaleVar: number;   // random scale multiplier
  seed: number;       // for deterministic shape generation
  variant: number;    // index into baked texture pool for this type
}

interface TrackObstacle {
  type: 'fallenPalm';
  trackIndex: number; // fixed position on track (0 … N-1)
  lateralOffset: number; // -1 … +1 across road width
  variant: number;
}

interface TrackBillboard {
  trackIndex: number; // fixed position on track (0 … N-1)
  side: -1 | 1;
  extraFrac: number;
  scaleVar: number;
  seed: number;
  variant: number;    // index into baked billboard texture pool
}

// ---------------------------------------------------------------------------
// Closed-loop track definition
// ---------------------------------------------------------------------------
interface TrackPt { x: number; y: number; }

/**
 * Generate a smooth closed-loop track in an arbitrary world-space coordinate
 * system (units don't matter — only ratios/angles are used for curvature).
 * Multi-frequency polar oval so there's a healthy variety of curves.
 */
function generateTrack(N = 300): TrackPt[] {
  // Figure-8 (lemniscate-ish) gives equal left and right turns
  // with long straight-ish stretches between the lobes.
  const pts: TrackPt[] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    // Base figure-8: x = sin(t), y = sin(2t)/2
    // Scaled up and gently perturbed so it's not perfectly symmetric
    const fx = Math.sin(t);
    const fy = Math.sin(2 * t) * 0.45;
    // Small wobble for variety
    const wx = 0.06 * Math.sin(3 * t + 1.2);
    const wy = 0.04 * Math.sin(5 * t + 0.7);
    pts.push({ x: (fx + wx) * 500, y: (fy + wy) * 400 });
  }
  return pts;
}

// ---------------------------------------------------------------------------
// DriveGameRenderer
// ---------------------------------------------------------------------------
export class DriveGameRenderer extends SunsetRenderer {
  // ── car visual state ──────────────────────────────────────────────────────
  private carDepth = 0.82;    // 0 = horizon, 1 = bottom; kept fixed for Out Run feel
  private carStyle: CarStyle = 'classic';

  // ── roadside scenery ──────────────────────────────────────────────────────
  private roadsideSprites: RoadsideSprite[] = [];
  private trackBillboards: TrackBillboard[] = [];

  // ── road obstacles ───────────────────────────────────────────────────────
  private trackObstacles: TrackObstacle[] = [];

  // ── baked sprite textures ───────────────────────────────────────────────
  private bakedPalms: RenderTexture[] = [];
  private bakedRocks: RenderTexture[] = [];
  private bakedBillboards: RenderTexture[] = [];
  private bakedFallenPalms: RenderTexture[] = [];
  private roadsideContainer: Container = new Container();
  private spritePool: Sprite[] = [];

  // ── track & steering state ────────────────────────────────────────────────
  private trackPoints: TrackPt[] = [];
  /** Fractional index into trackPoints (wraps 0 … N). */
  private trackT = 0;
  /** Car's lateral position across the road. -1 = left edge, +1 = right edge. */
  private lateralOffset = 0;
  /** Smoothed screen-pixel shift of the vanishing point (positive = curve right). */
  private curveOffset = 0;
  /** Visual lean for steering feedback (-1 … +1). */
  private carLean = 0;

  // ── FPS display ──────────────────────────────────────────────────────────
  private showFps = false;
  private fpsText: Text | null = null;
  private fpsFrames = 0;
  private fpsElapsed = 0;
  private fpsDisplay = 0;

  // ── input ─────────────────────────────────────────────────────────────────
  private keysDown = new Set<string>();
  private onKeyDown = (e: KeyboardEvent) => { this.keysDown.add(e.key.toLowerCase()); };
  private onKeyUp   = (e: KeyboardEvent) => { this.keysDown.delete(e.key.toLowerCase()); };

  // ── public API ─────────────────────────────────────────────────────────────
  setShowFps(show: boolean): void {
    this.showFps = show;
    if (!show && this.fpsText) {
      this.fpsText.destroy();
      this.fpsText = null;
    }
  }

  setCarStyle(style: CarStyle): void {
    this.carStyle = style;
    const g = this.findByLabel('car');
    if (g) { g.clear(); this.renderCarGraphics(g); }
  }

  async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
    await super.init(canvas, width, height);
    this.trackPoints = generateTrack();
    this.generateRoadsideSprites();
    this.bakeRoadsideTextures();
    this.roadsideContainer.label = 'roadside';
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup',   this.onKeyUp);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup',   this.onKeyUp);
    for (const t of [...this.bakedPalms, ...this.bakedRocks, ...this.bakedBillboards, ...this.bakedFallenPalms]) t.destroy(true);
    this.bakedPalms = [];
    this.bakedRocks = [];
    this.bakedBillboards = [];
    this.bakedFallenPalms = [];
    this.spritePool = [];
    super.destroy();
  }

  // ── overrides ─────────────────────────────────────────────────────────────
  protected override render(): void {
    super.render();
    this.drawRoadsideSprites();
    this.drawCar();
  }

  protected override animate(ticker: { deltaTime: number }): void {
    super.animate(ticker);
    this.processInput(ticker.deltaTime);
    this.updateRoadsideSprites();
    this.updateCar();
    this.updateFps(ticker.deltaTime);
  }

  /**
   * Override buildRoadCtx so that both drawRoad() and updateRoad() in the
   * base class automatically receive the live curveOffset via polymorphism.
   */
  protected override buildRoadCtx(horizonY: number, palette: PaletteConfig): RoadRenderContext {
    return { ...super.buildRoadCtx(horizonY, palette), curveOffset: this.curveOffset };
  }

  // ── track helpers ──────────────────────────────────────────────────────────
  /**
   * Normalised forward tangent at fractional track position t.
   * Uses a 2-step central difference for smoothness.
   */
  private getTrackTangent(t: number): { dx: number; dy: number } {
    const N  = this.trackPoints.length;
    const i0 = ((Math.floor(t) - 1 + N) % N);
    const i2 = ((Math.floor(t) + 1) % N);
    const p0 = this.trackPoints[i0];
    const p2 = this.trackPoints[i2];
    const dx = p2.x - p0.x;
    const dy = p2.y - p0.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { dx: dx / len, dy: dy / len };
  }

  /**
   * Look ahead on the track and compute the signed curvature as a
   * screen-pixel vanishing-point offset.
   *
   * Convention (screen coords, y-down):
   *   positive cross product  →  clockwise turn  →  curve right  →  curveOffset > 0
   *   negative cross product  →  counter-clockwise →  curve left  →  curveOffset < 0
   */
  private computeTargetCurveOffset(): number {
    const N = this.trackPoints.length;
    if (N < 4) return 0;
    const lookAhead = Math.max(4, Math.floor(N * 0.08));
    const tang0 = this.getTrackTangent(this.trackT);
    const tang1 = this.getTrackTangent((this.trackT + lookAhead) % N);
    const cross  = tang0.dx * tang1.dy - tang0.dy * tang1.dx;
    return Math.max(-280, Math.min(280, cross * 380));
  }

  // ── per-frame update ───────────────────────────────────────────────────────
  private updateFps(dt: number): void {
    if (!this.showFps) return;
    this.fpsFrames++;
    this.fpsElapsed += dt / 60; // dt is in frames at 60fps, convert to seconds
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
    const baseSpeed  = 0.4 * dt;   // track points per tick at 60 fps
    const turnSpeed  = 0.022 * dt;

    // W/S adjust track advance speed; default is always moving forward
    const speedMult =
      (this.keysDown.has('w') || this.keysDown.has('arrowup'))   ? 2.0 :
      (this.keysDown.has('s') || this.keysDown.has('arrowdown')) ? 0.2 : 1.0;

    this.trackT += baseSpeed * speedMult;
    this.trackT  = ((this.trackT % N) + N) % N;   // loop around

    // A/D: lateral steering
    const turnInput =
      (this.keysDown.has('a') || this.keysDown.has('arrowleft'))  ? -1 :
      (this.keysDown.has('d') || this.keysDown.has('arrowright')) ? +1 : 0;

    this.lateralOffset += turnInput * turnSpeed;
    this.lateralOffset  = Math.max(-0.85, Math.min(0.85, this.lateralOffset));

    // Gentle drift toward centre when not steering
    if (turnInput === 0) this.lateralOffset *= Math.pow(0.97, dt);

    // Road centrifugal drift: subtle outward push during curves
    const driftRate = (this.curveOffset / (this.width * 20)) * dt;
    this.lateralOffset = Math.max(-0.85, Math.min(0.85, this.lateralOffset + driftRate));

    // Smooth curve offset toward target (eased over ~25 frames)
    const target = this.computeTargetCurveOffset();
    this.curveOffset += (target - this.curveOffset) * Math.min(1, 0.04 * dt);

    // Visual lean follows steering (eased over ~10 frames)
    this.carLean += (turnInput - this.carLean) * Math.min(1, 0.12 * dt);
  }

  // ── car screen position ────────────────────────────────────────────────────
  private getCarScreenPos(): { x: number; y: number; scale: number } {
    const horizonY = this.height * 0.55;
    const groundH  = this.height - horizonY;
    const cx       = this.width / 2;
    const spread   = this.width * 1.5;

    const screenY             = horizonY + this.carDepth * groundH;
    // Lateral offset maps to road half-width at the car's depth, same
    // perspective as the road renderer so the car sits naturally on the road.
    const roadHalfAtDepth     = this.carDepth * (spread / 2);
    const screenX             = cx + this.lateralOffset * roadHalfAtDepth * 0.6;
    const scale               = this.carDepth;

    return { x: screenX, y: screenY, scale };
  }

  // ── car drawing ────────────────────────────────────────────────────────────
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
    if (this.carStyle === 'sport') {
      this.renderSportCar(g);
    } else {
      this.renderClassicCar(g);
    }
  }

  // ---------------------------------------------------------------------------
  // Classic JDM sedan — boxy, tall cabin, two warm rectangular taillights
  // ---------------------------------------------------------------------------
  private renderClassicCar(g: Graphics): void {
    const { x, y, scale } = this.getCarScreenPos();
    const palette = this.getActivePalette();
    const s = scale;

    // 3x base dimensions for prominent size
    const w = 260 * s;
    const bodyH = 105 * s;
    const cabinH = 78 * s;
    const bumperH = 16 * s;

    const bodyTop  = y - bodyH;
    const bodyLeft = x - w / 2;
    const pulseAlpha = 0.3 + 0.25 * Math.sin(this.animationTime * 2.5);

    // --- Road reflection (warm glow on asphalt beneath car) ---
    for (let i = 7; i >= 0; i--) {
      const spread = (i + 1) * 8 * s;
      const alpha = 0.05 * (1 - i / 7);
      g.rect(bodyLeft - spread * 0.5, y, w + spread, spread + 3 * s);
      g.fill({ color: 0xff6030, alpha });
    }

    // --- Neon underglow ---
    for (let i = 6; i >= 0; i--) {
      const spread = (i + 1) * 6 * s;
      const alpha = 0.09 * (1 - i / 6);
      g.rect(bodyLeft - spread, y - 3 * s, w + spread * 2, spread + 3 * s);
      g.fill({ color: palette.gridColor, alpha });
    }

    // --- Bumper ---
    const bumperLeft = bodyLeft - 4 * s;
    const bumperW = w + 8 * s;
    g.rect(bumperLeft, y - bumperH, bumperW, bumperH);
    g.fill(0x0c0c1a);
    // Bumper chrome strip
    g.rect(bumperLeft + 6 * s, y - bumperH + 2 * s, bumperW - 12 * s, 2.5 * s);
    g.fill({ color: 0x888899, alpha: 0.35 });
    // Bumper lower edge highlight
    g.moveTo(bumperLeft + 2 * s, y - 1 * s);
    g.lineTo(bumperLeft + bumperW - 2 * s, y - 1 * s);
    g.stroke({ width: 1 * s, color: 0x333355, alpha: 0.5 });
    // Bumper outline
    g.rect(bumperLeft, y - bumperH, bumperW, bumperH);
    g.stroke({ width: 1 * s, color: 0x2a2a44, alpha: 0.6 });

    // --- Rear reflectors in bumper ---
    const refW = 8 * s;
    const refH = 3 * s;
    const refY = y - bumperH * 0.45;
    g.rect(bumperLeft + 10 * s, refY, refW, refH);
    g.fill({ color: 0xff3030, alpha: 0.6 });
    g.rect(bumperLeft + bumperW - 10 * s - refW, refY, refW, refH);
    g.fill({ color: 0xff3030, alpha: 0.6 });

    // --- Main body panel ---
    const panelH = bodyH - bumperH;
    g.rect(bodyLeft, bodyTop, w, panelH);
    g.fill(0x12122a);

    // Horizontal body creases
    const crease1Y = bodyTop + panelH * 0.38;
    const crease2Y = bodyTop + panelH * 0.65;
    g.moveTo(bodyLeft + 4 * s, crease1Y);
    g.lineTo(bodyLeft + w - 4 * s, crease1Y);
    g.stroke({ width: 0.8 * s, color: 0x1a1a38, alpha: 0.9 });
    g.moveTo(bodyLeft + 6 * s, crease2Y);
    g.lineTo(bodyLeft + w - 6 * s, crease2Y);
    g.stroke({ width: 0.6 * s, color: 0x1e1e3c, alpha: 0.6 });

    // Vertical panel lines (separating trunk from quarters)
    const panelLineInset = 22 * s;
    g.moveTo(bodyLeft + panelLineInset, bodyTop + 4 * s);
    g.lineTo(bodyLeft + panelLineInset, bodyTop + panelH - 2 * s);
    g.stroke({ width: 0.5 * s, color: 0x1a1a38, alpha: 0.5 });
    g.moveTo(bodyLeft + w - panelLineInset, bodyTop + 4 * s);
    g.lineTo(bodyLeft + w - panelLineInset, bodyTop + panelH - 2 * s);
    g.stroke({ width: 0.5 * s, color: 0x1a1a38, alpha: 0.5 });

    // --- Wheel arches (dark semi-circles peeking at bottom corners) ---
    const archR = 18 * s;
    const archY = y - bumperH;
    // Left arch
    g.arc(bodyLeft + 8 * s, archY, archR, -Math.PI, 0);
    g.fill(0x060612);
    // Right arch
    g.arc(bodyLeft + w - 8 * s, archY, archR, -Math.PI, 0);
    g.fill(0x060612);

    // --- Cabin (trapezoidal, taller for boxy sedan) ---
    const cabInset = w * 0.10;
    const cabTopInset = w * 0.16;
    const cabinTop = bodyTop - cabinH;
    g.poly([
      bodyLeft + cabInset, bodyTop,
      bodyLeft + w - cabInset, bodyTop,
      bodyLeft + w - cabTopInset, cabinTop,
      bodyLeft + cabTopInset, cabinTop,
    ]);
    g.fill(0x0e0e22);

    // Cabin side pillars (C-pillars, darker strips)
    const pillarW = 6 * s;
    // Left C-pillar
    g.poly([
      bodyLeft + cabInset, bodyTop,
      bodyLeft + cabInset + pillarW, bodyTop,
      bodyLeft + cabTopInset + pillarW * 0.8, cabinTop,
      bodyLeft + cabTopInset, cabinTop,
    ]);
    g.fill(0x0a0a1c);
    // Right C-pillar
    g.poly([
      bodyLeft + w - cabInset - pillarW, bodyTop,
      bodyLeft + w - cabInset, bodyTop,
      bodyLeft + w - cabTopInset, cabinTop,
      bodyLeft + w - cabTopInset - pillarW * 0.8, cabinTop,
    ]);
    g.fill(0x0a0a1c);

    // --- Roof edge (thin highlight along cabin top) ---
    g.moveTo(bodyLeft + cabTopInset, cabinTop);
    g.lineTo(bodyLeft + w - cabTopInset, cabinTop);
    g.stroke({ width: 1.2 * s, color: 0x222244, alpha: 0.7 });

    // --- Rear windshield ---
    const winPad = 8 * s;
    const winBotInset = cabInset + winPad;
    const winTopInset = cabTopInset + winPad;
    const winTop = cabinTop + 6 * s;
    const winBot = bodyTop - 3 * s;
    g.poly([
      bodyLeft + winBotInset, winBot,
      bodyLeft + w - winBotInset, winBot,
      bodyLeft + w - winTopInset, winTop,
      bodyLeft + winTopInset, winTop,
    ]);
    g.fill({ color: palette.gridColor, alpha: 0.15 });

    // Defroster lines (horizontal stripes across rear window)
    const defLines = 8;
    for (let i = 1; i < defLines; i++) {
      const t = i / defLines;
      const ly = winTop + t * (winBot - winTop);
      const leftT = winTopInset + t * (winBotInset - winTopInset);
      const rightT = winTopInset + t * (winBotInset - winTopInset);
      g.moveTo(bodyLeft + leftT + 3 * s, ly);
      g.lineTo(bodyLeft + w - rightT - 3 * s, ly);
      g.stroke({ width: 0.4 * s, color: palette.gridColor, alpha: 0.12 });
    }

    // Window frame
    g.poly([
      bodyLeft + winBotInset, winBot,
      bodyLeft + w - winBotInset, winBot,
      bodyLeft + w - winTopInset, winTop,
      bodyLeft + winTopInset, winTop,
    ]);
    g.closePath();
    g.stroke({ width: 1 * s, color: palette.gridColor, alpha: 0.3 });

    // --- Taillights (tall rectangular, warm amber, with internal segments) ---
    const tailW = 24 * s;
    const tailH = 28 * s;
    const tailY = bodyTop + 10 * s;
    const tailInset = 8 * s;

    this.drawRectTaillight(g, bodyLeft + tailInset, tailY, tailW, tailH, s, 0xff8020, palette);
    this.drawRectTaillight(g, bodyLeft + w - tailInset - tailW, tailY, tailW, tailH, s, 0xff8020, palette);

    // --- Trunk badge (small circle emblem) ---
    const badgeR = 5 * s;
    const badgeY = bodyTop + panelH * 0.3;
    g.circle(x, badgeY, badgeR);
    g.fill({ color: 0x888899, alpha: 0.25 });
    g.circle(x, badgeY, badgeR);
    g.stroke({ width: 0.8 * s, color: 0x666688, alpha: 0.4 });

    // --- License plate ---
    const plateW = 40 * s;
    const plateH = 14 * s;
    const plateX = x - plateW / 2;
    const plateY = y - bumperH - plateH - 4 * s;
    g.rect(plateX, plateY, plateW, plateH);
    g.fill(0xd0d0c0);
    // Plate text hint (dark line)
    g.moveTo(plateX + 6 * s, plateY + plateH * 0.55);
    g.lineTo(plateX + plateW - 6 * s, plateY + plateH * 0.55);
    g.stroke({ width: 1.5 * s, color: 0x333333, alpha: 0.5 });
    g.rect(plateX, plateY, plateW, plateH);
    g.stroke({ width: 0.8 * s, color: 0x555555, alpha: 0.8 });
    // Plate light (small glow above plate)
    g.rect(plateX + plateW * 0.3, plateY - 2 * s, plateW * 0.4, 2 * s);
    g.fill({ color: 0xffffee, alpha: 0.25 });

    // --- Neon outlines (pulsing) ---
    // Body outline
    g.rect(bodyLeft, bodyTop, w, panelH);
    g.stroke({ width: 1.2 * s, color: palette.gridColor, alpha: pulseAlpha });

    // Cabin outline
    g.poly([
      bodyLeft + cabInset, bodyTop,
      bodyLeft + w - cabInset, bodyTop,
      bodyLeft + w - cabTopInset, cabinTop,
      bodyLeft + cabTopInset, cabinTop,
    ]);
    g.closePath();
    g.stroke({ width: 1 * s, color: palette.gridColor, alpha: pulseAlpha * 0.6 });
  }

  // ---------------------------------------------------------------------------
  // Sport car — Countach-style wide-body exotic, navy/steel blue
  // ---------------------------------------------------------------------------
  private renderSportCar(g: Graphics): void {
    const { x, y, scale } = this.getCarScreenPos();
    const palette = this.getActivePalette();
    const s = scale;
    const pulseAlpha = 0.3 + 0.25 * Math.sin(this.animationTime * 2.5);

    const w          = 310 * s;   // very wide
    const bodyH      = 76 * s;    // main rear body panel height
    const cabinH     = 36 * s;    // very low fastback
    const diffuserH  = 30 * s;    // tall lower bumper/diffuser
    const haunch     = 18 * s;    // fender flare beyond body width

    const carBottom = y - 20 * s;   // ground clearance — lifts car off road
    const bodyTop   = carBottom - bodyH;
    const bodyLeft  = x - w / 2;

    // -----------------------------------------------------------------------
    // Road reflection
    // -----------------------------------------------------------------------
    for (let i = 6; i >= 0; i--) {
      const sp = (i + 1) * 7 * s;
      g.rect(bodyLeft - haunch - sp * 0.4, y, w + haunch * 2 + sp * 0.8, sp + 2 * s);
      g.fill({ color: 0xff4020, alpha: 0.04 * (1 - i / 6) });
    }

    // -----------------------------------------------------------------------
    // Wheels — from behind, tires look like wide flat rectangles (tread face)
    // Drawn before body so haunches overlap the upper portion naturally
    // -----------------------------------------------------------------------
    const tireW  = 46 * s;   // wide rear tyre
    const tireH  = 22 * s;   // visible height from ground up
    const tireTop = y - tireH;

    // Left tyre — centred just inside the body edge, haunch hangs over it
    const tLX = bodyLeft - tireW * 0.3;
    // Right tyre — mirror
    const tRX = bodyLeft + w - tireW * 0.7;

    for (const tx of [tLX, tRX]) {
      // Tread face
      g.rect(tx, tireTop, tireW, tireH);
      g.fill(0x0b0b14);
      // Scrolling vertical motion bars
      const numBars  = 7;
      const barW     = tireW / (numBars * 2);
      const scroll   = (this.animationTime * 2.5) % (tireW / numBars);
      for (let i = 0; i < numBars + 1; i++) {
        const bx = tx + (i * tireW / numBars) + scroll;
        if (bx < tx || bx + barW > tx + tireW) continue;
        g.rect(bx, tireTop + 1 * s, barW, tireH - 2 * s);
        g.fill({ color: 0x1a1a28, alpha: 0.7 });
      }
      // Top edge highlight
      g.moveTo(tx + 2 * s, tireTop + 1.5 * s);
      g.lineTo(tx + tireW - 2 * s, tireTop + 1.5 * s);
      g.stroke({ width: 1 * s, color: 0x1c1c28, alpha: 0.8 });
      // Border
      g.rect(tx, tireTop, tireW, tireH);
      g.stroke({ width: 1 * s, color: 0x181820, alpha: 0.6 });
    }

    // -----------------------------------------------------------------------
    // Diffuser / lower bumper section
    // -----------------------------------------------------------------------
    const diffLeft = bodyLeft - haunch;
    const diffW    = w + haunch * 2;
    const diffTop  = carBottom - diffuserH;

    g.rect(diffLeft, diffTop, diffW, diffuserH);
    g.fill(0x07070e);

    // Four large rectangular exhaust outlets: 2 per side
    const exhW = 30 * s;
    const exhH = diffuserH * 0.52;
    const exhY = diffTop + diffuserH * 0.24;
    const exhGap = 5 * s;
    // Left pair (inner, then outer from center)
    g.rect(diffLeft + 10 * s, exhY, exhW, exhH);
    g.fill(0x0c0c1e);
    g.rect(diffLeft + 10 * s + exhW + exhGap, exhY, exhW, exhH);
    g.fill(0x0c0c1e);
    // Right pair
    g.rect(diffLeft + diffW - 10 * s - exhW, exhY, exhW, exhH);
    g.fill(0x0c0c1e);
    g.rect(diffLeft + diffW - 10 * s - exhW * 2 - exhGap, exhY, exhW, exhH);
    g.fill(0x0c0c1e);

    // Center diffuser vertical fins
    const finL = diffLeft + 10 * s + (exhW * 2 + exhGap) + 10 * s;
    const finR = diffLeft + diffW - 10 * s - (exhW * 2 + exhGap) - 10 * s;
    for (let i = 0; i <= 5; i++) {
      const fx = finL + (i / 5) * (finR - finL);
      g.moveTo(fx, diffTop + 3 * s);
      g.lineTo(fx, carBottom - 2 * s);
      g.stroke({ width: 0.7 * s, color: 0x14183a, alpha: 0.6 });
    }

    g.rect(diffLeft, diffTop, diffW, diffuserH);
    g.stroke({ width: 0.8 * s, color: 0x1c2248, alpha: 0.5 });

    // -----------------------------------------------------------------------
    // Rear fender haunches — flat flares
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      const bx = side === -1 ? bodyLeft : bodyLeft + w;
      g.poly([
        bx,                   bodyTop + bodyH * 0.22,
        bx + side * haunch,   bodyTop + bodyH * 0.50,
        bx + side * haunch,   diffTop,
        bx,                   diffTop,
      ]);
      g.fill(0x0c1026);
      g.moveTo(bx + side * haunch - side * 1.5 * s, bodyTop + bodyH * 0.52);
      g.lineTo(bx + side * haunch - side * 1.5 * s, diffTop);
      g.stroke({ width: 1.2 * s, color: 0x243858, alpha: 0.55 });
    }

    // -----------------------------------------------------------------------
    // Main body panel — dark navy/steel blue, rounded top corners
    // -----------------------------------------------------------------------
    const cr = 16 * s;  // top corner radius
    g.moveTo(bodyLeft, diffTop);
    g.lineTo(bodyLeft, bodyTop + cr);
    g.arcTo(bodyLeft, bodyTop, bodyLeft + cr, bodyTop, cr);
    g.lineTo(bodyLeft + w - cr, bodyTop);
    g.arcTo(bodyLeft + w, bodyTop, bodyLeft + w, bodyTop + cr, cr);
    g.lineTo(bodyLeft + w, diffTop);
    g.closePath();
    g.fill(0x0d1228);

    // Top edge highlight follows the rounded top
    g.moveTo(bodyLeft + cr + 2 * s, bodyTop + 1.5 * s);
    g.lineTo(bodyLeft + w - cr - 2 * s, bodyTop + 1.5 * s);
    g.stroke({ width: 1.2 * s, color: 0x2a3c60, alpha: 0.55 });

    // -----------------------------------------------------------------------
    // Wide horizontal rear grille/vent panel
    // -----------------------------------------------------------------------
    const tailR     = 10 * s;
    const tailGap   = 6 * s;
    const tailInset = 10 * s;
    const clusterW  = tailR * 2 + tailGap + tailR * 2;

    const ventL   = bodyLeft + tailInset + clusterW + 8 * s;
    const ventR   = bodyLeft + w - tailInset - clusterW - 8 * s;
    const ventW   = ventR - ventL;
    const ventTop = bodyTop + 6 * s;
    const ventH   = bodyH * 0.68;

    if (ventW > 20 * s) {
      g.rect(ventL, ventTop, ventW, ventH);
      g.fill(0x08090e);

      const numSlats = 9;
      const slatH    = ventH / numSlats;
      for (let i = 0; i < numSlats; i++) {
        const sy = ventTop + i * slatH;
        g.rect(ventL + 2 * s, sy, ventW - 4 * s, slatH * 0.45);
        g.fill(0x050508);
        g.rect(ventL + 2 * s, sy + slatH * 0.45, ventW - 4 * s, slatH * 0.55);
        g.fill(0x0b0d1a);
        g.moveTo(ventL + 2 * s, sy + slatH * 0.45);
        g.lineTo(ventR - 2 * s, sy + slatH * 0.45);
        g.stroke({ width: 0.5 * s, color: 0x203050, alpha: 0.4 });
      }
      g.rect(ventL, ventTop, ventW, ventH);
      g.stroke({ width: 0.8 * s, color: 0x192040, alpha: 0.6 });
    }

    // -----------------------------------------------------------------------
    // Four circular taillights
    // -----------------------------------------------------------------------
    const tailY = bodyTop + 20 * s;

    const tL1 = bodyLeft + tailInset + tailR;
    const tL2 = tL1 + tailR + tailGap + tailR;
    const tR1 = bodyLeft + w - tailInset - tailR;
    const tR2 = tR1 - (tailR + tailGap + tailR);

    this.drawCircleTaillight(g, tL1, tailY, tailR, s, palette);
    this.drawCircleTaillight(g, tL2, tailY, tailR, s, palette);
    this.drawCircleTaillight(g, tR2, tailY, tailR, s, palette);
    this.drawCircleTaillight(g, tR1, tailY, tailR, s, palette);

    // -----------------------------------------------------------------------
    // Lower bumper strip
    // -----------------------------------------------------------------------
    const stripTop = bodyTop + bodyH * 0.72;
    const stripH   = diffTop - stripTop;
    if (stripH > 0) {
      g.rect(bodyLeft, stripTop, w, stripH);
      g.fill(0x090b18);
      g.rect(bodyLeft + 6 * s, stripTop + 3 * s, w - 12 * s, stripH * 0.55);
      g.fill(0x060810);
    }

    // -----------------------------------------------------------------------
    // Cabin — very low fastback, thick raked C-pillars
    // -----------------------------------------------------------------------
    const cabInset    = w * 0.21;
    const cabTopInset = w * 0.30;
    const cabinTop    = bodyTop - cabinH;

    g.poly([
      bodyLeft + cabInset,        bodyTop,
      bodyLeft + w - cabInset,    bodyTop,
      bodyLeft + w - cabTopInset, cabinTop,
      bodyLeft + cabTopInset,     cabinTop,
    ]);
    g.fill(0x0b0d1c);

    const pillarW = 18 * s;
    g.poly([
      bodyLeft + cabInset,                     bodyTop,
      bodyLeft + cabInset + pillarW,           bodyTop,
      bodyLeft + cabTopInset + pillarW * 0.35, cabinTop,
      bodyLeft + cabTopInset,                  cabinTop,
    ]);
    g.fill(0x090a18);
    g.poly([
      bodyLeft + w - cabInset - pillarW,            bodyTop,
      bodyLeft + w - cabInset,                      bodyTop,
      bodyLeft + w - cabTopInset,                   cabinTop,
      bodyLeft + w - cabTopInset - pillarW * 0.35,  cabinTop,
    ]);
    g.fill(0x090a18);

    // Roofline edge
    g.moveTo(bodyLeft + cabTopInset, cabinTop);
    g.lineTo(bodyLeft + w - cabTopInset, cabinTop);
    g.stroke({ width: 1.5 * s, color: 0x253060, alpha: 0.65 });

    // Small angular side mirrors
    for (const side of [-1, 1]) {
      const mx  = side === -1 ? bodyLeft + cabInset : bodyLeft + w - cabInset;
      const mox = side * 13 * s;
      const moy = -cabinH * 0.38;
      g.poly([
        mx,           bodyTop + moy,
        mx + mox,     bodyTop + moy,
        mx + mox * 1.1, bodyTop + moy - cabinH * 0.18,
        mx + side * 2 * s, bodyTop + moy - cabinH * 0.18,
      ]);
      g.fill(0x0d1022);
      g.stroke({ width: 0.5 * s, color: 0x202840, alpha: 0.6 });
    }

    // -----------------------------------------------------------------------
    // Rear engine cover / windshield louvered slats
    // -----------------------------------------------------------------------
    const winBotInset = cabInset + 12 * s;
    const winTopInset = cabTopInset + 12 * s;
    const winTop      = cabinTop + 5 * s;
    const winBot      = bodyTop - 2 * s;
    const rwH         = winBot - winTop;
    const numRwSlats  = 6;

    for (let i = 0; i < numRwSlats; i++) {
      const t       = i / numRwSlats;
      const tNext   = (i + 1) / numRwSlats;
      const lInset  = winTopInset + t * (winBotInset - winTopInset);
      const rInset  = lInset;
      const sy      = winTop + t * rwH;
      const syNext  = winTop + tNext * rwH;
      const slatFace = (syNext - sy) * 0.55;

      g.poly([
        bodyLeft + lInset + 2 * s, sy,
        bodyLeft + w - rInset - 2 * s, sy,
        bodyLeft + w - rInset - 2 * s, sy + slatFace,
        bodyLeft + lInset + 2 * s, sy + slatFace,
      ]);
      g.fill(0x0a0c1c);
      g.moveTo(bodyLeft + lInset + 2 * s, sy);
      g.lineTo(bodyLeft + w - rInset - 2 * s, sy);
      g.stroke({ width: 0.5 * s, color: 0x1e2840, alpha: 0.5 });
    }

    // -----------------------------------------------------------------------
    // License plate
    // -----------------------------------------------------------------------
    const plateW = 38 * s;
    const plateH = 11 * s;
    const plateX = x - plateW / 2;
    const plateY = diffTop - plateH - 2 * s;
    g.rect(plateX, plateY, plateW, plateH);
    g.fill(0xc8c8b8);
    g.moveTo(plateX + 5 * s, plateY + plateH * 0.55);
    g.lineTo(plateX + plateW - 5 * s, plateY + plateH * 0.55);
    g.stroke({ width: 1.2 * s, color: 0x333333, alpha: 0.5 });
    g.rect(plateX, plateY, plateW, plateH);
    g.stroke({ width: 0.7 * s, color: 0x555555, alpha: 0.8 });

    // -----------------------------------------------------------------------
    // Neon outlines (pulsing)
    // -----------------------------------------------------------------------
    g.moveTo(bodyLeft, diffTop);
    g.lineTo(bodyLeft, bodyTop + cr);
    g.arcTo(bodyLeft, bodyTop, bodyLeft + cr, bodyTop, cr);
    g.lineTo(bodyLeft + w - cr, bodyTop);
    g.arcTo(bodyLeft + w, bodyTop, bodyLeft + w, bodyTop + cr, cr);
    g.lineTo(bodyLeft + w, diffTop);
    g.closePath();
    g.stroke({ width: 1.0 * s, color: palette.gridColor, alpha: pulseAlpha * 0.55 });

    g.poly([
      bodyLeft + cabInset,        bodyTop,
      bodyLeft + w - cabInset,    bodyTop,
      bodyLeft + w - cabTopInset, cabinTop,
      bodyLeft + cabTopInset,     cabinTop,
    ]);
    g.closePath();
    g.stroke({ width: 0.8 * s, color: palette.gridColor, alpha: pulseAlpha * 0.4 });
  }

  // ---------------------------------------------------------------------------
  // Taillight helpers
  // ---------------------------------------------------------------------------
  private drawRectTaillight(
    g: Graphics, lx: number, ly: number, tw: number, th: number,
    s: number, color: number, palette: PaletteConfig,
  ): void {
    // Outer glow
    for (let i = 5; i >= 1; i--) {
      const pad = i * 4 * s;
      g.rect(lx - pad, ly - pad, tw + pad * 2, th + pad * 2);
      g.fill({ color, alpha: 0.04 });
    }
    // Core lit rectangle
    g.rect(lx, ly, tw, th);
    g.fill(color);
    // Internal segments (horizontal dividers)
    const segs = 3;
    for (let i = 1; i < segs; i++) {
      const sy = ly + (i / segs) * th;
      g.moveTo(lx + 1 * s, sy);
      g.lineTo(lx + tw - 1 * s, sy);
      g.stroke({ width: 0.8 * s, color: 0x661010, alpha: 0.5 });
    }
    // Bright inner hotspot
    g.rect(lx + 2 * s, ly + 2 * s, tw - 4 * s, th - 4 * s);
    g.fill({ color: 0xffffff, alpha: 0.25 });
    // Border
    g.rect(lx, ly, tw, th);
    g.stroke({ width: 0.8 * s, color: 0xffaa44, alpha: 0.6 });
  }

  private drawCircleTaillight(
    g: Graphics, cx: number, cy: number, r: number, s: number,
    palette: PaletteConfig,
  ): void {
    const color = 0xff2040;
    // Outer glow
    for (let i = 5; i >= 1; i--) {
      g.circle(cx, cy, r + i * 4 * s);
      g.fill({ color, alpha: 0.03 });
    }
    // Dark housing ring
    g.circle(cx, cy, r + 2 * s);
    g.fill(0x0a0a1c);
    // Core
    g.circle(cx, cy, r);
    g.fill(color);
    // Inner ring detail
    g.circle(cx, cy, r * 0.7);
    g.stroke({ width: 0.8 * s, color: 0xcc1030, alpha: 0.5 });
    // Bright center
    g.circle(cx, cy, r * 0.4);
    g.fill({ color: 0xffffff, alpha: 0.35 });
    // Outer chrome ring
    g.circle(cx, cy, r + 2 * s);
    g.stroke({ width: 0.8 * s, color: 0x666688, alpha: 0.4 });
    // Outer glow ring
    g.circle(cx, cy, r);
    g.stroke({ width: 1 * s, color: 0xff6070, alpha: 0.5 });
  }

  // ---------------------------------------------------------------------------
  // Roadside scenery generation & rendering
  // ---------------------------------------------------------------------------

  private static readonly PALM_VARIANTS = 8;
  private static readonly ROCK_VARIANTS = 6;
  private static readonly BILLBOARD_VARIANTS = 4;
  private static readonly FALLEN_PALM_VARIANTS = 4;

  private generateRoadsideSprites(): void {
    const rng = new Random(9876);
    const N   = 52;
    const typePool: Array<RoadsideSprite['type']> = [
      'palm', 'palm', 'palm', 'palm', 'palm', 'palm',
      'rock', 'rock', 'rock', 'rock', 'rock',
    ];

    // Scroll-loop scenery (palms & rocks only)
    this.roadsideSprites = [];
    for (let i = 0; i < N; i++) {
      const side = rng.float(0, 1) < 0.5 ? -1 : 1;
      const type = typePool[rng.int(0, typePool.length - 1)];
      const maxVar = type === 'palm' ? DriveGameRenderer.PALM_VARIANTS : DriveGameRenderer.ROCK_VARIANTS;
      this.roadsideSprites.push({
        type,
        side:      side as -1 | 1,
        z:         i / N,
        extraFrac: rng.float(0.08, 0.36),
        scaleVar:  rng.float(0.75, 1.30),
        seed:      rng.int(0, 9999),
        variant:   rng.int(0, maxVar - 1),
      });
    }

    // Track-anchored billboards — spaced along the actual track path
    const trackN      = this.trackPoints.length;
    const bbRng       = new Random(5432);
    const bbCount     = 6;
    const minSpacing  = Math.floor(trackN / bbCount);
    this.trackBillboards = [];
    for (let i = 0; i < bbCount; i++) {
      const idx = (i * minSpacing + bbRng.int(0, Math.floor(minSpacing * 0.4))) % trackN;
      this.trackBillboards.push({
        trackIndex: idx,
        side:       bbRng.float(0, 1) < 0.5 ? -1 : 1,
        extraFrac:  bbRng.float(0.10, 0.30),
        scaleVar:   bbRng.float(0.85, 1.20),
        seed:       bbRng.int(0, 9999),
        variant:    bbRng.int(0, DriveGameRenderer.BILLBOARD_VARIANTS - 1),
      });
    }

    // Track-anchored obstacles — fallen palms on the road
    const obsRng     = new Random(1234);
    const obsCount   = 5;
    const obsSpacing = Math.floor(trackN / obsCount);
    this.trackObstacles = [];
    for (let i = 0; i < obsCount; i++) {
      const idx = (i * obsSpacing + obsRng.int(0, Math.floor(obsSpacing * 0.3))) % trackN;
      this.trackObstacles.push({
        type:          'fallenPalm',
        trackIndex:    idx,
        lateralOffset: [-0.55, 0, 0.55][obsRng.int(0, 2)],
        variant:       obsRng.int(0, DriveGameRenderer.FALLEN_PALM_VARIANTS - 1),
      });
    }
  }

  private bakeRoadsideTextures(): void {
    const palette = this.getActivePalette();

    // Helper: draw into a Graphics at (cx, baseY) with scale=1, then render to texture
    const bake = (
      w: number, h: number,
      drawFn: (g: Graphics, cx: number, baseY: number) => void,
    ): RenderTexture => {
      const g = new Graphics();
      drawFn(g, w / 2, h);
      const rt = RenderTexture.create({ width: w, height: h });
      this.app.renderer.render({ container: g, target: rt });
      g.destroy();
      return rt;
    };

    // Bake palm variants
    this.bakedPalms = [];
    for (let i = 0; i < DriveGameRenderer.PALM_VARIANTS; i++) {
      const seed = 7000 + i * 137;
      this.bakedPalms.push(bake(500, 1000, (g, cx, baseY) => {
        this.drawRoadsidePalm(g, cx, baseY, 1, seed, palette);
      }));
    }

    // Bake rock variants
    this.bakedRocks = [];
    for (let i = 0; i < DriveGameRenderer.ROCK_VARIANTS; i++) {
      const seed = 3000 + i * 211;
      this.bakedRocks.push(bake(120, 80, (g, cx, baseY) => {
        this.drawRoadsideRock(g, cx, baseY, 1, seed, palette);
      }));
    }

    // Bake billboard variants
    this.bakedBillboards = [];
    for (let i = 0; i < DriveGameRenderer.BILLBOARD_VARIANTS; i++) {
      const seed = 5000 + i * 173;
      this.bakedBillboards.push(bake(900, 1200, (g, cx, baseY) => {
        this.drawRoadsideBillboard(g, cx, baseY, 1, seed, palette);
      }));
    }

    // Bake fallen palm variants (horizontal, ~450 wide, ~120 tall)
    this.bakedFallenPalms = [];
    for (let i = 0; i < DriveGameRenderer.FALLEN_PALM_VARIANTS; i++) {
      const seed = 8000 + i * 191;
      this.bakedFallenPalms.push(bake(800, 400, (g, cx, _baseY) => {
        this.drawFallenPalm(g, cx, 250, 1, seed, palette);
      }));
    }
  }

  /**
   * Replicate the road's perspective curve helper so objects align with the
   * road when the car is going around a bend.
   */
  private roadCenterX(perspT: number): number {
    const cx         = this.width / 2;
    const curvePower = this.curveOffset / 12;
    const t          = Math.max(0.04, perspT);
    return cx + curvePower * (1 / t - 1);
  }

  private drawRoadsideSprites(): void {
    this.container.addChild(this.roadsideContainer);
  }

  private updateRoadsideSprites(): void {
    // Hide all pooled sprites, then reuse as needed
    for (const s of this.spritePool) s.visible = false;
    let poolIdx = 0;

    const horizonY   = this.height * 0.55;
    const groundH    = this.height - horizonY;
    const halfBot    = this.width * 0.75;
    const railFrac   = 0.85 / 0.75;
    const MIN_T      = 0.04;
    const scroll     = (this.animationTime * 0.3) % 1.0;

    type Placed = { texture: RenderTexture; perspT: number; x: number; y: number; scaleVar: number; anchorY?: number };
    const visible: Placed[] = [];

    // Scroll-loop scenery
    for (const sprite of this.roadsideSprites) {
      const rawT  = ((sprite.z + scroll) % 1.0);
      const t     = rawT * rawT;
      if (t < MIN_T || t > 0.96) continue;

      const perspT = t;
      const y      = horizonY + perspT * groundH;
      const cx     = this.roadCenterX(perspT);
      const x      = cx + sprite.side * (railFrac + sprite.extraFrac) * perspT * halfBot;

      if (x < -120 || x > this.width + 120) continue;

      const texture = sprite.type === 'palm'
        ? this.bakedPalms[sprite.variant]
        : this.bakedRocks[sprite.variant];

      visible.push({ texture, perspT, x, y, scaleVar: sprite.scaleVar });
    }

    // Track-anchored objects (billboards + obstacles)
    const trackN    = this.trackPoints.length;
    const viewRange = 60;

    for (const bb of this.trackBillboards) {
      let dist = bb.trackIndex - this.trackT;
      if (dist < -trackN / 2) dist += trackN;
      if (dist >  trackN / 2) dist -= trackN;
      if (dist < 1 || dist > viewRange) continue;

      const perspT  = Math.max(MIN_T, 1 - (dist / viewRange));
      const perspT2 = perspT * perspT;
      const bbY     = horizonY + perspT2 * groundH;
      const bbCx    = this.roadCenterX(perspT2);
      const bbX     = bbCx + bb.side * (railFrac + bb.extraFrac) * perspT2 * halfBot;

      if (bbX < -200 || bbX > this.width + 200) continue;

      visible.push({
        texture: this.bakedBillboards[bb.variant],
        perspT: perspT2,
        x: bbX,
        y: bbY,
        scaleVar: bb.scaleVar,
      });
    }

    // Track-anchored obstacles (centered on road)
    for (const obs of this.trackObstacles) {
      let dist = obs.trackIndex - this.trackT;
      if (dist < -trackN / 2) dist += trackN;
      if (dist >  trackN / 2) dist -= trackN;
      if (dist < 1 || dist > viewRange) continue;

      const perspT  = Math.max(MIN_T, 1 - (dist / viewRange));
      const perspT2 = perspT * perspT;
      const obsY    = horizonY + perspT2 * groundH;
      const obsCx   = this.roadCenterX(perspT2);
      // Lateral offset within the road (not outside like billboards)
      const roadHalfW = perspT2 * halfBot;
      const obsX    = obsCx + obs.lateralOffset * roadHalfW * 0.6;

      visible.push({
        texture: this.bakedFallenPalms[obs.variant],
        perspT: perspT2,
        x: obsX,
        y: obsY,
        scaleVar: 1.0,
        anchorY: 250 / 400,  // road-level is at y=250 in the 400px-tall texture
      });
    }

    // Painter's order: far first
    visible.sort((a, b) => a.perspT - b.perspT);

    for (const item of visible) {
      const scale = item.perspT * item.scaleVar;

      // Get or create a sprite from the pool
      let spr: Sprite;
      if (poolIdx < this.spritePool.length) {
        spr = this.spritePool[poolIdx];
      } else {
        spr = new Sprite();
        spr.anchor.set(0.5, 1.0); // center-bottom anchor
        this.roadsideContainer.addChild(spr);
        this.spritePool.push(spr);
      }
      poolIdx++;

      spr.texture = item.texture;
      spr.anchor.set(0.5, item.anchorY ?? 1.0);
      spr.visible = true;
      spr.position.set(item.x, item.y);
      spr.scale.set(scale, scale);
    }
  }

  // ---------------------------------------------------------------------------
  // Palm tree — clean tropical silhouette with curved trunk & drooping fronds
  // ---------------------------------------------------------------------------
  private drawRoadsidePalm(
    g: Graphics, x: number, baseY: number, scale: number, seed: number,
    _palette: PaletteConfig,
  ): void {
    const rng    = new Random(seed);
    const trunkH = 700 * scale;
    const col    = 0x0a0816;   // near-black silhouette

    // ── Trunk: gentle S-curve via cubic bezier, wider at base ───────────────
    // Pick a lean direction and a slight mid-bulge for organic feel
    const lean    = rng.float(-0.6, 0.6) * 80 * scale;
    const midBow  = rng.float(-0.4, 0.4) * 40 * scale;

    // Bezier control points for the trunk centerline
    const bx0 = x;
    const by0 = baseY;
    const bx1 = x + midBow;
    const by1 = baseY - trunkH * 0.35;
    const bx2 = x + lean * 0.7 + midBow * 0.3;
    const by2 = baseY - trunkH * 0.7;
    const bx3 = x + lean;
    const by3 = baseY - trunkH;

    // Sample the cubic bezier to draw a tapered trunk as filled polygon
    const trunkSteps = 16;
    const baseW = Math.max(2, 22 * scale);
    const topW  = Math.max(1, 6 * scale);
    const leftPts: number[] = [];
    const rightPts: number[] = [];

    for (let i = 0; i <= trunkSteps; i++) {
      const t  = i / trunkSteps;
      const mt = 1 - t;
      // Cubic bezier
      const cx = mt*mt*mt*bx0 + 3*mt*mt*t*bx1 + 3*mt*t*t*bx2 + t*t*t*bx3;
      const cy = mt*mt*mt*by0 + 3*mt*mt*t*by1 + 3*mt*t*t*by2 + t*t*t*by3;
      // Tangent for perpendicular offset
      const tx = -3*mt*mt*bx0 + 3*(mt*mt - 2*mt*t)*bx1 + 3*(2*mt*t - t*t)*bx2 + 3*t*t*bx3;
      const ty = -3*mt*mt*by0 + 3*(mt*mt - 2*mt*t)*by1 + 3*(2*mt*t - t*t)*by2 + 3*t*t*by3;
      const tLen = Math.sqrt(tx*tx + ty*ty) || 1;
      const nx = -ty / tLen;
      const ny =  tx / tLen;
      // Taper: wide at base (t=0), narrow at top (t=1)
      const halfW = baseW + (topW - baseW) * t;
      leftPts.push(cx + nx * halfW, cy + ny * halfW);
      rightPts.push(cx - nx * halfW, cy - ny * halfW);
    }

    // Reverse rightPts by coordinate pairs (not flat array) so polygon winds correctly
    const rightReversed: number[] = [];
    for (let i = rightPts.length - 2; i >= 0; i -= 2) {
      rightReversed.push(rightPts[i], rightPts[i + 1]);
    }

    // Draw trunk as closed polygon (left side up, right side down)
    const pts: number[] = [...leftPts, ...rightReversed];
    g.poly(pts);
    g.fill(col);

    // Crown point
    const crownX = bx3;
    const crownY = by3;

    // ── Fronds: 7–10 long arcing fronds with leaflets ───────────────────────
    const frondCount = 7 + rng.int(0, 3);

    for (let i = 0; i < frondCount; i++) {
      // Distribute fronds in a full arc above the crown (~300° spread)
      // with some randomness so they look natural
      const baseAngle = -Math.PI * 0.92 + (i / (frondCount - 1)) * Math.PI * 1.84;
      const angle = baseAngle + rng.float(-0.15, 0.15);

      // Frond length varies
      const frondLen = (200 + rng.float(-40, 60)) * scale;

      // Each frond is a quadratic bezier spine that droops heavily
      const droopAmount = (0.55 + rng.float(0, 0.25)) * frondLen;

      // Spine control point: starts outward at `angle`, then droops down
      const spCpX = crownX + Math.cos(angle) * frondLen * 0.45;
      const spCpY = crownY + Math.sin(angle) * frondLen * 0.45 + droopAmount * 0.3;

      // Spine tip: farther out and drooped
      const spTipX = crownX + Math.cos(angle) * frondLen * 0.85;
      const spTipY = crownY + Math.sin(angle) * frondLen * 0.35 + droopAmount;

      // Draw spine — thick near crown, tapering to thin at tip
      const spineSteps = 10;
      for (let s = 0; s < spineSteps; s++) {
        const t0 = s / spineSteps;
        const t1 = (s + 1) / spineSteps;
        const mt0 = 1 - t0, mt1 = 1 - t1;
        const x0 = mt0*mt0*crownX + 2*mt0*t0*spCpX + t0*t0*spTipX;
        const y0 = mt0*mt0*crownY + 2*mt0*t0*spCpY + t0*t0*spTipY;
        const x1 = mt1*mt1*crownX + 2*mt1*t1*spCpX + t1*t1*spTipX;
        const y1 = mt1*mt1*crownY + 2*mt1*t1*spCpY + t1*t1*spTipY;
        const w = Math.max(0.8, (9 - 7 * ((t0 + t1) / 2)) * scale);
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke({ width: w, color: col, alpha: 1 });
      }

      // Leaflets along spine — wide & long near crown, tapering toward tip
      const numLeaflets = 12 + rng.int(0, 4);
      for (let j = 1; j <= numLeaflets; j++) {
        const t = j / (numLeaflets + 1);

        // Quadratic bezier point on spine
        const mt = 1 - t;
        const sx = mt*mt*crownX + 2*mt*t*spCpX + t*t*spTipX;
        const sy = mt*mt*crownY + 2*mt*t*spCpY + t*t*spTipY;

        // Spine tangent at t
        const stx = 2*mt*(spCpX - crownX) + 2*t*(spTipX - spCpX);
        const sty = 2*mt*(spCpY - crownY) + 2*t*(spTipY - spCpY);
        const stLen = Math.sqrt(stx*stx + sty*sty) || 1;

        // Perpendicular to spine
        const pnx = -sty / stLen;
        const pny =  stx / stLen;

        // Taper factor: 1.0 at crown end, ~0.15 at tip
        const taper = Math.max(0.15, 1 - t * 0.85);

        // Leaflet length — long near crown, short near tip
        const leafLen = (65 + rng.float(-10, 10)) * scale * taper;

        // Leaflet base width — fat near crown, thin near tip
        const halfBase = Math.max(0.8, (9 + rng.float(-1, 1)) * scale * taper);

        // Leaflet droop: tips curve downward
        const leafDroopY = leafLen * 0.3;

        // Both sides of the spine
        for (const side of [-1, 1]) {
          const leafTipX = sx + pnx * side * leafLen;
          const leafTipY = sy + pny * side * leafLen + leafDroopY;

          // Base offsets along spine tangent
          const bpx = (stx / stLen) * halfBase;
          const bpy = (sty / stLen) * halfBase;

          g.poly([
            sx + bpx, sy + bpy,
            leafTipX, leafTipY,
            sx - bpx, sy - bpy,
          ]);
          g.fill(col);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Billboard — neon-framed sign on a single post
  // ---------------------------------------------------------------------------
  private drawRoadsideBillboard(
    g: Graphics, x: number, baseY: number, scale: number, seed: number,
    palette: PaletteConfig,
  ): void {
    const rng      = new Random(seed);
    const postH    = 700 * scale;
    const postW    = Math.max(4, 30 * scale);
    const signW    = 740 * scale;
    const signH    = 400 * scale;
    const signBotY = baseY - postH;
    const signTopY = signBotY - signH;
    const signL    = x - signW / 2;

    const neonPool = [0xff20c0, 0x20ffd0, 0xff6010, 0x10c0ff, 0xffe020, 0xff4060];
    const neonCol  = neonPool[rng.int(0, neonPool.length - 1)];

    // ── Post ─────────────────────────────────────────────────────────────────
    g.rect(x - postW / 2, signBotY, postW, postH);
    g.fill(0x22203a);

    // ── Sign backing ─────────────────────────────────────────────────────────
    g.rect(signL, signTopY, signW, signH);
    g.fill(0x0d0e1e);

    // ── Neon border — outer glow passes ──────────────────────────────────────
    for (let i = 3; i >= 1; i--) {
      const pad = i * 2 * scale;
      g.rect(signL - pad, signTopY - pad, signW + pad * 2, signH + pad * 2);
      g.stroke({ width: Math.max(0.5, 1.5 * scale), color: neonCol, alpha: 0.10 * (4 - i) });
    }

    // ── Bright neon border ───────────────────────────────────────────────────
    g.rect(signL, signTopY, signW, signH);
    g.stroke({ width: Math.max(0.8, 1.5 * scale), color: neonCol, alpha: 0.95 });

    // ── Inner horizontal stripes ─────────────────────────────────────────────
    const stripeH = signH * 0.18;
    for (let s = 0; s < 3; s++) {
      const sy = signTopY + 4 * scale + s * (signH - 8 * scale) / 3;
      g.rect(signL + 4 * scale, sy, signW - 8 * scale, stripeH);
      g.fill({ color: neonCol, alpha: 0.10 + s * 0.06 });
    }

    // ── Bold divider line through middle ─────────────────────────────────────
    const midY = signTopY + signH * 0.5;
    g.moveTo(signL + 4 * scale, midY);
    g.lineTo(signL + signW - 4 * scale, midY);
    g.stroke({ width: Math.max(0.5, 0.8 * scale), color: neonCol, alpha: 0.55 });

    // ── "Text" blocks — two rows of short rectangles ─────────────────────────
    for (let row = 0; row < 2; row++) {
      const ry     = signTopY + signH * (0.18 + row * 0.55);
      const numSeg = 3;
      let curX     = signL + 6 * scale;
      for (let s = 0; s < numSeg; s++) {
        const segW = (rng.float(0.12, 0.22)) * signW;
        g.rect(curX, ry, segW, Math.max(1, 2.5 * scale));
        g.fill({ color: neonCol, alpha: 0.70 });
        curX += segW + 4 * scale;
        if (curX + segW > signL + signW - 6 * scale) break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Rock formation — angular dark boulders with neon rim highlight
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Fallen palm tree — lit obstacle lying across the road
  // ---------------------------------------------------------------------------
  private drawFallenPalm(
    g: Graphics, cx: number, baseY: number, scale: number, seed: number,
    palette: PaletteConfig,
  ): void {
    const rng      = new Random(seed);
    const trunkLen = 380 * scale;
    const trunkCol = 0x2a2440;   // visible dark brown-purple
    const neonCol  = palette.gridColor;
    const frondCol = 0x1e2a1e;   // dark green tint

    // Trunk lies roughly horizontal, slight curve
    // Base (root end) is at left, crown (frond end) at right
    const rootX  = cx - trunkLen * 0.5;
    const rootY  = baseY;
    const tipX   = cx + trunkLen * 0.5;
    const bow    = rng.float(-0.15, 0.15) * trunkLen;
    const tipY   = baseY + bow;
    const midX   = (rootX + tipX) * 0.5 + rng.float(-0.1, 0.1) * trunkLen;
    const midY   = Math.min(rootY, tipY) - rng.float(8, 18) * scale; // slight upward bow

    // Tapered trunk as a series of quads along a quadratic bezier
    const baseW = Math.max(2, 16 * scale);  // root end (thick)
    const topW  = Math.max(1, 5 * scale);   // crown end (thin)
    const steps = 12;
    const leftPts: number[] = [];
    const rightPts: number[] = [];

    for (let i = 0; i <= steps; i++) {
      const t  = i / steps;
      const mt = 1 - t;
      const px = mt * mt * rootX + 2 * mt * t * midX + t * t * tipX;
      const py = mt * mt * rootY + 2 * mt * t * midY + t * t * tipY;
      // Tangent
      const tx = 2 * mt * (midX - rootX) + 2 * t * (tipX - midX);
      const ty = 2 * mt * (midY - rootY) + 2 * t * (tipY - midY);
      const tLen = Math.sqrt(tx * tx + ty * ty) || 1;
      const nx = -ty / tLen;
      const ny =  tx / tLen;
      const halfW = baseW + (topW - baseW) * t;
      leftPts.push(px + nx * halfW, py + ny * halfW);
      rightPts.push(px - nx * halfW, py - ny * halfW);
    }

    const rightReversed: number[] = [];
    for (let i = rightPts.length - 2; i >= 0; i -= 2) {
      rightReversed.push(rightPts[i], rightPts[i + 1]);
    }

    // Trunk fill
    const pts = [...leftPts, ...rightReversed];
    g.poly(pts);
    g.fill(trunkCol);

    // Neon edge highlight
    g.poly(pts);
    g.stroke({ width: Math.max(0.5, 1.5 * scale), color: neonCol, alpha: 0.5 });

    // Trunk ring segments for texture
    for (let i = 1; i < steps; i += 2) {
      const t  = i / steps;
      const mt = 1 - t;
      const px = mt * mt * rootX + 2 * mt * t * midX + t * t * tipX;
      const py = mt * mt * rootY + 2 * mt * t * midY + t * t * tipY;
      const tx = 2 * mt * (midX - rootX) + 2 * t * (tipX - midX);
      const ty = 2 * mt * (midY - rootY) + 2 * t * (tipY - midY);
      const tLen = Math.sqrt(tx * tx + ty * ty) || 1;
      const nx = -ty / tLen;
      const ny =  tx / tLen;
      const halfW = baseW + (topW - baseW) * t;
      g.moveTo(px + nx * halfW, py + ny * halfW);
      g.lineTo(px - nx * halfW, py - ny * halfW);
      g.stroke({ width: Math.max(0.3, 0.8 * scale), color: neonCol, alpha: 0.2 });
    }

    // Crown point (frond end)
    const crownX = tipX;
    const crownY = tipY;

    // Fronds — full crown visible, splayed on the ground
    const frondCount = 6 + rng.int(0, 2);
    for (let i = 0; i < frondCount; i++) {
      // Fronds fan out widely from the crown end
      const baseAngle = -1.0 + (i / (frondCount - 1)) * 2.0 + rng.float(-0.15, 0.15);
      const frondLen  = (100 + rng.float(-10, 20)) * scale;
      const droopAmt  = (0.3 + rng.float(0, 0.3)) * frondLen;

      const spCpX  = crownX + Math.cos(baseAngle) * frondLen * 0.45;
      const spCpY  = crownY + Math.sin(baseAngle) * frondLen * 0.45 + droopAmt * 0.3;
      const spTipX = crownX + Math.cos(baseAngle) * frondLen * 0.85;
      const spTipY = crownY + Math.sin(baseAngle) * frondLen * 0.35 + droopAmt;

      // Spine stroke
      g.moveTo(crownX, crownY);
      g.quadraticCurveTo(spCpX, spCpY, spTipX, spTipY);
      g.stroke({ width: Math.max(0.5, 2 * scale), color: frondCol, alpha: 0.9 });

      // Neon edge on spine
      g.moveTo(crownX, crownY);
      g.quadraticCurveTo(spCpX, spCpY, spTipX, spTipY);
      g.stroke({ width: Math.max(0.3, 0.8 * scale), color: neonCol, alpha: 0.25 });

      // Leaflets
      const numLeaflets = 8 + rng.int(0, 3);
      for (let j = 1; j <= numLeaflets; j++) {
        const t  = j / (numLeaflets + 1);
        const mt = 1 - t;
        const sx = mt * mt * crownX + 2 * mt * t * spCpX + t * t * spTipX;
        const sy = mt * mt * crownY + 2 * mt * t * spCpY + t * t * spTipY;
        const stx = 2 * mt * (spCpX - crownX) + 2 * t * (spTipX - spCpX);
        const sty = 2 * mt * (spCpY - crownY) + 2 * t * (spTipY - spCpY);
        const stLen = Math.sqrt(stx * stx + sty * sty) || 1;
        const pnx = -sty / stLen;
        const pny =  stx / stLen;

        const taper   = Math.max(0.15, 1 - t * 0.85);
        const leafLen = (25 + rng.float(-5, 5)) * scale * taper;
        const halfB   = Math.max(0.4, (4 + rng.float(-1, 1)) * scale * taper);
        const droopY  = leafLen * 0.25;

        for (const side of [-1, 1]) {
          const lx = sx + pnx * side * leafLen;
          const ly = sy + pny * side * leafLen + droopY;
          const bpx = (stx / stLen) * halfB;
          const bpy = (sty / stLen) * halfB;
          g.poly([sx + bpx, sy + bpy, lx, ly, sx - bpx, sy - bpy]);
          g.fill(frondCol);
        }
      }
    }

    // Root mass at the base end — torn earth clump
    const rootR = 14 * scale;
    g.circle(rootX, rootY, rootR);
    g.fill(0x1a1828);
    g.circle(rootX, rootY, rootR);
    g.stroke({ width: Math.max(0.5, 1 * scale), color: neonCol, alpha: 0.3 });
  }

  private drawRoadsideRock(
    g: Graphics, x: number, baseY: number, scale: number, seed: number,
    palette: PaletteConfig,
  ): void {
    const rng         = new Random(seed);
    const numBoulders = rng.int(2, 4);
    const rockCol     = 0x1c1a2c;   // dark purple-grey — visible against ground

    for (let b = 0; b < numBoulders; b++) {
      const bx  = x + rng.float(-1, 1) * 20 * scale;
      const bw  = (24 + rng.float(0, 22)) * scale;
      const bh  = (14 + rng.float(0, 14)) * scale;

      // 5-point irregular boulder: left-base → left-shoulder → peak → right-shoulder → right-base
      const peakOff = rng.float(-0.2, 0.2) * bw;   // peak slightly off-centre
      const pts = [
        bx - bw * 0.50, baseY,                         // left base
        bx - bw * 0.45, baseY - bh * rng.float(0.5, 0.75),  // left shoulder
        bx + peakOff,   baseY - bh,                    // peak
        bx + bw * 0.45, baseY - bh * rng.float(0.45, 0.70), // right shoulder
        bx + bw * 0.50, baseY,                         // right base
      ];

      g.poly(pts);
      g.fill(rockCol);

      // Shadow face — slightly darker bottom half
      g.poly([
        pts[0], pts[1],   // left base
        pts[8], pts[9],   // right base
        bx + bw * 0.45, baseY - bh * 0.4,
        bx - bw * 0.45, baseY - bh * 0.35,
      ]);
      g.fill({ color: 0x0e0c1a, alpha: 0.55 });

      // Neon rim highlight — top edge only
      g.moveTo(pts[0], pts[1]);
      g.lineTo(pts[2], pts[3]);
      g.lineTo(pts[4], pts[5]);
      g.lineTo(pts[6], pts[7]);
      g.lineTo(pts[8], pts[9]);
      g.stroke({ width: Math.max(0.5, 1.1 * scale), color: palette.gridColor, alpha: 0.45 });
    }
  }
}

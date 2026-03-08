import { Container, Graphics, Text } from 'pixi.js';

// ── Cassette Tape Repair Minigame ──────────────────────────────────────────
// Rendered as a PixiJS Container overlay. The player clicks & drags on the
// right spool to wind tape back in. Progress goes from 0 to 100%.

const CYAN    = 0x00e5ff;
const MAGENTA = 0xff2080;
const RED     = 0xff3030;
const GREEN   = 0x30ff60;
const AMBER   = 0xffa020;
const DIM     = 0x334455;
const PANEL   = 0x0a1020;
const BORDER  = 0x1a3050;

const FONT = 'monospace';

function txt(str: string, size: number, color: number, bold = false): Text {
  return new Text({
    text: str,
    style: { fontFamily: FONT, fontSize: size, fill: color, fontWeight: bold ? 'bold' : 'normal' },
  });
}

function txtWrapped(str: string, size: number, color: number, wrapWidth: number): Text {
  return new Text({
    text: str,
    style: {
      fontFamily: FONT,
      fontSize: size,
      fill: color,
      wordWrap: true,
      wordWrapWidth: wrapWidth,
      lineHeight: size * 1.3,
    },
  });
}

export class CassetteMinigame {
  readonly container = new Container();

  private w = 0;
  private h = 0;

  // ── game state ───────────────────────────────────────────────────────────
  private progress = 0;           // 0..1
  private windingSpeed = 0;       // 0..1 (current)
  private stability = 0.45;       // 0..1 (fluctuates)
  private tension = 0.3;          // 0..1 (fluctuates)
  private spoolAngle = 0;
  private dragging = false;
  private lastMouseAngle = 0;
  private tanglePhase = 0;
  private time = 0;

  // ── spectrum analyzer state ────────────────────────────────────────────
  private readonly NUM_BARS = 12;
  private barLevels:  Float32Array = new Float32Array(12); // current displayed height 0..1
  private barTargets: Float32Array = new Float32Array(12); // target height 0..1
  private barPeaks:   Float32Array = new Float32Array(12); // peak hold position 0..1
  private barPeakAge: Float32Array = new Float32Array(12); // frames since peak was set
  private nextBeat = 0; // time of next random beat

  // ── cached Graphics ──────────────────────────────────────────────────────
  private bg         = new Graphics();
  private cassetteG  = new Graphics();
  private hudG       = new Graphics();
  private spoolLeftG = new Graphics();
  private spoolRightG= new Graphics();
  private tangleG    = new Graphics();
  private progressG  = new Graphics();
  private stabilityG = new Graphics();
  private fidelityG  = new Graphics();
  private dialG      = new Graphics();
  private tensionG   = new Graphics();
  private titlePanelG = new Graphics();

  // ── text labels ──────────────────────────────────────────────────────────
  private titleText:      Text;
  private bannerText:     Text;
  private instructText:   Text;
  private stabilityLabel: Text;
  private stabilityVal:   Text;
  private fidelityLabel:  Text;
  private fidelitySignal: Text;
  private fidelityVal:    Text;
  private progressLabel:  Text;
  private tensionLabel:   Text;
  private dialLabel:      Text;
  private dialSlow:       Text;
  private dial100:        Text;

  // ── mouse handlers (bound) ───────────────────────────────────────────────
  private _onDown:  (e: MouseEvent) => void;
  private _onMove:  (e: MouseEvent) => void;
  private _onUp:    () => void;
  private canvas: HTMLCanvasElement | null = null;

  constructor() {
    this.container.label = 'cassetteMinigame';
    this.container.visible = false;
    this.container.eventMode = 'static';

    // add children in draw order
    this.container.addChild(
      this.bg, this.hudG, this.cassetteG, this.tangleG,
      this.spoolLeftG, this.spoolRightG,
      this.progressG, this.tensionG, this.stabilityG, this.fidelityG, this.dialG, this.titlePanelG,
    );

    // text
    this.bannerText     = txt('AUDIO DEGRADATION. MAINTENANCE SEQUENCE INITIATED.', 26, MAGENTA, true);
    this.titleText      = txt('TAPE REPAIR MODULE - 001', 16, CYAN, true);
    this.instructText   = txt(
      'GUIDE TORQUE TOOL TO SOCKET IN RIGHT SPOOL HUB. ROTATE TO NEATLY RETRACT SPILLED TAPE. DO NOT STRETCH.',
      16, 0x88aacc,
    );
    this.stabilityLabel = txt('SYSTEM STABILITY', 16, CYAN, true);
    this.stabilityVal   = txt('FLUCTUATING', 15, AMBER);
    this.fidelityLabel  = txt('AUDIO FIDELITY', 16, CYAN, true);
    this.fidelitySignal = txt('SIGNAL:', 15, 0x88aacc);
    this.fidelityVal    = txt('DEGRADED', 15, RED);
    this.progressLabel  = txt('REPAIR PROGRESS: 0%', 11, GREEN, true);
    this.tensionLabel   = txt('TENSION', 11, 0x88aacc, true);
    this.dialLabel      = txt('WINDING SPEED', 10, CYAN, true);
    this.dialSlow       = txt('SLOW', 9, 0x88aacc);
    this.dial100        = txt('100%', 9, 0x88aacc);

    this.container.addChild(
      this.bannerText, this.titleText, this.instructText,
      this.stabilityLabel, this.stabilityVal,
      this.fidelityLabel, this.fidelitySignal, this.fidelityVal,
      this.progressLabel, this.tensionLabel, this.dialLabel, this.dialSlow, this.dial100,
    );

    // mouse handlers
    this._onDown = (e: MouseEvent) => this.onPointerDown(e);
    this._onMove = (e: MouseEvent) => this.onPointerMove(e);
    this._onUp   = ()              => this.onPointerUp();
  }

  // ── public API ─────────────────────────────────────────────────────────────

  show(canvas: HTMLCanvasElement, w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.canvas = canvas;
    this.container.visible = true;
    this.progress = 0;
    this.windingSpeed = 0;
    this.stability = 0.45;
    this.spoolAngle = 0;
    this.time = 0;
    this.nextBeat = 0;
    this.barLevels.fill(0.03);
    this.barTargets.fill(0);
    this.barPeaks.fill(0);
    this.barPeakAge.fill(0);
    canvas.addEventListener('mousedown', this._onDown);
    canvas.addEventListener('mousemove', this._onMove);
    window.addEventListener('mouseup',   this._onUp);

    // set instruction text word wrap width
    const lx = this.w * 0.04;
    const panelW = this.w * 0.22;
    this.instructText.style.wordWrap = true;
    this.instructText.style.wordWrapWidth = panelW - 16;
    this.instructText.style.lineHeight = 16 * 1.2;

    this.drawAll();
  }

  hide(): void {
    this.container.visible = false;
    this.dragging = false;
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this._onDown);
      this.canvas.removeEventListener('mousemove', this._onMove);
    }
    window.removeEventListener('mouseup', this._onUp);
    this.canvas = null;
  }

  get isComplete(): boolean { return this.progress >= 1; }

  update(dt: number): void {
    if (!this.container.visible) return;
    this.time += dt * 0.02;

    // winding decays when not dragging
    if (!this.dragging) {
      this.windingSpeed *= Math.pow(0.92, dt);
    }

    // progress increases with winding speed
    if (this.progress < 1) {
      this.progress = Math.min(1, this.progress + this.windingSpeed * 0.003 * dt);
    }

    // spool rotation
    this.spoolAngle += this.windingSpeed * 0.15 * dt;

    // tangle animation
    this.tanglePhase += dt * 0.03;

    // stability fluctuation - continuous, ranges 10%-80%, never settles
    // multiple sine waves with different frequencies + random jitter, fixed center
    const baseOscillation = Math.sin(this.time * 0.8) * 0.15 + Math.sin(this.time * 1.6) * 0.1;
    const fastOscillation = Math.sin(this.time * 2.8) * 0.05 + Math.sin(this.time * 4.6) * 0.03;
    const randomJitter = (Math.random() - 0.5) * 0.06;

    // no drift/target - oscillation centered on fixed middle of range
    const fixedCenter = 0.45;

    this.stability += (baseOscillation + fastOscillation + randomJitter) * dt * 0.08;
    this.stability = Math.max(0.1, Math.min(0.8, this.stability));

    // tension fluctuation - responds to winding speed, different frequency from stability
    const tensionBase = Math.sin(this.time * 1.2) * 0.12 + Math.sin(this.time * 2.3) * 0.08;
    const tensionFast = Math.sin(this.time * 3.9) * 0.04 + Math.sin(this.time * 5.7) * 0.03;
    const tensionJitter = (Math.random() - 0.5) * 0.05;
    const windBias = this.windingSpeed * 0.15; // winding increases tension
    this.tension += (tensionBase + tensionFast + tensionJitter + windBias) * dt * 0.08;
    this.tension = Math.max(0.05, Math.min(0.9, this.tension));

    // spectrum analyzer
    this.updateSpectrum(dt);

    this.drawAll();
  }

  destroy(): void {
    this.hide();
    this.container.destroy({ children: true });
  }

  // ── mouse interaction ──────────────────────────────────────────────────────

  private getSpoolRightCenter(): { x: number; y: number } {
    const tapeScale = 0.75;
    const ly = this.h * 0.12; // align with audio fidelity panel
    const titlePanelH = 40;
    const gap = 20;
    const cy = ly + titlePanelH + gap + (this.h * 0.36) / 2; // cassette center

    const cx = this.w / 2 + this.w * 0.09 * tapeScale;
    const spoolY = cy - this.h * 0.03 * tapeScale; // spools slightly above center
    return { x: cx, y: spoolY };
  }

  private mouseAngle(e: MouseEvent): number {
    if (!this.canvas) return 0;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.w / rect.width;
    const scaleY = this.h / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    const c = this.getSpoolRightCenter();
    return Math.atan2(my - c.y, mx - c.x);
  }

  private onPointerDown(e: MouseEvent): void {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.w / rect.width;
    const scaleY = this.h / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    const c = this.getSpoolRightCenter();
    const dist = Math.hypot(mx - c.x, my - c.y);
    if (dist < this.w * 0.1) {
      this.dragging = true;
      this.lastMouseAngle = this.mouseAngle(e);
    }
  }

  private onPointerMove(e: MouseEvent): void {
    if (!this.dragging) return;
    const angle = this.mouseAngle(e);
    let delta = angle - this.lastMouseAngle;
    // normalize to -PI..PI
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    // clockwise rotation = positive winding
    if (delta > 0) {
      this.windingSpeed = Math.min(1, this.windingSpeed + delta * 0.8);
    }
    this.lastMouseAngle = angle;
  }

  private onPointerUp(): void {
    this.dragging = false;
  }

  // ── drawing ────────────────────────────────────────────────────────────────

  private drawAll(): void {
    this.drawBackground();
    this.drawHUD();
    this.drawTitlePanel();
    this.drawCassette();
    this.drawSpools();
    this.drawTangle();
    this.drawProgressBar();
    this.drawTensionBar();
    this.drawStabilityGauge();
    this.drawFidelityBars();
    this.drawDial();
    this.layoutText();
  }

  private drawBackground(): void {
    const g = this.bg;
    g.clear();
    g.rect(0, 0, this.w, this.h);
    g.fill({ color: 0x000000, alpha: 0.75 });
  }

  private drawHUD(): void {
    const g = this.hudG;
    g.clear();

    // top banner bar (8px padding top & bottom around 26px text)
    const bannerTop = 8;
    const bannerH = 8 + 26 + 8;
    g.rect(0, bannerTop, this.w, bannerH);
    g.fill({ color: PANEL, alpha: 0.9 });

    // background grid inside banner with sweeping pulse
    const gridStep = 4;
    const numH = Math.ceil(bannerH / gridStep);
    const hScan = (this.time * 3.0) % numH;  // horizontal line sweep top→bottom
    const falloff = 0.6;
    const glowStr = (i: number, scan: number) => {
      const d = Math.abs(i - scan);
      return d < 1 / falloff ? Math.max(0, 1 - d * falloff) : 0;
    };

    for (let x = 0; x < this.w; x += gridStep) {
      g.moveTo(x, bannerTop);
      g.lineTo(x, bannerTop + bannerH);
      g.stroke({ color: MAGENTA, alpha: 0.08, width: 1 });
    }
    for (let i = 0; i < numH; i++) {
      const y = bannerTop + i * gridStep;
      const s = glowStr(i, hScan);
      g.moveTo(0, y);
      g.lineTo(this.w, y);
      g.stroke({ color: MAGENTA, alpha: 0.08 + 0.55 * s, width: 1 });
    }

    // top and bottom border lines
    g.rect(0, bannerTop, this.w, 1);
    g.fill({ color: MAGENTA, alpha: 0.6 });
    g.rect(0, bannerTop + bannerH, this.w, 1);
    g.fill({ color: MAGENTA, alpha: 0.6 });

    // left panel — sized to tightly fit: pad(8) + title(16) + gap(4) + bar(30) + gap(6) + value(15) + pad(8) = 87
    const lx = this.w * 0.04;
    const ly = this.h * 0.12;
    const stabilityPanelH = 87;
    const gap = 20; // same as title panel to cassette gap
    this.drawPanel(g, lx, ly, this.w * 0.22, stabilityPanelH);
    this.drawPanel(g, lx, ly + stabilityPanelH + gap, this.w * 0.22, this.h * 0.26);

    // right panel — sized to tightly fit: title(6+16) + gap(4) + spectrumBox(26..26+78) + gap(6) + label(15) + pad(6)
    const rx = this.w * 0.74;
    const rpH = 26 + 78 + 6 + 15 + 6; // = 131
    this.drawPanel(g, rx, ly, this.w * 0.22, rpH);
  }

  private drawPanel(g: Graphics, x: number, y: number, w: number, h: number): void {
    g.rect(x, y, w, h);
    g.fill({ color: PANEL, alpha: 0.85 });
    g.rect(x, y, w, h);
    g.stroke({ color: CYAN, alpha: 0.4, width: 2 });
    // corner accents
    const c = 6;
    for (const [cx, cy, dx, dy] of [
      [x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1],
    ] as [number, number, number, number][]) {
      g.moveTo(cx, cy + dy * c);
      g.lineTo(cx, cy);
      g.lineTo(cx + dx * c, cy);
      g.stroke({ color: CYAN, alpha: 0.8, width: 2 });
    }
  }

  private drawTitlePanel(): void {
    // title is now part of the cassette panel frame — nothing to draw separately
    this.titlePanelG.clear();
  }

  private drawCassette(): void {
    const g = this.cassetteG;
    g.clear();

    const ly = this.h * 0.12; // align with audio fidelity panel
    const titlePanelH = 40;
    const gap = 20;

    const cx = this.w / 2;
    const cy = ly + titlePanelH + gap + (this.h * 0.36) / 2; // cassette center
    const cw = this.w * 0.42;
    const ch = this.h * 0.36;

    // ── outer teal panel frame (includes title area) ──
    const frameMargin = 6;
    const fx = cx - cw / 2 - frameMargin;
    const fy = ly - frameMargin; // extend up to include title
    const fw = cw + frameMargin * 2;
    const fh = (cy + ch / 2 + frameMargin + 30 + frameMargin) - fy; // +30 for progress bar height

    // ── cassette body — 75% scale, centered in panel ──
    const tapeScale = 0.75;
    const tw = cw * tapeScale;
    const th = ch * tapeScale;

    // trapezoid bulge parameters
    const trapH = th * 0.6;
    const trapW = 14;          // how far the bulge extends outward
    const trapPinch = 8;       // how much the outer tips pinch inward vertically
    const trapTopY = cy - trapH / 2;
    const trapBotY = cy + trapH / 2;

    // helper to draw the panel path with integrated trapezoid bulges
    const r = 10; // corner radius
    const trapInset = 3; // gap between trapezoid and panel edge
    const drawPanelPath = () => {
      // start at top-left after corner radius
      g.moveTo(fx + r, fy);
      // top edge
      g.lineTo(fx + fw - r, fy);
      g.arcTo(fx + fw, fy, fx + fw, fy + r, r);
      // right edge straight down (no cutout — trapezoid is separate)
      g.lineTo(fx + fw, fy + fh - r);
      g.arcTo(fx + fw, fy + fh, fx + fw - r, fy + fh, r);
      // bottom edge
      g.lineTo(fx + r, fy + fh);
      g.arcTo(fx, fy + fh, fx, fy + fh - r, r);
      // left edge straight up
      g.lineTo(fx, fy + r);
      g.arcTo(fx, fy, fx + r, fy, r);
      g.closePath();
    };

    // fill
    drawPanelPath();
    g.fill({ color: 0x061020, alpha: 0.3 });

    // teal border stroke
    drawPanelPath();
    g.stroke({ color: CYAN, alpha: 0.5, width: 2 });

    // purple trapezoids (inset with gap from panel edge)
    const drawTrapezoid = (baseX: number, dir: number) => {
      // dir: +1 = inward from left edge, -1 = inward from right edge
      const outerX = baseX + dir * trapInset;
      const innerX = baseX + dir * (trapInset + trapW);
      // fill
      g.moveTo(outerX, trapTopY);
      g.lineTo(innerX, trapTopY + trapPinch);
      g.lineTo(innerX, trapBotY - trapPinch);
      g.lineTo(outerX, trapBotY);
      g.closePath();
      g.fill({ color: MAGENTA, alpha: 0.12 });
      // stroke
      g.moveTo(outerX, trapTopY);
      g.lineTo(innerX, trapTopY + trapPinch);
      g.lineTo(innerX, trapBotY - trapPinch);
      g.lineTo(outerX, trapBotY);
      g.closePath();
      g.stroke({ color: MAGENTA, alpha: 0.5, width: 1.5 });
      // brighter inner trapezoid with gap
      const ig = 4; // inset gap from outline
      const t = ig / trapW; // interpolation factor for x
      const iOuterX = outerX + dir * ig;
      const iInnerX = innerX - dir * ig;
      const iTopY = trapTopY + ig + trapPinch * t;
      const iBotY = trapBotY - ig - trapPinch * t;
      const iPinch = trapPinch * (1 - 2 * t);
      // pulsing neon glow on inner trapezoid
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.5);

      const drawInnerPath = () => {
        g.moveTo(iOuterX, iTopY);
        g.lineTo(iInnerX, iTopY + iPinch);
        g.lineTo(iInnerX, iBotY - iPinch);
        g.lineTo(iOuterX, iBotY);
        g.closePath();
      };

      // fill
      drawInnerPath();
      g.fill({ color: 0xffaaff, alpha: 0.5 + 0.4 * pulse });

      // wide outer halo
      drawInnerPath();
      g.stroke({ color: 0xcc44cc, alpha: (0.08 + 0.12 * pulse), width: 8 });

      // mid bloom
      drawInnerPath();
      g.stroke({ color: 0xdd66dd, alpha: (0.15 + 0.25 * pulse), width: 4 });

      // inner bloom
      drawInnerPath();
      g.stroke({ color: 0xee88ee, alpha: (0.3 + 0.4 * pulse), width: 2 });

      // bright core
      drawInnerPath();
      g.stroke({ color: 0xffaaff, alpha: (0.5 + 0.5 * pulse), width: 1 });
    };
    drawTrapezoid(fx, 1);        // left
    drawTrapezoid(fx + fw, -1);  // right

    // corner accents on the frame
    const ca = 10;
    for (const [ccx, ccy, dx, dy] of [
      [fx, fy, 1, 1], [fx + fw, fy, -1, 1],
      [fx, fy + fh, 1, -1], [fx + fw, fy + fh, -1, -1],
    ] as [number, number, number, number][]) {
      g.moveTo(ccx, ccy + dy * ca);
      g.lineTo(ccx, ccy);
      g.lineTo(ccx + dx * ca, ccy);
      g.stroke({ color: CYAN, alpha: 0.9, width: 2.5 });
    }

    // divider line below title
    const divY = ly + titlePanelH;
    g.moveTo(fx, divY);
    g.lineTo(fx + fw, divY);
    g.stroke({ color: CYAN, alpha: 0.4, width: 1 });

    // T-shaped accents where divider meets panel outline
    const tLen = 8;
    for (const ttx of [fx, fx + fw]) {
      g.moveTo(ttx, divY - tLen);
      g.lineTo(ttx, divY + tLen);
      g.stroke({ color: CYAN, alpha: 0.9, width: 2.5 });
      const dir = ttx === fx ? 1 : -1;
      g.moveTo(ttx, divY);
      g.lineTo(ttx + dir * tLen, divY);
      g.stroke({ color: CYAN, alpha: 0.9, width: 2.5 });
    }

    // cassette body — translucent white/frosted plastic
    g.roundRect(cx - tw / 2, cy - th / 2, tw, th, 8);
    g.fill({ color: 0xffffff, alpha: 0.25 });
    g.roundRect(cx - tw / 2, cy - th / 2, tw, th, 8);
    g.stroke({ color: 0xffffff, alpha: 0.4, width: 1.5 });

    // ── teal HUD accents around tape body ──
    const tx0 = cx - tw / 2;
    const ty0 = cy - th / 2;
    const tx1 = cx + tw / 2;
    const ty1 = cy + th / 2;
    const accentLen = 20;  // length of bracket arms
    const accentGap = 3;   // offset outward from tape body
    const accentAlpha = 0.8;
    const accentWidth = 4;

    // corner brackets (L-shaped)
    for (const [ax, ay, dx, dy] of [
      [tx0 - accentGap, ty0 - accentGap, 1, 1],   // top-left
      [tx1 + accentGap, ty0 - accentGap, -1, 1],   // top-right
      [tx0 - accentGap, ty1 + accentGap, 1, -1],   // bottom-left
      [tx1 + accentGap, ty1 + accentGap, -1, -1],  // bottom-right
    ] as [number, number, number, number][]) {
      g.moveTo(ax, ay + dy * accentLen);
      g.lineTo(ax, ay);
      g.lineTo(ax + dx * accentLen, ay);
      g.stroke({ color: CYAN, alpha: accentAlpha, width: accentWidth });
    }

    // mid-edge horizontal tick marks (top and bottom)
    const tickLen = 12;
    for (const ey of [ty0 - accentGap, ty1 + accentGap]) {
      g.moveTo(cx - tickLen / 2, ey);
      g.lineTo(cx + tickLen / 2, ey);
      g.stroke({ color: CYAN, alpha: accentAlpha * 0.6, width: 1.5 });
    }

    // mid-edge vertical tick marks (left and right)
    for (const ex of [tx0 - accentGap, tx1 + accentGap]) {
      g.moveTo(ex, cy - tickLen / 2);
      g.lineTo(ex, cy + tickLen / 2);
      g.stroke({ color: CYAN, alpha: accentAlpha * 0.6, width: 1.5 });
    }

    // subtle inner highlight along top edge (frosted glass sheen)
    g.roundRect(cx - tw / 2 + 3, cy - th / 2 + 2, tw - 6, th * 0.15, 4);
    g.fill({ color: 0xffffff, alpha: 0.06 });

    // inner window (clear viewing area — slightly more transparent)
    const ww = tw * 0.75;
    const wh = th * 0.55;
    const winX = cx - ww / 2;
    const winY = cy - wh / 2 - th * 0.05;
    g.roundRect(winX, winY, ww, wh, 4);
    g.fill({ color: 0x0a1828, alpha: 0.35 });
    g.roundRect(winX, winY, ww, wh, 4);
    g.stroke({ color: 0xffffff, alpha: 0.18, width: 1 });

    // inner window teal accent lines (top and bottom edges)
    g.moveTo(winX + 4, winY);
    g.lineTo(winX + ww - 4, winY);
    g.stroke({ color: CYAN, alpha: 0.35, width: 1 });
    g.moveTo(winX + 4, winY + wh);
    g.lineTo(winX + ww - 4, winY + wh);
    g.stroke({ color: CYAN, alpha: 0.35, width: 1 });

    // bottom label area
    const lh = th * 0.15;
    g.rect(cx - tw * 0.35, cy + th / 2 - lh - 4, tw * 0.7, lh);
    g.fill({ color: 0xffffff, alpha: 0.06 });
    g.rect(cx - tw * 0.35, cy + th / 2 - lh - 4, tw * 0.7, lh);
    g.stroke({ color: 0xffffff, alpha: 0.15, width: 1 });

    // corner screws
    const sr = 5 * tapeScale;
    for (const [sx, sy] of [
      [cx - tw / 2 + 14 * tapeScale, cy - th / 2 + 14 * tapeScale],
      [cx + tw / 2 - 14 * tapeScale, cy - th / 2 + 14 * tapeScale],
      [cx - tw / 2 + 14 * tapeScale, cy + th / 2 - 14 * tapeScale],
      [cx + tw / 2 - 14 * tapeScale, cy + th / 2 - 14 * tapeScale],
    ]) {
      g.circle(sx, sy, sr);
      g.fill({ color: 0x556677, alpha: 0.6 });
      g.circle(sx, sy, sr);
      g.stroke({ color: 0x8899aa, alpha: 0.4, width: 1 });
      // cross pattern
      g.moveTo(sx - 3 * tapeScale, sy);
      g.lineTo(sx + 3 * tapeScale, sy);
      g.moveTo(sx, sy - 3 * tapeScale);
      g.lineTo(sx, sy + 3 * tapeScale);
      g.stroke({ color: 0x99aabb, alpha: 0.5, width: 0.5 });
    }

    // tape reel guides (small rollers at bottom of window)
    for (const ox of [-tw * 0.12, 0, tw * 0.12]) {
      g.circle(cx + ox, cy + th * 0.12, 3 * tapeScale);
      g.fill({ color: 0x667788, alpha: 0.6 });
    }
  }

  private drawSpools(): void {
    const tapeScale = 0.75;
    const ly = this.h * 0.12; // align with audio fidelity panel
    const titlePanelH = 40;
    const gap = 20;
    const cy = ly + titlePanelH + gap + (this.h * 0.36) / 2; // cassette center
    const spoolY = cy - this.h * 0.03 * tapeScale; // spools slightly above center

    // Left spool (full of tape — more tape remaining as progress is lower)
    this.drawSpool(this.spoolLeftG, this.w / 2 - this.w * 0.09 * tapeScale, spoolY,
      this.w * 0.065 * tapeScale, 1 - this.progress, -this.spoolAngle * 0.3);

    // Right spool (tape winds onto here)
    this.drawSpool(this.spoolRightG, this.w / 2 + this.w * 0.09 * tapeScale, spoolY,
      this.w * 0.065 * tapeScale, this.progress, this.spoolAngle);
  }

  private drawSpool(g: Graphics, cx: number, cy: number, r: number, fill: number, angle: number): void {
    g.clear();

    // tape wound on spool
    const minR = r * 0.35;
    const tapeR = minR + (r - minR) * Math.max(0.05, fill);
    g.circle(cx, cy, tapeR);
    g.fill({ color: 0x1a0a20, alpha: 0.9 });
    g.circle(cx, cy, tapeR);
    g.stroke({ color: 0x3a1a40, width: 1 });

    // tape sheen rings
    for (let i = 0; i < 3; i++) {
      const rr = minR + (tapeR - minR) * (i / 3 + 0.1);
      g.circle(cx, cy, rr);
      g.stroke({ color: MAGENTA, alpha: 0.08, width: 1 });
    }

    // hub
    g.circle(cx, cy, minR);
    g.fill({ color: 0x222838 });
    g.circle(cx, cy, minR);
    g.stroke({ color: 0x556677, width: 1 });

    // star/gear teeth on hub
    const teeth = 6;
    for (let i = 0; i < teeth; i++) {
      const a = angle + (i / teeth) * Math.PI * 2;
      const ix = cx + Math.cos(a) * minR * 0.4;
      const iy = cy + Math.sin(a) * minR * 0.4;
      const ox = cx + Math.cos(a) * minR * 0.85;
      const oy = cy + Math.sin(a) * minR * 0.85;
      g.moveTo(ix, iy);
      g.lineTo(ox, oy);
      g.stroke({ color: 0x778899, width: 1.5 });
    }

    // center dot
    g.circle(cx, cy, 2);
    g.fill({ color: 0x99aabb });
  }

  private drawTangle(): void {
    const g = this.tangleG;
    g.clear();

    const remaining = 1 - this.progress;
    if (remaining < 0.05) return;

    const tapeScale = 0.75;
    const ly = this.h * 0.12; // align with audio fidelity panel
    const titlePanelH = 40;
    const gap = 20;
    const cassetteCenterY = ly + titlePanelH + gap + (this.h * 0.36) / 2; // cassette center

    const cx = this.w / 2 + this.w * 0.04 * tapeScale;
    const cy = cassetteCenterY + this.h * 0.06 * tapeScale; // tangle below cassette center

    // draw tangled tape strands
    const strands = 8;
    for (let i = 0; i < strands; i++) {
      const phase = this.tanglePhase + i * 1.3;
      const spread = remaining * this.w * 0.12 * tapeScale;
      const alpha = remaining * 0.5;

      g.moveTo(
        cx + Math.sin(phase) * spread,
        cy + Math.cos(phase * 0.7) * spread * 0.5,
      );

      for (let j = 1; j <= 6; j++) {
        const t = j / 6;
        const px = cx + Math.sin(phase + t * 4) * spread * (1 - t * 0.3);
        const py = cy + Math.cos(phase * 0.7 + t * 3) * spread * 0.5 * (1 - t * 0.2);
        g.lineTo(px, py);
      }
      g.stroke({ color: MAGENTA, alpha, width: 1 });
    }
  }

  private drawProgressBar(): void {
    const g = this.progressG;
    g.clear();

    const ly = this.h * 0.12; // align with audio fidelity panel
    const titlePanelH = 40;
    const gap = 20;

    const tapeScale = 0.75;
    const cx = this.w / 2;
    const cy = ly + titlePanelH + gap + (this.h * 0.36) / 2; // cassette center
    const cw = this.w * 0.42;  // panel width (original)
    const ch = this.h * 0.36;  // panel height (original)
    const th = ch * tapeScale;  // tape body height

    // position bar so bottom padding (bar bottom to frame bottom) matches top padding (frame top to tape top)
    const frameMargin = 6;
    const topPadding = ch / 2 + frameMargin - th / 2; // frame top to tape top
    const panelBottom = cy + ch / 2 + frameMargin;
    const bw = cw * 0.56;
    const bh = 30; // match stability gauge height
    const bx = cx - bw / 2;
    const tapeBottom = cy + th / 2;
    const by = tapeBottom + topPadding; // bar top matches top padding below tape body

    g.rect(bx, by, bw, bh);
    g.fill({ color: 0x0a1020 });
    g.rect(bx, by, bw, bh);
    g.stroke({ color: CYAN, alpha: 0.3, width: 1 });

    // fill
    if (this.progress > 0) {
      g.rect(bx + 1, by + 1, (bw - 2) * this.progress, bh - 2);
      g.fill({ color: this.progress >= 1 ? GREEN : CYAN, alpha: 0.8 });
    }

    this.progressLabel.text = this.progress >= 1
      ? 'REPAIR COMPLETE!'
      : `REPAIR PROGRESS: ${Math.floor(this.progress * 100)}%`;
    this.progressLabel.style.fill = this.progress >= 1 ? GREEN : GREEN;
    // center text inside the bar
    this.progressLabel.position.set(
      bx + (bw - this.progressLabel.width) / 2,
      by + (bh - this.progressLabel.height) / 2,
    );
  }

  private drawTensionBar(): void {
    const g = this.tensionG;
    g.clear();

    const ly = this.h * 0.12;
    const titlePanelH = 40;
    const gap = 20;

    const tapeScale = 0.75;
    const cx = this.w / 2;
    const cy = ly + titlePanelH + gap + (this.h * 0.36) / 2;
    const cw = this.w * 0.42;
    const ch = this.h * 0.36;
    const th = ch * tapeScale;

    const frameMargin = 6;
    const topPadding = ch / 2 + frameMargin - th / 2;
    const tapeBottom = cy + th / 2;
    const progressBarY = tapeBottom + topPadding;
    const bh = 30;
    const bw = cw * 0.56;
    const bx = cx - bw / 2;
    const by = progressBarY + bh + 6; // 6px gap below progress bar

    // background
    g.rect(bx, by, bw, bh);
    g.fill({ color: 0x0a1020 });
    g.rect(bx, by, bw, bh);
    g.stroke({ color: CYAN, alpha: 0.3, width: 1 });

    // fill — amber/orange gradient like a tension meter
    const fillW = (bw - 8) * this.tension;
    if (fillW > 0) {
      const steps = Math.max(2, Math.ceil(fillW / 2));
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        const r = Math.round(255 * (0.3 + 0.7 * t));
        const green = Math.round(160 * (1 - t * 0.5));
        const b = Math.round(32 * (1 - t));
        const color = (r << 16) | (green << 8) | b;

        const stepW = fillW / steps;
        g.rect(bx + 4 + i * stepW, by + 4, stepW + 0.5, bh - 8);
        g.fill({ color, alpha: 0.85 });
      }

      // glowing neon bar at the right end
      const glowX = bx + 4 + fillW;

      g.rect(glowX - 6, by + 1, 12, bh - 2);
      g.fill({ color: 0xaa6600, alpha: 0.15 });

      g.rect(glowX - 4, by + 2, 8, bh - 4);
      g.fill({ color: 0xcc8800, alpha: 0.3 });

      g.rect(glowX - 2, by + 3, 4, bh - 6);
      g.fill({ color: 0xeecc88, alpha: 0.6 });

      g.rect(glowX - 1, by + 4, 2, bh - 8);
      g.fill({ color: 0xffffff, alpha: 1.0 });
    }

    // center label inside the bar
    this.tensionLabel.position.set(
      bx + (bw - this.tensionLabel.width) / 2,
      by + (bh - this.tensionLabel.height) / 2,
    );
  }

  private drawStabilityGauge(): void {
    const g = this.stabilityG;
    g.clear();

    const lx = this.w * 0.04;
    const ly = this.h * 0.12;
    const pw = this.w * 0.22;

    const bx = lx + 8;
    const by = ly + 28;
    const bw = pw - 16;
    const bh = 30;

    // background
    g.rect(bx, by, bw, bh);
    g.fill({ color: 0x0a1020 });
    g.rect(bx, by, bw, bh);
    g.stroke({ color: CYAN, alpha: 0.3, width: 1 });

    // gradient fill - darker to brighter teal (left to right)
    const fillW = (bw - 8) * this.stability;
    if (fillW > 0) {
      const steps = Math.max(2, Math.ceil(fillW / 2));
      // pulse sweeps left-to-right over ~2 seconds, repeating
      const pulseT = (this.time * 0.5) % 1.0; // 0..1 position of pulse front
      const pulseWidth = 0.25; // width of the bright band (fraction of bar)

      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1); // 0 = left (darker), 1 = right (brighter)
        const darkTone = 0.2;
        const brightTone = 1.0;
        const baseBrightness = darkTone + (brightTone - darkTone) * t;

        // pulse boost: linear falloff from pulse front
        const dist = Math.abs(t - pulseT);
        const pulseFactor = Math.max(0, 1 - dist / pulseWidth);
        const brightness = Math.min(1.4, baseBrightness + pulseFactor * 0.5);

        // CYAN = 0x00e5ff (r=0, g=229, b=255)
        const r = Math.round(0 * brightness);
        const green = Math.round(Math.min(255, 229 * brightness));
        const b = Math.round(Math.min(255, 255 * brightness));
        const color = (r << 16) | (green << 8) | b;

        const stepW = fillW / steps;
        g.rect(bx + 4 + i * stepW, by + 4, stepW + 0.5, bh - 8);
        g.fill({ color, alpha: 0.85 });
      }

      // glowing neon bar at the right end of the filled area - multi-layer glow like ocean grid
      const glowX = bx + 4 + fillW;

      // wide outer halo
      g.rect(glowX - 6, by + 1, 12, bh - 2);
      g.fill({ color: 0x88ccdd, alpha: 0.15 });

      // mid bloom
      g.rect(glowX - 4, by + 2, 8, bh - 4);
      g.fill({ color: 0xaaddee, alpha: 0.3 });

      // inner bloom
      g.rect(glowX - 2, by + 3, 4, bh - 6);
      g.fill({ color: 0xcceeff, alpha: 0.6 });

      // bright core
      g.rect(glowX - 1, by + 4, 2, bh - 8);
      g.fill({ color: 0xffffff, alpha: 1.0 });
    }

    this.stabilityVal.text = this.stability > 0.7 ? 'STABLE' : this.stability > 0.4 ? 'FLUCTUATING' : 'UNSTABLE';
    this.stabilityVal.style.fill = 0x88aacc;
  }

  private updateSpectrum(dt: number): void {
    const n = this.NUM_BARS;
    const energy = 0.3 + this.progress * 0.7; // overall energy scales with repair

    // fire random beats — clusters of bars spike together
    if (this.time >= this.nextBeat) {
      // pick a random cluster center and width
      const center = Math.random() * n;
      const width  = 1 + Math.random() * 4;
      const strength = 0.5 + Math.random() * 0.5;
      for (let i = 0; i < n; i++) {
        const dist = Math.abs(i - center);
        if (dist < width) {
          const falloff = 1 - dist / width;
          this.barTargets[i] = Math.min(1, this.barTargets[i] + strength * falloff * energy);
        }
      }
      // next beat: rapid-fire interval (60-200ms equivalent in time units)
      this.nextBeat = this.time + 0.03 + Math.random() * 0.1;
    }

    // per-bar physics each frame
    for (let i = 0; i < n; i++) {
      // smoothly rise toward target
      if (this.barLevels[i] < this.barTargets[i]) {
        this.barLevels[i] += (this.barTargets[i] - this.barLevels[i]) * Math.min(1, 0.35 * dt);
      }
      // gravity pull down
      this.barTargets[i] *= Math.pow(0.88, dt);
      this.barLevels[i]  *= Math.pow(0.92, dt);

      // add subtle jitter so they never look frozen
      this.barLevels[i] += (Math.random() - 0.5) * 0.02 * energy;
      this.barLevels[i] = Math.max(0.03, Math.min(1, this.barLevels[i]));

      // peak hold
      if (this.barLevels[i] >= this.barPeaks[i] - 0.01) {
        this.barPeaks[i] = this.barLevels[i];
        this.barPeakAge[i] = 0;
      } else {
        this.barPeakAge[i] += dt;
        // hold for ~30 frames then fall
        if (this.barPeakAge[i] > 30) {
          this.barPeaks[i] *= Math.pow(0.95, dt);
        }
      }
    }
  }

  private drawFidelityBars(): void {
    const g = this.fidelityG;
    g.clear();

    const rx = this.w * 0.74;
    const ly = this.h * 0.12;
    const pw = this.w * 0.22;

    const pad = 10;
    const n = this.NUM_BARS;
    const maxH = 70;
    const boxX = rx + pad - 2;
    const boxY = ly + 26;
    const boxW = pw - pad * 2 + 4;
    const boxH = maxH + 8;

    // inner box outline around the spectrum
    g.rect(boxX, boxY, boxW, boxH);
    g.fill({ color: 0x060e18, alpha: 0.5 });
    g.rect(boxX, boxY, boxW, boxH);
    g.stroke({ color: CYAN, alpha: 0.3, width: 1 });

    const bw = (pw - 20) / n;
    const bx = rx + pad;
    const by = boxY + 4;

    for (let i = 0; i < n; i++) {
      const level = this.barLevels[i];
      const h = maxH * level;
      const barX = bx + i * bw + 1;
      const barW = bw - 2;
      const barY = by + maxH - h;

      // gradient from red/orange (bottom) to purple (top)
      const steps = Math.max(2, Math.round(h / 3));
      for (let s = 0; s < steps; s++) {
        const t = s / (steps - 1); // 0 = top, 1 = bottom
        const r  = Math.round(0x80 + 0x7f * t);
        const gv = Math.round(0x10 * (1 - t));
        const b  = Math.round(0xc0 * (1 - t * 0.6));
        const color = (r << 16) | (gv << 8) | b;
        const sh = h / steps;
        g.rect(barX, barY + s * sh, barW, sh + 0.5);
        g.fill({ color, alpha: 0.85 });
      }

      // peak hold indicator (small bright line)
      const peakY = by + maxH - maxH * this.barPeaks[i];
      g.rect(barX, peakY, barW, 2);
      g.fill({ color: 0xff4488, alpha: 0.9 });
    }

    this.fidelityVal.text = this.progress > 0.8 ? 'STRONG' : this.progress > 0.4 ? 'WEAK' : 'DEGRADED';
    this.fidelityVal.style.fill = this.progress > 0.8 ? GREEN : this.progress > 0.4 ? AMBER : RED;
  }

  private drawDial(): void {
    const g = this.dialG;
    g.clear();

    const cx = this.w / 2;
    const dy = this.h * 0.82;
    const r  = this.w * 0.06;

    // dial background arc
    g.circle(cx, dy, r);
    g.fill({ color: PANEL, alpha: 0.9 });
    g.circle(cx, dy, r);
    g.stroke({ color: CYAN, alpha: 0.4, width: 1.5 });

    // tick marks around bottom half
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      const inner = r * 0.7;
      const outer = r * 0.9;
      g.moveTo(cx + Math.cos(a) * inner, dy + Math.sin(a) * inner);
      g.lineTo(cx + Math.cos(a) * outer, dy + Math.sin(a) * outer);
      g.stroke({ color: 0x556677, width: 1 });
    }

    // needle
    const needleAngle = Math.PI * 0.75 + this.windingSpeed * Math.PI * 1.5;
    g.moveTo(cx, dy);
    g.lineTo(cx + Math.cos(needleAngle) * r * 0.75, dy + Math.sin(needleAngle) * r * 0.75);
    g.stroke({ color: RED, width: 2 });

    // center cap
    g.circle(cx, dy, 3);
    g.fill({ color: 0x99aabb });
  }

  private layoutText(): void {
    // banner
    this.bannerText.position.set(
      (this.w - this.bannerText.width) / 2, 16,
    );

    // title above cassette - centered within its panel
    const ly = this.h * 0.12; // align with audio fidelity panel
    const titlePanelH = 40;
    const titlePanelY = ly; // panel y top
    this.titleText.position.set(
      (this.w - this.titleText.width) / 2,
      titlePanelY + 12, // text at 12px padding from panel top
    );

    // left panels
    const lx = this.w * 0.04;
    const stabilityPanelH = 87;
    this.stabilityLabel.position.set(lx + 8, ly + 8);
    this.stabilityVal.position.set(lx + 8, ly + 64);

    // center instruction text vertically within its panel
    const gap = 20; // same as title panel to cassette gap
    const instructPanelY = ly + stabilityPanelH + gap;
    const instructPanelH = this.h * 0.26;
    this.instructText.position.set(lx + 8, instructPanelY + (instructPanelH - this.instructText.height) / 2);

    // right panel
    const rx = this.w * 0.74;
    this.fidelityLabel.position.set(rx + 8, ly + 6);
    this.fidelitySignal.position.set(rx + 8, ly + 26 + 78 + 6);
    this.fidelityVal.position.set(rx + 8 + this.fidelitySignal.width + 4, ly + 26 + 78 + 6);

    // dial labels
    const dy = this.h * 0.82;
    const r  = this.w * 0.06;
    this.dialLabel.position.set((this.w - this.dialLabel.width) / 2, dy + r + 6);
    this.dialSlow.position.set(this.w / 2 - r - 20, dy + r - 6);
    this.dial100.position.set(this.w / 2 + r + 4, dy + r - 6);
  }
}

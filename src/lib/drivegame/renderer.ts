import { Graphics } from 'pixi.js';
import { SunsetRenderer } from '$lib/sunset';
import type { PaletteConfig } from '$lib/sunset';

export type CarStyle = 'classic' | 'sport';

export class DriveGameRenderer extends SunsetRenderer {
  // Car state
  private carLaneX = 0;    // -1 (left edge) to +1 (right edge)
  private carDepth = 0.82; // 0 = horizon, 1 = bottom of screen
  private carStyle: CarStyle = 'classic';

  // Input tracking
  private keysDown = new Set<string>();
  private onKeyDown = (e: KeyboardEvent) => {
    this.keysDown.add(e.key.toLowerCase());
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keysDown.delete(e.key.toLowerCase());
  };

  setCarStyle(style: CarStyle): void {
    this.carStyle = style;
    const g = this.findByLabel('car');
    if (g) {
      g.clear();
      this.renderCarGraphics(g);
    }
  }

  async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
    await super.init(canvas, width, height);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    super.destroy();
  }

  protected render(): void {
    super.render();
    this.drawCar();
  }

  protected animate(ticker: { deltaTime: number }): void {
    super.animate(ticker);
    this.processInput(ticker.deltaTime);
    this.updateCar();
  }

  private processInput(dt: number): void {
    const speed = 0.025 * dt;

    if (this.keysDown.has('a') || this.keysDown.has('arrowleft'))  this.carLaneX -= speed;
    if (this.keysDown.has('d') || this.keysDown.has('arrowright')) this.carLaneX += speed;
    if (this.keysDown.has('w') || this.keysDown.has('arrowup'))   this.carDepth -= speed * 0.5;
    if (this.keysDown.has('s') || this.keysDown.has('arrowdown')) this.carDepth += speed * 0.5;

    this.carLaneX = Math.max(-0.85, Math.min(0.85, this.carLaneX));
    this.carDepth = Math.max(0.15, Math.min(0.95, this.carDepth));
  }

  private getCarScreenPos(): { x: number; y: number; scale: number } {
    const horizonY = this.height * 0.55;
    const groundH  = this.height - horizonY;
    const cx       = this.width / 2;
    const spread   = this.width * 1.5;

    const screenY = horizonY + this.carDepth * groundH;
    const screenX = cx + this.carLaneX * this.carDepth * (spread / 2);
    const scale   = this.carDepth;

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
      // Subtle tread highlight along top edge
      g.moveTo(tx + 2 * s, tireTop + 1.5 * s);
      g.lineTo(tx + tireW - 2 * s, tireTop + 1.5 * s);
      g.stroke({ width: 1 * s, color: 0x1c1c28, alpha: 0.8 });
      // Outer tyre sidewall edge lines
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
    // Wide horizontal rear grille/vent panel — spans most of body width
    // Sits in upper portion of body, between the taillight clusters
    // -----------------------------------------------------------------------
    const tailR     = 10 * s;
    const tailGap   = 6 * s;
    const tailInset = 10 * s;
    // cluster width = tailR + tailGap + tailR (two lights side by side)
    const clusterW  = tailR * 2 + tailGap + tailR * 2;

    const ventL   = bodyLeft + tailInset + clusterW + 8 * s;
    const ventR   = bodyLeft + w - tailInset - clusterW - 8 * s;
    const ventW   = ventR - ventL;
    const ventTop = bodyTop + 6 * s;
    const ventH   = bodyH * 0.68;

    if (ventW > 20 * s) {
      g.rect(ventL, ventTop, ventW, ventH);
      g.fill(0x08090e);

      // Horizontal louvre slats
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
    // Four circular taillights — two left cluster, two right cluster
    // -----------------------------------------------------------------------
    const tailY = bodyTop + 20 * s;

    // Left cluster (left light outermost, right light toward center)
    const tL1 = bodyLeft + tailInset + tailR;
    const tL2 = tL1 + tailR + tailGap + tailR;
    // Right cluster (mirror)
    const tR1 = bodyLeft + w - tailInset - tailR;
    const tR2 = tR1 - (tailR + tailGap + tailR);

    this.drawCircleTaillight(g, tL1, tailY, tailR, s, palette);
    this.drawCircleTaillight(g, tL2, tailY, tailR, s, palette);
    this.drawCircleTaillight(g, tR2, tailY, tailR, s, palette);
    this.drawCircleTaillight(g, tR1, tailY, tailR, s, palette);

    // -----------------------------------------------------------------------
    // Lower bumper strip (dark horizontal band above diffuser)
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
    // Rear engine cover / windshield area — louvered slats behind roofline
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
}

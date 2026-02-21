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
  // Sport car — low & wide, rear wing, four circular taillights
  // ---------------------------------------------------------------------------
  private renderSportCar(g: Graphics): void {
    const { x, y, scale } = this.getCarScreenPos();
    const palette = this.getActivePalette();
    const s = scale;

    // 3x base dimensions — wider and lower than classic
    const w = 295 * s;
    const bodyH = 85 * s;
    const cabinH = 56 * s;
    const diffuserH = 18 * s;
    const fenderBulge = 10 * s;
    const pulseAlpha = 0.3 + 0.25 * Math.sin(this.animationTime * 2.5);

    const bodyTop  = y - bodyH;
    const bodyLeft = x - w / 2;

    // --- Road reflection ---
    for (let i = 8; i >= 0; i--) {
      const spread = (i + 1) * 9 * s;
      const alpha = 0.05 * (1 - i / 8);
      g.rect(bodyLeft - spread * 0.5, y, w + spread, spread + 3 * s);
      g.fill({ color: 0xff2040, alpha });
    }

    // --- Neon underglow ---
    for (let i = 7; i >= 0; i--) {
      const spread = (i + 1) * 6 * s;
      const alpha = 0.08 * (1 - i / 7);
      g.rect(bodyLeft - spread - fenderBulge, y - 3 * s, w + (spread + fenderBulge) * 2, spread + 3 * s);
      g.fill({ color: palette.gridColor, alpha });
    }

    // --- Rear diffuser ---
    const diffLeft = bodyLeft + 10 * s;
    const diffW = w - 20 * s;
    g.rect(diffLeft, y - diffuserH, diffW, diffuserH);
    g.fill(0x060614);
    // Diffuser slats
    const slats = 10;
    const slatArea = diffW - 8 * s;
    for (let i = 0; i <= slats; i++) {
      const sx = diffLeft + 4 * s + (i / slats) * slatArea;
      g.moveTo(sx, y - diffuserH + 2 * s);
      g.lineTo(sx, y - 2 * s);
      g.stroke({ width: 1 * s, color: 0x1a1a38, alpha: 0.7 });
    }
    // Diffuser outline
    g.rect(diffLeft, y - diffuserH, diffW, diffuserH);
    g.stroke({ width: 0.6 * s, color: 0x2a2a50, alpha: 0.5 });

    // --- Main body with flared fenders ---
    g.poly([
      bodyLeft - fenderBulge, y - diffuserH,
      bodyLeft - fenderBulge, bodyTop + bodyH * 0.5,
      bodyLeft - fenderBulge * 0.3, bodyTop + bodyH * 0.2,
      bodyLeft, bodyTop,
      bodyLeft + w, bodyTop,
      bodyLeft + w + fenderBulge * 0.3, bodyTop + bodyH * 0.2,
      bodyLeft + w + fenderBulge, bodyTop + bodyH * 0.5,
      bodyLeft + w + fenderBulge, y - diffuserH,
    ]);
    g.fill(0x141430);

    // Fender highlight (vertical light catch on bulge)
    g.moveTo(bodyLeft - fenderBulge + 2 * s, bodyTop + bodyH * 0.55);
    g.lineTo(bodyLeft - fenderBulge + 2 * s, y - diffuserH - 2 * s);
    g.stroke({ width: 1 * s, color: 0x28284e, alpha: 0.6 });
    g.moveTo(bodyLeft + w + fenderBulge - 2 * s, bodyTop + bodyH * 0.55);
    g.lineTo(bodyLeft + w + fenderBulge - 2 * s, y - diffuserH - 2 * s);
    g.stroke({ width: 1 * s, color: 0x28284e, alpha: 0.6 });

    // Body creases
    const crease1Y = bodyTop + bodyH * 0.35;
    const crease2Y = bodyTop + bodyH * 0.6;
    g.moveTo(bodyLeft - fenderBulge + 4 * s, crease1Y);
    g.lineTo(bodyLeft + w + fenderBulge - 4 * s, crease1Y);
    g.stroke({ width: 0.8 * s, color: 0x1e1e40, alpha: 0.7 });
    g.moveTo(bodyLeft - fenderBulge + 6 * s, crease2Y);
    g.lineTo(bodyLeft + w + fenderBulge - 6 * s, crease2Y);
    g.stroke({ width: 0.6 * s, color: 0x1e1e40, alpha: 0.5 });

    // Vertical panel lines (quarter panel seams)
    const qtrInset = 30 * s;
    g.moveTo(bodyLeft + qtrInset, bodyTop + 6 * s);
    g.lineTo(bodyLeft + qtrInset - 3 * s, y - diffuserH - 2 * s);
    g.stroke({ width: 0.5 * s, color: 0x1a1a38, alpha: 0.5 });
    g.moveTo(bodyLeft + w - qtrInset, bodyTop + 6 * s);
    g.lineTo(bodyLeft + w - qtrInset + 3 * s, y - diffuserH - 2 * s);
    g.stroke({ width: 0.5 * s, color: 0x1a1a38, alpha: 0.5 });

    // --- Rear wheel arches (larger, sportier) ---
    const archR = 22 * s;
    const archY = y - diffuserH;
    g.arc(bodyLeft + 4 * s, archY, archR, -Math.PI, 0);
    g.fill(0x050510);
    g.arc(bodyLeft + w - 4 * s, archY, archR, -Math.PI, 0);
    g.fill(0x050510);
    // Wheel hint (dark circle inside arch)
    const wheelR = 14 * s;
    g.circle(bodyLeft + 4 * s, archY - 2 * s, wheelR);
    g.fill(0x080818);
    g.circle(bodyLeft + 4 * s, archY - 2 * s, wheelR);
    g.stroke({ width: 1 * s, color: 0x222244, alpha: 0.5 });
    g.circle(bodyLeft + w - 4 * s, archY - 2 * s, wheelR);
    g.fill(0x080818);
    g.circle(bodyLeft + w - 4 * s, archY - 2 * s, wheelR);
    g.stroke({ width: 1 * s, color: 0x222244, alpha: 0.5 });

    // --- Cabin (lower, aggressively sloped) ---
    const cabInset = w * 0.13;
    const cabTopInset = w * 0.22;
    const cabinTop = bodyTop - cabinH;
    g.poly([
      bodyLeft + cabInset, bodyTop,
      bodyLeft + w - cabInset, bodyTop,
      bodyLeft + w - cabTopInset, cabinTop,
      bodyLeft + cabTopInset, cabinTop,
    ]);
    g.fill(0x0c0c20);

    // C-pillars (thick, sporty)
    const pillarW = 10 * s;
    g.poly([
      bodyLeft + cabInset, bodyTop,
      bodyLeft + cabInset + pillarW, bodyTop,
      bodyLeft + cabTopInset + pillarW * 0.6, cabinTop,
      bodyLeft + cabTopInset, cabinTop,
    ]);
    g.fill(0x0a0a1a);
    g.poly([
      bodyLeft + w - cabInset - pillarW, bodyTop,
      bodyLeft + w - cabInset, bodyTop,
      bodyLeft + w - cabTopInset, cabinTop,
      bodyLeft + w - cabTopInset - pillarW * 0.6, cabinTop,
    ]);
    g.fill(0x0a0a1a);

    // Roof edge
    g.moveTo(bodyLeft + cabTopInset, cabinTop);
    g.lineTo(bodyLeft + w - cabTopInset, cabinTop);
    g.stroke({ width: 1.5 * s, color: 0x222244, alpha: 0.7 });

    // --- Rear windshield ---
    const winPad = 12 * s;
    const winBotInset = cabInset + winPad;
    const winTopInset = cabTopInset + winPad;
    const winTop = cabinTop + 8 * s;
    const winBot = bodyTop - 4 * s;
    g.poly([
      bodyLeft + winBotInset, winBot,
      bodyLeft + w - winBotInset, winBot,
      bodyLeft + w - winTopInset, winTop,
      bodyLeft + winTopInset, winTop,
    ]);
    g.fill({ color: palette.gridColor, alpha: 0.12 });

    // Defroster lines
    const defLines = 6;
    for (let i = 1; i < defLines; i++) {
      const t = i / defLines;
      const ly = winTop + t * (winBot - winTop);
      const lInset = winTopInset + t * (winBotInset - winTopInset);
      g.moveTo(bodyLeft + lInset + 4 * s, ly);
      g.lineTo(bodyLeft + w - lInset - 4 * s, ly);
      g.stroke({ width: 0.4 * s, color: palette.gridColor, alpha: 0.10 });
    }

    // Window frame
    g.poly([
      bodyLeft + winBotInset, winBot,
      bodyLeft + w - winBotInset, winBot,
      bodyLeft + w - winTopInset, winTop,
      bodyLeft + winTopInset, winTop,
    ]);
    g.closePath();
    g.stroke({ width: 0.8 * s, color: palette.gridColor, alpha: 0.25 });

    // --- Rear wing/spoiler ---
    const wingW = w * 0.88;
    const wingH = 5 * s;
    const wingY = cabinTop - 18 * s;
    const wingLeft = x - wingW / 2;

    // Wing endplates (tall vertical fins)
    const epW = 4 * s;
    const epH = 22 * s;
    g.poly([
      wingLeft - epW, wingY - 2 * s,
      wingLeft, wingY - 2 * s,
      wingLeft + 2 * s, wingY + epH,
      wingLeft - epW + 1 * s, wingY + epH,
    ]);
    g.fill(0x18183a);
    g.poly([
      wingLeft + wingW, wingY - 2 * s,
      wingLeft + wingW + epW, wingY - 2 * s,
      wingLeft + wingW + epW - 1 * s, wingY + epH,
      wingLeft + wingW - 2 * s, wingY + epH,
    ]);
    g.fill(0x18183a);

    // Wing pillars (swan-neck style from cabin top)
    const pW = 4 * s;
    const pillarInset = w * 0.20;
    // Left pillar
    g.poly([
      bodyLeft + pillarInset, cabinTop,
      bodyLeft + pillarInset + pW, cabinTop,
      wingLeft + 14 * s + pW, wingY + wingH,
      wingLeft + 14 * s, wingY + wingH,
    ]);
    g.fill(0x14142c);
    // Right pillar
    g.poly([
      bodyLeft + w - pillarInset - pW, cabinTop,
      bodyLeft + w - pillarInset, cabinTop,
      wingLeft + wingW - 14 * s, wingY + wingH,
      wingLeft + wingW - 14 * s - pW, wingY + wingH,
    ]);
    g.fill(0x14142c);

    // Wing blade
    g.rect(wingLeft, wingY, wingW, wingH);
    g.fill(0x1a1a3e);
    // Wing upper surface highlight
    g.rect(wingLeft + 4 * s, wingY, wingW - 8 * s, 1.5 * s);
    g.fill({ color: 0x333366, alpha: 0.5 });
    // Wing outline
    g.rect(wingLeft, wingY, wingW, wingH);
    g.stroke({ width: 1 * s, color: palette.gridColor, alpha: 0.5 });
    // Endplate outlines
    g.poly([
      wingLeft - epW, wingY - 2 * s,
      wingLeft, wingY - 2 * s,
      wingLeft + 2 * s, wingY + epH,
      wingLeft - epW + 1 * s, wingY + epH,
    ]);
    g.closePath();
    g.stroke({ width: 0.6 * s, color: palette.gridColor, alpha: 0.3 });
    g.poly([
      wingLeft + wingW, wingY - 2 * s,
      wingLeft + wingW + epW, wingY - 2 * s,
      wingLeft + wingW + epW - 1 * s, wingY + epH,
      wingLeft + wingW - 2 * s, wingY + epH,
    ]);
    g.closePath();
    g.stroke({ width: 0.6 * s, color: palette.gridColor, alpha: 0.3 });

    // --- Four circular taillights (two per side) ---
    const tailR = 9 * s;
    const tailSmallR = 7 * s;
    const tailY = bodyTop + 22 * s;
    const tailGap = 28 * s;
    const tailOuterInset = 18 * s;

    // Left pair
    this.drawCircleTaillight(g, bodyLeft + tailOuterInset, tailY, tailR, s, palette);
    this.drawCircleTaillight(g, bodyLeft + tailOuterInset + tailGap, tailY, tailSmallR, s, palette);
    // Right pair
    this.drawCircleTaillight(g, bodyLeft + w - tailOuterInset, tailY, tailR, s, palette);
    this.drawCircleTaillight(g, bodyLeft + w - tailOuterInset - tailGap, tailY, tailSmallR, s, palette);

    // --- Taillight bar (connecting light strip between pairs on each side) ---
    const barY = tailY - 2 * s;
    const barH = 3 * s;
    // Left bar
    g.rect(bodyLeft + tailOuterInset + tailR, barY, tailGap - tailR - tailSmallR, barH);
    g.fill({ color: 0xff2040, alpha: 0.15 });
    // Right bar
    g.rect(bodyLeft + w - tailOuterInset - tailGap + tailSmallR, barY, tailGap - tailR - tailSmallR, barH);
    g.fill({ color: 0xff2040, alpha: 0.15 });

    // --- Center section (between tail light clusters) ---
    // Engine vent / mesh grille
    const ventLeft = bodyLeft + tailOuterInset + tailGap + tailSmallR + 6 * s;
    const ventRight = bodyLeft + w - tailOuterInset - tailGap - tailSmallR - 6 * s;
    const ventW = ventRight - ventLeft;
    const ventY = bodyTop + 12 * s;
    const ventH = 24 * s;
    if (ventW > 10 * s) {
      g.rect(ventLeft, ventY, ventW, ventH);
      g.fill(0x0a0a1c);
      // Mesh lines
      const meshLines = Math.floor(ventW / (6 * s));
      for (let i = 0; i <= meshLines; i++) {
        const mx = ventLeft + (i / meshLines) * ventW;
        g.moveTo(mx, ventY + 2 * s);
        g.lineTo(mx, ventY + ventH - 2 * s);
        g.stroke({ width: 0.5 * s, color: 0x1a1a38, alpha: 0.6 });
      }
      g.rect(ventLeft, ventY, ventW, ventH);
      g.stroke({ width: 0.6 * s, color: 0x222244, alpha: 0.4 });
    }

    // --- Exhaust tips (quad, larger) ---
    const exhR = 5 * s;
    const exhY = y - 5 * s;
    const exhSpacing = 14 * s;
    for (const ox of [-exhSpacing - exhR, -exhR * 0.5, exhR * 0.5, exhSpacing + exhR]) {
      g.circle(x + ox, exhY, exhR);
      g.fill(0x1a1a38);
      g.circle(x + ox, exhY, exhR - 1.5 * s);
      g.fill(0x0e0e20);
      g.circle(x + ox, exhY, exhR);
      g.stroke({ width: 0.8 * s, color: 0x444466, alpha: 0.7 });
    }

    // --- License plate ---
    const plateW = 42 * s;
    const plateH = 12 * s;
    const plateX = x - plateW / 2;
    const plateY = y - diffuserH - plateH - 3 * s;
    g.rect(plateX, plateY, plateW, plateH);
    g.fill(0xd0d0c0);
    g.moveTo(plateX + 7 * s, plateY + plateH * 0.55);
    g.lineTo(plateX + plateW - 7 * s, plateY + plateH * 0.55);
    g.stroke({ width: 1.5 * s, color: 0x333333, alpha: 0.5 });
    g.rect(plateX, plateY, plateW, plateH);
    g.stroke({ width: 0.8 * s, color: 0x555555, alpha: 0.8 });
    // Plate light
    g.rect(plateX + plateW * 0.3, plateY - 2.5 * s, plateW * 0.4, 2.5 * s);
    g.fill({ color: 0xffffee, alpha: 0.2 });

    // --- Trunk badge ---
    const badgeR = 6 * s;
    const badgeY = bodyTop + (bodyH - diffuserH) * 0.55;
    g.circle(x, badgeY, badgeR);
    g.fill({ color: 0x888899, alpha: 0.2 });
    g.circle(x, badgeY, badgeR);
    g.stroke({ width: 0.8 * s, color: 0x666688, alpha: 0.35 });
    // Inner badge ring
    g.circle(x, badgeY, badgeR * 0.55);
    g.stroke({ width: 0.5 * s, color: 0x666688, alpha: 0.25 });

    // --- Neon outlines (pulsing) ---
    // Body outline
    g.poly([
      bodyLeft - fenderBulge, y - diffuserH,
      bodyLeft - fenderBulge, bodyTop + bodyH * 0.5,
      bodyLeft - fenderBulge * 0.3, bodyTop + bodyH * 0.2,
      bodyLeft, bodyTop,
      bodyLeft + w, bodyTop,
      bodyLeft + w + fenderBulge * 0.3, bodyTop + bodyH * 0.2,
      bodyLeft + w + fenderBulge, bodyTop + bodyH * 0.5,
      bodyLeft + w + fenderBulge, y - diffuserH,
    ]);
    g.closePath();
    g.stroke({ width: 1.2 * s, color: palette.gridColor, alpha: pulseAlpha });

    // Cabin outline
    g.poly([
      bodyLeft + cabInset, bodyTop,
      bodyLeft + w - cabInset, bodyTop,
      bodyLeft + w - cabTopInset, cabinTop,
      bodyLeft + cabTopInset, cabinTop,
    ]);
    g.closePath();
    g.stroke({ width: 0.8 * s, color: palette.gridColor, alpha: pulseAlpha * 0.5 });
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

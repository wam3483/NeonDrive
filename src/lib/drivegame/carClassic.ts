import type { Graphics } from 'pixi.js';
import type { PaletteConfig } from '$lib/sunset';
import type { CarRenderer, CarScreenPos } from './car';
import { drawRectTaillight } from './car';

// ---------------------------------------------------------------------------
// Classic JDM sedan — boxy, tall cabin, two warm rectangular taillights
// ---------------------------------------------------------------------------
export class ClassicCarRenderer implements CarRenderer {
  render(g: Graphics, pos: CarScreenPos, animationTime: number, palette: PaletteConfig): void {
    const { x, y, scale } = pos;
    const s = scale;

    const w = 260 * s;
    const bodyH = 105 * s;
    const cabinH = 78 * s;
    const bumperH = 16 * s;

    const bodyTop  = y - bodyH;
    const bodyLeft = x - w / 2;
    const pulseAlpha = 0.3 + 0.25 * Math.sin(animationTime * 2.5);

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
    g.rect(bumperLeft + 6 * s, y - bumperH + 2 * s, bumperW - 12 * s, 2.5 * s);
    g.fill({ color: 0x888899, alpha: 0.35 });
    g.moveTo(bumperLeft + 2 * s, y - 1 * s);
    g.lineTo(bumperLeft + bumperW - 2 * s, y - 1 * s);
    g.stroke({ width: 1 * s, color: 0x333355, alpha: 0.5 });
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

    // Vertical panel lines
    const panelLineInset = 22 * s;
    g.moveTo(bodyLeft + panelLineInset, bodyTop + 4 * s);
    g.lineTo(bodyLeft + panelLineInset, bodyTop + panelH - 2 * s);
    g.stroke({ width: 0.5 * s, color: 0x1a1a38, alpha: 0.5 });
    g.moveTo(bodyLeft + w - panelLineInset, bodyTop + 4 * s);
    g.lineTo(bodyLeft + w - panelLineInset, bodyTop + panelH - 2 * s);
    g.stroke({ width: 0.5 * s, color: 0x1a1a38, alpha: 0.5 });

    // --- Wheel arches ---
    const archR = 18 * s;
    const archY = y - bumperH;
    g.arc(bodyLeft + 8 * s, archY, archR, -Math.PI, 0);
    g.fill(0x060612);
    g.arc(bodyLeft + w - 8 * s, archY, archR, -Math.PI, 0);
    g.fill(0x060612);

    // --- Cabin ---
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

    // C-pillars
    const pillarW = 6 * s;
    g.poly([
      bodyLeft + cabInset, bodyTop,
      bodyLeft + cabInset + pillarW, bodyTop,
      bodyLeft + cabTopInset + pillarW * 0.8, cabinTop,
      bodyLeft + cabTopInset, cabinTop,
    ]);
    g.fill(0x0a0a1c);
    g.poly([
      bodyLeft + w - cabInset - pillarW, bodyTop,
      bodyLeft + w - cabInset, bodyTop,
      bodyLeft + w - cabTopInset, cabinTop,
      bodyLeft + w - cabTopInset - pillarW * 0.8, cabinTop,
    ]);
    g.fill(0x0a0a1c);

    // Roof edge
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

    // Defroster lines
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

    // --- Taillights ---
    const tailW = 24 * s;
    const tailH = 28 * s;
    const tailY = bodyTop + 10 * s;
    const tailInset = 8 * s;

    drawRectTaillight(g, bodyLeft + tailInset, tailY, tailW, tailH, s, 0xff8020, palette);
    drawRectTaillight(g, bodyLeft + w - tailInset - tailW, tailY, tailW, tailH, s, 0xff8020, palette);

    // --- Trunk badge ---
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
    g.moveTo(plateX + 6 * s, plateY + plateH * 0.55);
    g.lineTo(plateX + plateW - 6 * s, plateY + plateH * 0.55);
    g.stroke({ width: 1.5 * s, color: 0x333333, alpha: 0.5 });
    g.rect(plateX, plateY, plateW, plateH);
    g.stroke({ width: 0.8 * s, color: 0x555555, alpha: 0.8 });
    g.rect(plateX + plateW * 0.3, plateY - 2 * s, plateW * 0.4, 2 * s);
    g.fill({ color: 0xffffee, alpha: 0.25 });

    // --- Neon outlines (pulsing) ---
    g.rect(bodyLeft, bodyTop, w, panelH);
    g.stroke({ width: 1.2 * s, color: palette.gridColor, alpha: pulseAlpha });

    g.poly([
      bodyLeft + cabInset, bodyTop,
      bodyLeft + w - cabInset, bodyTop,
      bodyLeft + w - cabTopInset, cabinTop,
      bodyLeft + cabTopInset, cabinTop,
    ]);
    g.closePath();
    g.stroke({ width: 1 * s, color: palette.gridColor, alpha: pulseAlpha * 0.6 });
  }
}

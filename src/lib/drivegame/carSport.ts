import type { Graphics } from 'pixi.js';
import type { PaletteConfig } from '$lib/sunset';
import type { CarRenderer, CarScreenPos } from './car';
import { drawCircleTaillight } from './car';

// ---------------------------------------------------------------------------
// Sport car — Countach-style wide-body exotic, navy/steel blue
// ---------------------------------------------------------------------------
export class SportCarRenderer implements CarRenderer {
  render(g: Graphics, pos: CarScreenPos, animationTime: number, palette: PaletteConfig): void {
    const { x, y, scale } = pos;
    const s = scale;
    const pulseAlpha = 0.3 + 0.25 * Math.sin(animationTime * 2.5);

    const w          = 310 * s;
    const bodyH      = 76 * s;
    const cabinH     = 36 * s;
    const diffuserH  = 30 * s;
    const haunch     = 18 * s;

    const carBottom = y - 20 * s;
    const bodyTop   = carBottom - bodyH;
    const bodyLeft  = x - w / 2;

    // Road reflection
    for (let i = 6; i >= 0; i--) {
      const sp = (i + 1) * 7 * s;
      g.rect(bodyLeft - haunch - sp * 0.4, y, w + haunch * 2 + sp * 0.8, sp + 2 * s);
      g.fill({ color: 0xff4020, alpha: 0.04 * (1 - i / 6) });
    }

    // Wheels
    const tireW  = 46 * s;
    const tireH  = 22 * s;
    const tireTop = y - tireH;
    const tLX = bodyLeft - tireW * 0.3;
    const tRX = bodyLeft + w - tireW * 0.7;

    for (const tx of [tLX, tRX]) {
      g.rect(tx, tireTop, tireW, tireH);
      g.fill(0x0b0b14);
      const numBars  = 7;
      const barW     = tireW / (numBars * 2);
      const scroll   = (animationTime * 2.5) % (tireW / numBars);
      for (let i = 0; i < numBars + 1; i++) {
        const bx = tx + (i * tireW / numBars) + scroll;
        if (bx < tx || bx + barW > tx + tireW) continue;
        g.rect(bx, tireTop + 1 * s, barW, tireH - 2 * s);
        g.fill({ color: 0x1a1a28, alpha: 0.7 });
      }
      g.moveTo(tx + 2 * s, tireTop + 1.5 * s);
      g.lineTo(tx + tireW - 2 * s, tireTop + 1.5 * s);
      g.stroke({ width: 1 * s, color: 0x1c1c28, alpha: 0.8 });
      g.rect(tx, tireTop, tireW, tireH);
      g.stroke({ width: 1 * s, color: 0x181820, alpha: 0.6 });
    }

    // Diffuser / lower bumper
    const diffLeft = bodyLeft - haunch;
    const diffW    = w + haunch * 2;
    const diffTop  = carBottom - diffuserH;

    g.rect(diffLeft, diffTop, diffW, diffuserH);
    g.fill(0x07070e);

    const exhW = 30 * s;
    const exhH = diffuserH * 0.52;
    const exhY = diffTop + diffuserH * 0.24;
    const exhGap = 5 * s;
    g.rect(diffLeft + 10 * s, exhY, exhW, exhH);
    g.fill(0x0c0c1e);
    g.rect(diffLeft + 10 * s + exhW + exhGap, exhY, exhW, exhH);
    g.fill(0x0c0c1e);
    g.rect(diffLeft + diffW - 10 * s - exhW, exhY, exhW, exhH);
    g.fill(0x0c0c1e);
    g.rect(diffLeft + diffW - 10 * s - exhW * 2 - exhGap, exhY, exhW, exhH);
    g.fill(0x0c0c1e);

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

    // Rear fender haunches
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

    // Main body panel
    const cr = 16 * s;
    g.moveTo(bodyLeft, diffTop);
    g.lineTo(bodyLeft, bodyTop + cr);
    g.arcTo(bodyLeft, bodyTop, bodyLeft + cr, bodyTop, cr);
    g.lineTo(bodyLeft + w - cr, bodyTop);
    g.arcTo(bodyLeft + w, bodyTop, bodyLeft + w, bodyTop + cr, cr);
    g.lineTo(bodyLeft + w, diffTop);
    g.closePath();
    g.fill(0x0d1228);

    g.moveTo(bodyLeft + cr + 2 * s, bodyTop + 1.5 * s);
    g.lineTo(bodyLeft + w - cr - 2 * s, bodyTop + 1.5 * s);
    g.stroke({ width: 1.2 * s, color: 0x2a3c60, alpha: 0.55 });

    // Rear grille/vent panel
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

    // Circular taillights
    const tailY = bodyTop + 20 * s;
    const tL1 = bodyLeft + tailInset + tailR;
    const tL2 = tL1 + tailR + tailGap + tailR;
    const tR1 = bodyLeft + w - tailInset - tailR;
    const tR2 = tR1 - (tailR + tailGap + tailR);

    drawCircleTaillight(g, tL1, tailY, tailR, s, palette);
    drawCircleTaillight(g, tL2, tailY, tailR, s, palette);
    drawCircleTaillight(g, tR2, tailY, tailR, s, palette);
    drawCircleTaillight(g, tR1, tailY, tailR, s, palette);

    // Lower bumper strip
    const stripTop = bodyTop + bodyH * 0.72;
    const stripH   = diffTop - stripTop;
    if (stripH > 0) {
      g.rect(bodyLeft, stripTop, w, stripH);
      g.fill(0x090b18);
      g.rect(bodyLeft + 6 * s, stripTop + 3 * s, w - 12 * s, stripH * 0.55);
      g.fill(0x060810);
    }

    // Cabin
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

    g.moveTo(bodyLeft + cabTopInset, cabinTop);
    g.lineTo(bodyLeft + w - cabTopInset, cabinTop);
    g.stroke({ width: 1.5 * s, color: 0x253060, alpha: 0.65 });

    // Side mirrors
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

    // Rear engine cover / louvered slats
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

    // License plate
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

    // Neon outlines (pulsing)
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
}

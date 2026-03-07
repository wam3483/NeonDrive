import type { Graphics } from 'pixi.js';
import type { PaletteConfig } from '$lib/sunset';

export type CarStyle = 'classic' | 'sport';

export interface CarScreenPos {
  x: number;
  y: number;
  scale: number;
}

export interface CarRenderer {
  render(g: Graphics, pos: CarScreenPos, animationTime: number, palette: PaletteConfig): void;
}

import { ClassicCarRenderer } from './carClassic';
import { SportCarRenderer } from './carSport';

export function createCarRenderer(style: CarStyle): CarRenderer {
  return style === 'sport' ? new SportCarRenderer() : new ClassicCarRenderer();
}

// ---------------------------------------------------------------------------
// Taillight helpers (shared by both car renderers)
// ---------------------------------------------------------------------------
export function drawRectTaillight(
  g: Graphics, lx: number, ly: number, tw: number, th: number,
  s: number, color: number, _palette: PaletteConfig,
): void {
  for (let i = 5; i >= 1; i--) {
    const pad = i * 4 * s;
    g.rect(lx - pad, ly - pad, tw + pad * 2, th + pad * 2);
    g.fill({ color, alpha: 0.04 });
  }
  g.rect(lx, ly, tw, th);
  g.fill(color);
  const segs = 3;
  for (let i = 1; i < segs; i++) {
    const sy = ly + (i / segs) * th;
    g.moveTo(lx + 1 * s, sy);
    g.lineTo(lx + tw - 1 * s, sy);
    g.stroke({ width: 0.8 * s, color: 0x661010, alpha: 0.5 });
  }
  g.rect(lx + 2 * s, ly + 2 * s, tw - 4 * s, th - 4 * s);
  g.fill({ color: 0xffffff, alpha: 0.25 });
  g.rect(lx, ly, tw, th);
  g.stroke({ width: 0.8 * s, color: 0xffaa44, alpha: 0.6 });
}

export function drawCircleTaillight(
  g: Graphics, cx: number, cy: number, r: number, s: number,
  _palette: PaletteConfig,
): void {
  const color = 0xff2040;
  for (let i = 5; i >= 1; i--) {
    g.circle(cx, cy, r + i * 4 * s);
    g.fill({ color, alpha: 0.03 });
  }
  g.circle(cx, cy, r + 2 * s);
  g.fill(0x0a0a1c);
  g.circle(cx, cy, r);
  g.fill(color);
  g.circle(cx, cy, r * 0.7);
  g.stroke({ width: 0.8 * s, color: 0xcc1030, alpha: 0.5 });
  g.circle(cx, cy, r * 0.4);
  g.fill({ color: 0xffffff, alpha: 0.35 });
  g.circle(cx, cy, r + 2 * s);
  g.stroke({ width: 0.8 * s, color: 0x666688, alpha: 0.4 });
  g.circle(cx, cy, r);
  g.stroke({ width: 1 * s, color: 0xff6070, alpha: 0.5 });
}

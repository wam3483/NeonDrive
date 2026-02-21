// Road renderer interface and implementations for the NeonDrive sunset scene.
import { Graphics } from 'pixi.js';
import type { PaletteConfig } from './renderer';

// -----------------------------------------------------------------------
// Shared interface
// -----------------------------------------------------------------------

export interface RoadRenderContext {
  horizonY: number;
  width: number;
  height: number;
  palette: PaletteConfig;
  animationTime: number;
  speed: number;
}

/**
 * Stateless road renderer. Implementations render the ground-plane
 * surface (including any scrolling animation) into a pre-cleared Graphics
 * object every frame.
 */
export interface RoadRenderer {
  readonly label: string;
  render(g: Graphics, ctx: RoadRenderContext): void;
}

// -----------------------------------------------------------------------
// Grid road — classic synthwave neon lattice
// -----------------------------------------------------------------------

export class GridRoadRenderer implements RoadRenderer {
  readonly label = 'road';

  render(g: Graphics, { horizonY, width, height, palette, animationTime, speed }: RoadRenderContext): void {
    const groundH   = height - horizonY;
    const cx        = width / 2;
    const spread    = width * 1.5;
    const numVLines = 30;

    for (let i = -numVLines / 2; i <= numVLines / 2; i++) {
      const bottomX = cx + (i / (numVLines / 2)) * (spread / 2);
      g.moveTo(cx, horizonY);
      g.lineTo(bottomX, height);
      g.stroke({ width: 1, color: palette.gridColor, alpha: 0.6 });
    }

    const numHLines   = 20;
    const scrollOffset = (animationTime * speed * 0.3) % 1.0;

    for (let i = 0; i < numHLines; i++) {
      const rawT = (i + scrollOffset) / numHLines;
      const t    = rawT * rawT;
      const y    = horizonY + t * groundH;
      if (y <= horizonY || y >= height) continue;

      const perspT    = (y - horizonY) / groundH;
      const halfWidth = perspT * (spread / 2);
      g.moveTo(cx - halfWidth, y);
      g.lineTo(cx + halfWidth, y);
      g.stroke({ width: 0.5 + t * 1.5, color: palette.gridColor, alpha: 0.3 + t * 0.4 });
    }
  }
}

// -----------------------------------------------------------------------
// Realistic road — asphalt with guard rails and lane markings
// -----------------------------------------------------------------------

// Colours independent of palette (physical road fixtures)
const ASPHALT   = 0x181620;   // dark cool-purple asphalt
const SHOULDER  = 0x1e1c2a;   // slightly lighter shoulder strip
const WHITE     = 0xffffff;
const YELLOW    = 0xffd040;
const RAIL      = 0x8090a2;   // guard rail W-beam colour
const RAIL_HI   = 0xb8ccd8;   // specular highlight on beam

export class RealisticRoadRenderer implements RoadRenderer {
  readonly label = 'road';

  render(g: Graphics, { horizonY, width, height, animationTime, speed }: RoadRenderContext): void {
    const groundH    = height - horizonY;
    const cx         = width / 2;

    // Match the grid road's perspective spread exactly.
    const halfTop    = 5;
    const halfBottom = width * 0.75;  // same as GridRoadRenderer spread / 2

    // Fraction [0..1] from horizon → bottom for a given y
    const perspT  = (y: number) => Math.max(0, Math.min(1, (y - horizonY) / groundH));
    // Half-road-width at an arbitrary y
    const halfAtY = (y: number) => halfTop + perspT(y) * (halfBottom - halfTop);

    // Markings are expressed as fractions of halfBottom so they land at
    // predictable screen positions (canvas half = width/2 = halfBottom*2/3
    // for a 800px canvas with halfBottom=600px).
    //   edge line  → cx ± width*0.34  (e.g. x=128 / x=672 on 800px canvas)
    //   guard rail → cx ± width*0.40  (e.g. x=80  / x=720)
    const edgeFrac = (width * .75) / halfBottom;
    const railFrac = (width * .85) / halfBottom;

    // -----------------------------------------------------------------
    // 1. Asphalt surface fill (extends off-screen on both sides, same as grid)
    // -----------------------------------------------------------------
    g.moveTo(cx - halfTop, horizonY);
    g.lineTo(cx + halfTop, horizonY);
    g.lineTo(cx + halfBottom, height);
    g.lineTo(cx - halfBottom, height);
    g.closePath();
    g.fill(ASPHALT);

    // -----------------------------------------------------------------
    // 2. Subtle scrolling surface bands — sense of forward motion
    // -----------------------------------------------------------------
    const numBands   = 20;
    const bandScroll = (animationTime * speed * 0.3) % 1.0;
    for (let i = 0; i < numBands; i++) {
      const rawT = (i + bandScroll) / numBands;
      const t    = rawT * rawT;
      const y    = horizonY + t * groundH;
      if (y <= horizonY || y >= height) continue;
      const hw = halfAtY(y);
      g.moveTo(cx - hw, y);
      g.lineTo(cx + hw, y);
      g.stroke({ width: 0.4 + t * 1.2, color: 0x2e2840, alpha: 0.14 + t * 0.07 });
    }

    // -----------------------------------------------------------------
    // 3. Shoulder strips — between white edge line and guard rail
    // -----------------------------------------------------------------
    for (const side of [-1, 1]) {
      g.moveTo(cx + side * halfTop    * edgeFrac, horizonY);
      g.lineTo(cx + side * halfTop    * railFrac, horizonY);
      g.lineTo(cx + side * halfBottom * railFrac, height);
      g.lineTo(cx + side * halfBottom * edgeFrac, height);
      g.closePath();
      g.fill({ color: SHOULDER, alpha: 0.9 });
    }

    // -----------------------------------------------------------------
    // 4. Guard rail beam — at railFrac, visible on canvas
    // -----------------------------------------------------------------
    for (const side of [-1, 1]) {
      g.moveTo(cx + side * halfTop    * railFrac,          horizonY);
      g.lineTo(cx + side * halfBottom * railFrac,          height);
      g.stroke({ width: 2.5, color: RAIL, alpha: 0.70 });

      g.moveTo(cx + side * halfTop    * (railFrac + 0.004), horizonY);
      g.lineTo(cx + side * halfBottom * (railFrac + 0.004), height);
      g.stroke({ width: 0.8, color: RAIL_HI, alpha: 0.35 });
    }

    // -----------------------------------------------------------------
    // 5. Guard rail posts — scrolling, positioned at railFrac
    // -----------------------------------------------------------------
    const numPosts   = 16;
    const postScroll = (animationTime * speed * 0.3) % 1.0;
    for (let i = 0; i < numPosts; i++) {
      const rawT = (i + postScroll) / numPosts;
      const t    = rawT * rawT;
      const y    = horizonY + t * groundH;
      if (y <= horizonY || y >= height) continue;
      const hw = halfAtY(y) * railFrac;
      const pw = Math.max(0.5, t * 2.5);
      const ph = Math.max(1,   t * 16);
      for (const side of [-1, 1]) {
        g.rect(cx + side * hw - pw / 2, y - ph, pw, ph);
        g.fill({ color: RAIL, alpha: 0.72 });
      }
    }

    // -----------------------------------------------------------------
    // 6. White edge lines
    // -----------------------------------------------------------------
    for (const side of [-1, 1]) {
      g.moveTo(cx + side * halfTop    * edgeFrac, horizonY);
      g.lineTo(cx + side * halfBottom * edgeFrac, height);
      g.stroke({ width: 2, color: WHITE, alpha: 0.90 });
    }

    // -----------------------------------------------------------------
    // 7. Double yellow centre lines — gap preserves perspective
    // -----------------------------------------------------------------
    const cgBottom = 4;
    const cgTop    = cgBottom * (halfTop / halfBottom);
    for (const side of [-1, 1]) {
      g.moveTo(cx + side * cgTop,    horizonY);
      g.lineTo(cx + side * cgBottom, height);
      g.stroke({ width: 2, color: YELLOW, alpha: 0.95 });
    }
  }
}

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
  /**
   * Signed curve strength (arbitrary units, ±280 range from DriveGameRenderer).
   * Positive = upcoming right-hand bend, negative = left-hand bend.
   * Converted to screen pixels inside each renderer via `curvePower = curveOffset / 12`.
   */
  curveOffset?: number;
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
// Shared Out Run curve helper
// -----------------------------------------------------------------------

/**
 * Road-centre screen X at normalised perspective depth `perspT`
 * (1 = near camera / bottom of screen, 0 = horizon).
 *
 * Uses the hyperbolic formula  cx + k * (1/perspT − 1)  which:
 *   • is zero at perspT = 1  (road centred right at the camera — straight ahead)
 *   • grows dramatically toward the horizon
 *   • gives the authentic Out Run visual where the near portion looks straight
 *     and the curve appears to sweep the road away in the far distance.
 *
 * MIN_PERSP_T prevents the singularity at perspT = 0; lines simply stop a few
 * pixels above the horizon line.
 */
const MIN_PERSP_T = 0.04;

function makeRoadCx(cx: number, curveOffset: number) {
  // Scale curveOffset (VP-shift units, ±280) down to a per-horizon-pixel value.
  // At perspT = 0.5 (mid-screen): offset = curvePower * 1 ≈ 20 px for a smooth oval.
  // At perspT = MIN_PERSP_T (near horizon): offset ≈ curvePower * 24 ≈ 480 px,
  // which naturally sweeps the road off-screen on a sharp bend (authentic Out Run).
  const curvePower = curveOffset / 12;
  return (perspT: number): number => {
    const t = Math.max(MIN_PERSP_T, perspT);
    return cx + curvePower * (1 / t - 1);
  };
}

// -----------------------------------------------------------------------
// Grid road — classic synthwave neon lattice
// -----------------------------------------------------------------------

export class GridRoadRenderer implements RoadRenderer {
  readonly label = 'road';

  render(g: Graphics, { horizonY, width, height, palette, animationTime, speed, curveOffset = 0 }: RoadRenderContext): void {
    const groundH   = height - horizonY;
    const cx        = width / 2;
    const halfBot   = width * 0.75;   // half-road-width at near edge
    const numVLines = 30;
    const rcx       = makeRoadCx(cx, curveOffset);

    // -----------------------------------------------------------------
    // Convergence lines — drawn as polylines so they follow the curve.
    // Each polyline goes from near (perspT = 1) to just above the horizon
    // (perspT = MIN_PERSP_T).  With no curve they look identical to the
    // old straight lines; with a curve they genuinely bend in screen space.
    // -----------------------------------------------------------------
    const POLY_STEPS = 18;
    for (let i = -numVLines / 2; i <= numVLines / 2; i++) {
      const frac = i / (numVLines / 2);  // −1 … +1, lane fraction

      // Near point (bottom of screen)
      g.moveTo(rcx(1.0) + frac * halfBot, height);

      for (let j = 1; j <= POLY_STEPS; j++) {
        const pt = 1 - (j / POLY_STEPS) * (1 - MIN_PERSP_T);
        const y  = horizonY + pt * groundH;
        const x  = rcx(pt) + frac * pt * halfBot;
        g.lineTo(x, y);
      }
      g.stroke({ width: 1, color: palette.gridColor, alpha: 0.6 });
    }

    // -----------------------------------------------------------------
    // Horizontal grid lines — each centred on the road curve at its depth
    // -----------------------------------------------------------------
    const numHLines    = 20;
    const scrollOffset = (animationTime * speed * 0.3) % 1.0;

    for (let i = 0; i < numHLines; i++) {
      const rawT = (i + scrollOffset) / numHLines;
      const t    = rawT * rawT;
      const y    = horizonY + t * groundH;
      if (y <= horizonY || y >= height) continue;

      const perspT    = (y - horizonY) / groundH;
      const center    = rcx(perspT);
      const halfWidth = perspT * halfBot;
      g.moveTo(center - halfWidth, y);
      g.lineTo(center + halfWidth, y);
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

  render(g: Graphics, { horizonY, width, height, animationTime, speed, curveOffset = 0 }: RoadRenderContext): void {
    const groundH    = height - horizonY;
    const cx         = width / 2;
    const halfBottom = width * 0.75;
    const rcx        = makeRoadCx(cx, curveOffset);

    const edgeFrac = (width * 0.75) / halfBottom;   // = 1.0
    const railFrac = (width * 0.85) / halfBottom;   // slightly wider

    // Number of depth samples used to build curved polygons / polylines.
    // More = smoother on tight bends.
    const STEPS = 40;

    // Returns arrays of [x, y] pairs for a curved line at a given road fraction.
    // j=0 is near (perspT=1), j=STEPS is the horizon cutoff (perspT=MIN_PERSP_T).
    const curveLine = (sideFrac: number): Array<[number, number]> => {
      const pts: Array<[number, number]> = [];
      for (let j = 0; j <= STEPS; j++) {
        const pt = 1 - (j / STEPS) * (1 - MIN_PERSP_T);
        const y  = horizonY + pt * groundH;
        const x  = rcx(pt) + sideFrac * pt * halfBottom;
        pts.push([x, y]);
      }
      return pts;
    };

    // Draws a polyline from a pre-computed curve-line array.
    const strokeLine = (pts: Array<[number, number]>, lineWidth: number, color: number, alpha: number) => {
      g.moveTo(pts[0][0], pts[0][1]);
      for (let j = 1; j < pts.length; j++) g.lineTo(pts[j][0], pts[j][1]);
      g.stroke({ width: lineWidth, color, alpha });
    };

    // Draws a filled polygon bounded by two curve-line arrays (first inner, then outer reversed).
    const fillBand = (inner: Array<[number, number]>, outer: Array<[number, number]>, color: number | { color: number; alpha: number }) => {
      const pts: number[] = [];
      for (const [x, y] of inner) pts.push(x, y);
      for (let j = outer.length - 1; j >= 0; j--) pts.push(outer[j][0], outer[j][1]);
      g.poly(pts);
      if (typeof color === 'number') g.fill(color);
      else g.fill(color);
    };

    // Pre-compute key lines
    const rightEdge = curveLine( edgeFrac);
    const leftEdge  = curveLine(-edgeFrac);
    const rightRail = curveLine( railFrac);
    const leftRail  = curveLine(-railFrac);
    // Full road boundary (left and right outer edges)
    const rightFull = curveLine( 1.0);
    const leftFull  = curveLine(-1.0);

    // -----------------------------------------------------------------
    // 1. Asphalt surface fill — single curved polygon
    // -----------------------------------------------------------------
    fillBand(rightFull, leftFull, ASPHALT);

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
      const perspT = (y - horizonY) / groundH;
      const rc     = rcx(perspT);
      const hw     = perspT * halfBottom;
      g.moveTo(rc - hw, y);
      g.lineTo(rc + hw, y);
      g.stroke({ width: 0.4 + t * 1.2, color: 0x2e2840, alpha: 0.14 + t * 0.07 });
    }

    // -----------------------------------------------------------------
    // 3. Shoulder strips — filled band between edge and rail lines
    // -----------------------------------------------------------------
    fillBand(rightEdge, rightRail, { color: SHOULDER, alpha: 0.9 });
    fillBand(leftRail,  leftEdge,  { color: SHOULDER, alpha: 0.9 });

    // -----------------------------------------------------------------
    // 4. Guard rail beams — polylines
    // -----------------------------------------------------------------
    strokeLine(rightRail, 2.5, RAIL,    0.70);
    strokeLine(leftRail,  2.5, RAIL,    0.70);
    strokeLine(curveLine( railFrac + 0.004), 0.8, RAIL_HI, 0.35);
    strokeLine(curveLine(-railFrac - 0.004), 0.8, RAIL_HI, 0.35);

    // -----------------------------------------------------------------
    // 5. Guard rail posts — scrolling rects placed on the curved rail line
    // -----------------------------------------------------------------
    const numPosts   = 16;
    const postScroll = (animationTime * speed * 0.3) % 1.0;
    for (let i = 0; i < numPosts; i++) {
      const rawT = (i + postScroll) / numPosts;
      const t    = rawT * rawT;
      const y    = horizonY + t * groundH;
      if (y <= horizonY || y >= height) continue;
      const perspT = (y - horizonY) / groundH;
      const rc     = rcx(perspT);
      const hw     = perspT * halfBottom * railFrac;
      const pw     = Math.max(0.5, t * 2.5);
      const ph     = Math.max(1,   t * 16);
      for (const side of [-1, 1]) {
        g.rect(rc + side * hw - pw / 2, y - ph, pw, ph);
        g.fill({ color: RAIL, alpha: 0.72 });
      }
    }

    // -----------------------------------------------------------------
    // 6. White edge lines — polylines
    // -----------------------------------------------------------------
    strokeLine(rightEdge, 2, WHITE,  0.90);
    strokeLine(leftEdge,  2, WHITE,  0.90);

    // -----------------------------------------------------------------
    // 7. Double yellow centre lines — polylines
    // -----------------------------------------------------------------
    // Centre gap is a tiny fraction; we compute two lines at ±cgFrac
    const cgFrac = 4 / halfBottom;   // 4 px gap at near edge
    strokeLine(curveLine( cgFrac), 2, YELLOW, 0.95);
    strokeLine(curveLine(-cgFrac), 2, YELLOW, 0.95);
  }
}

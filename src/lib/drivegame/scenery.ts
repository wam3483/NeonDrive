import { Graphics, RenderTexture, Sprite, Container } from 'pixi.js';
import type { Renderer as PixiRenderer } from 'pixi.js';
import type { PaletteConfig } from '$lib/sunset';
import { Random } from '$lib/map/random';
import type { TrackPt } from './track';

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------
interface RoadsideSprite {
  type: 'palm' | 'rock';
  side: -1 | 1;
  z: number;
  extraFrac: number;
  scaleVar: number;
  seed: number;
  variant: number;
}

interface TrackObstacle {
  type: 'fallenPalm';
  trackIndex: number;
  lateralOffset: number;
  variant: number;
}

interface TrackBillboard {
  trackIndex: number;
  side: -1 | 1;
  extraFrac: number;
  scaleVar: number;
  seed: number;
  variant: number;
}

// ---------------------------------------------------------------------------
// Context passed from the renderer each frame
// ---------------------------------------------------------------------------
export interface SceneryUpdateCtx {
  width: number;
  height: number;
  animationTime: number;
  curveOffset: number;
  trackPoints: TrackPt[];
  trackT: number;
}

// ---------------------------------------------------------------------------
// Variant counts
// ---------------------------------------------------------------------------
const PALM_VARIANTS = 8;
const ROCK_VARIANTS = 6;
const BILLBOARD_VARIANTS = 4;
const FALLEN_PALM_VARIANTS = 4;

// ---------------------------------------------------------------------------
// SceneryManager — owns all roadside state, textures, and sprite pool
// ---------------------------------------------------------------------------
export class SceneryManager {
  readonly container = new Container();

  private roadsideSprites: RoadsideSprite[] = [];
  private trackBillboards: TrackBillboard[] = [];
  private trackObstacles: TrackObstacle[] = [];

  private bakedPalms: RenderTexture[] = [];
  private bakedRocks: RenderTexture[] = [];
  private bakedBillboards: RenderTexture[] = [];
  private bakedFallenPalms: RenderTexture[] = [];
  private spritePool: Sprite[] = [];

  constructor() {
    this.container.label = 'roadside';
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────
  generate(trackPoints: TrackPt[]): void {
    const rng = new Random(9876);
    const N   = 52;
    const typePool: Array<RoadsideSprite['type']> = [
      'palm', 'palm', 'palm', 'palm', 'palm', 'palm',
      'rock', 'rock', 'rock', 'rock', 'rock',
    ];

    this.roadsideSprites = [];
    for (let i = 0; i < N; i++) {
      const side = rng.float(0, 1) < 0.5 ? -1 : 1;
      const type = typePool[rng.int(0, typePool.length - 1)];
      const maxVar = type === 'palm' ? PALM_VARIANTS : ROCK_VARIANTS;
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

    const trackN      = trackPoints.length;
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
        variant:    bbRng.int(0, BILLBOARD_VARIANTS - 1),
      });
    }

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
        variant:       obsRng.int(0, FALLEN_PALM_VARIANTS - 1),
      });
    }
  }

  bakeTextures(renderer: PixiRenderer, palette: PaletteConfig): void {
    const bake = (
      w: number, h: number,
      drawFn: (g: Graphics, cx: number, baseY: number) => void,
    ): RenderTexture => {
      const g = new Graphics();
      drawFn(g, w / 2, h);
      const rt = RenderTexture.create({ width: w, height: h });
      renderer.render({ container: g, target: rt });
      g.destroy();
      return rt;
    };

    this.bakedPalms = [];
    for (let i = 0; i < PALM_VARIANTS; i++) {
      const seed = 7000 + i * 137;
      this.bakedPalms.push(bake(500, 1000, (g, cx, baseY) => {
        drawRoadsidePalm(g, cx, baseY, 1, seed);
      }));
    }

    this.bakedRocks = [];
    for (let i = 0; i < ROCK_VARIANTS; i++) {
      const seed = 3000 + i * 211;
      this.bakedRocks.push(bake(120, 80, (g, cx, baseY) => {
        drawRoadsideRock(g, cx, baseY, 1, seed, palette);
      }));
    }

    this.bakedBillboards = [];
    for (let i = 0; i < BILLBOARD_VARIANTS; i++) {
      const seed = 5000 + i * 173;
      this.bakedBillboards.push(bake(900, 1200, (g, cx, baseY) => {
        drawRoadsideBillboard(g, cx, baseY, 1, seed, palette);
      }));
    }

    this.bakedFallenPalms = [];
    for (let i = 0; i < FALLEN_PALM_VARIANTS; i++) {
      const seed = 8000 + i * 191;
      this.bakedFallenPalms.push(bake(800, 400, (g, cx) => {
        drawFallenPalm(g, cx, 250, 1, seed, palette);
      }));
    }
  }

  destroy(): void {
    for (const t of [...this.bakedPalms, ...this.bakedRocks, ...this.bakedBillboards, ...this.bakedFallenPalms]) t.destroy(true);
    this.bakedPalms = [];
    this.bakedRocks = [];
    this.bakedBillboards = [];
    this.bakedFallenPalms = [];
    this.spritePool = [];
  }

  // ── per-frame ─────────────────────────────────────────────────────────────
  update(ctx: SceneryUpdateCtx): void {
    for (const s of this.spritePool) s.visible = false;
    let poolIdx = 0;

    const horizonY   = ctx.height * 0.55;
    const groundH    = ctx.height - horizonY;
    const halfBot    = ctx.width * 0.75;
    const railFrac   = 0.85 / 0.75;
    const MIN_T      = 0.04;
    const scroll     = (ctx.animationTime * 0.3) % 1.0;

    const roadCenterX = (perspT: number): number => {
      const cx         = ctx.width / 2;
      const curvePower = ctx.curveOffset / 12;
      const t          = Math.max(0.04, perspT);
      return cx + curvePower * (1 / t - 1);
    };

    type Placed = { texture: RenderTexture; perspT: number; x: number; y: number; scaleVar: number; anchorY?: number };
    const visible: Placed[] = [];

    // Scroll-loop scenery
    for (const sprite of this.roadsideSprites) {
      const rawT  = ((sprite.z + scroll) % 1.0);
      const t     = rawT * rawT;
      if (t < MIN_T || t > 0.96) continue;

      const perspT = t;
      const y      = horizonY + perspT * groundH;
      const cx     = roadCenterX(perspT);
      const x      = cx + sprite.side * (railFrac + sprite.extraFrac) * perspT * halfBot;

      if (x < -120 || x > ctx.width + 120) continue;

      const texture = sprite.type === 'palm'
        ? this.bakedPalms[sprite.variant]
        : this.bakedRocks[sprite.variant];

      visible.push({ texture, perspT, x, y, scaleVar: sprite.scaleVar });
    }

    // Track-anchored objects (billboards + obstacles)
    const trackN    = ctx.trackPoints.length;
    const viewRange = 60;

    for (const bb of this.trackBillboards) {
      let dist = bb.trackIndex - ctx.trackT;
      if (dist < -trackN / 2) dist += trackN;
      if (dist >  trackN / 2) dist -= trackN;
      if (dist < 1 || dist > viewRange) continue;

      const perspT  = Math.max(MIN_T, 1 - (dist / viewRange));
      const perspT2 = perspT * perspT;
      const bbY     = horizonY + perspT2 * groundH;
      const bbCx    = roadCenterX(perspT2);
      const bbX     = bbCx + bb.side * (railFrac + bb.extraFrac) * perspT2 * halfBot;

      if (bbX < -200 || bbX > ctx.width + 200) continue;

      visible.push({
        texture: this.bakedBillboards[bb.variant],
        perspT: perspT2,
        x: bbX,
        y: bbY,
        scaleVar: bb.scaleVar,
      });
    }

    for (const obs of this.trackObstacles) {
      let dist = obs.trackIndex - ctx.trackT;
      if (dist < -trackN / 2) dist += trackN;
      if (dist >  trackN / 2) dist -= trackN;
      if (dist < 1 || dist > viewRange) continue;

      const perspT  = Math.max(MIN_T, 1 - (dist / viewRange));
      const perspT2 = perspT * perspT;
      const obsY    = horizonY + perspT2 * groundH;
      const obsCx   = roadCenterX(perspT2);
      const roadHalfW = perspT2 * halfBot;
      const obsX    = obsCx + obs.lateralOffset * roadHalfW * 0.6;

      visible.push({
        texture: this.bakedFallenPalms[obs.variant],
        perspT: perspT2,
        x: obsX,
        y: obsY,
        scaleVar: 1.0,
        anchorY: 250 / 400,
      });
    }

    // Painter's order: far first
    visible.sort((a, b) => a.perspT - b.perspT);

    for (const item of visible) {
      const scale = item.perspT * item.scaleVar;

      let spr: Sprite;
      if (poolIdx < this.spritePool.length) {
        spr = this.spritePool[poolIdx];
      } else {
        spr = new Sprite();
        spr.anchor.set(0.5, 1.0);
        this.container.addChild(spr);
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
}

// ---------------------------------------------------------------------------
// Drawing functions (pure — used only during texture baking)
// ---------------------------------------------------------------------------

function drawRoadsidePalm(
  g: Graphics, x: number, baseY: number, scale: number, seed: number,
): void {
  const rng    = new Random(seed);
  const trunkH = 700 * scale;
  const col    = 0x0a0816;

  const lean    = rng.float(-0.6, 0.6) * 80 * scale;
  const midBow  = rng.float(-0.4, 0.4) * 40 * scale;

  const bx0 = x;
  const by0 = baseY;
  const bx1 = x + midBow;
  const by1 = baseY - trunkH * 0.35;
  const bx2 = x + lean * 0.7 + midBow * 0.3;
  const by2 = baseY - trunkH * 0.7;
  const bx3 = x + lean;
  const by3 = baseY - trunkH;

  const trunkSteps = 16;
  const baseW = Math.max(2, 22 * scale);
  const topW  = Math.max(1, 6 * scale);
  const leftPts: number[] = [];
  const rightPts: number[] = [];

  for (let i = 0; i <= trunkSteps; i++) {
    const t  = i / trunkSteps;
    const mt = 1 - t;
    const cx = mt*mt*mt*bx0 + 3*mt*mt*t*bx1 + 3*mt*t*t*bx2 + t*t*t*bx3;
    const cy = mt*mt*mt*by0 + 3*mt*mt*t*by1 + 3*mt*t*t*by2 + t*t*t*by3;
    const tx = -3*mt*mt*bx0 + 3*(mt*mt - 2*mt*t)*bx1 + 3*(2*mt*t - t*t)*bx2 + 3*t*t*bx3;
    const ty = -3*mt*mt*by0 + 3*(mt*mt - 2*mt*t)*by1 + 3*(2*mt*t - t*t)*by2 + 3*t*t*by3;
    const tLen = Math.sqrt(tx*tx + ty*ty) || 1;
    const nx = -ty / tLen;
    const ny =  tx / tLen;
    const halfW = baseW + (topW - baseW) * t;
    leftPts.push(cx + nx * halfW, cy + ny * halfW);
    rightPts.push(cx - nx * halfW, cy - ny * halfW);
  }

  const rightReversed: number[] = [];
  for (let i = rightPts.length - 2; i >= 0; i -= 2) {
    rightReversed.push(rightPts[i], rightPts[i + 1]);
  }

  const pts: number[] = [...leftPts, ...rightReversed];
  g.poly(pts);
  g.fill(col);

  const crownX = bx3;
  const crownY = by3;

  const frondCount = 7 + rng.int(0, 3);

  for (let i = 0; i < frondCount; i++) {
    const baseAngle = -Math.PI * 0.92 + (i / (frondCount - 1)) * Math.PI * 1.84;
    const angle = baseAngle + rng.float(-0.15, 0.15);
    const frondLen = (200 + rng.float(-40, 60)) * scale;
    const droopAmount = (0.55 + rng.float(0, 0.25)) * frondLen;

    const spCpX = crownX + Math.cos(angle) * frondLen * 0.45;
    const spCpY = crownY + Math.sin(angle) * frondLen * 0.45 + droopAmount * 0.3;
    const spTipX = crownX + Math.cos(angle) * frondLen * 0.85;
    const spTipY = crownY + Math.sin(angle) * frondLen * 0.35 + droopAmount;

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

    const numLeaflets = 12 + rng.int(0, 4);
    for (let j = 1; j <= numLeaflets; j++) {
      const t = j / (numLeaflets + 1);
      const mt = 1 - t;
      const sx = mt*mt*crownX + 2*mt*t*spCpX + t*t*spTipX;
      const sy = mt*mt*crownY + 2*mt*t*spCpY + t*t*spTipY;
      const stx = 2*mt*(spCpX - crownX) + 2*t*(spTipX - spCpX);
      const sty = 2*mt*(spCpY - crownY) + 2*t*(spTipY - spCpY);
      const stLen = Math.sqrt(stx*stx + sty*sty) || 1;
      const pnx = -sty / stLen;
      const pny =  stx / stLen;
      const taper = Math.max(0.15, 1 - t * 0.85);
      const leafLen = (65 + rng.float(-10, 10)) * scale * taper;
      const halfBase = Math.max(0.8, (9 + rng.float(-1, 1)) * scale * taper);
      const leafDroopY = leafLen * 0.3;

      for (const side of [-1, 1]) {
        const leafTipX = sx + pnx * side * leafLen;
        const leafTipY = sy + pny * side * leafLen + leafDroopY;
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

function drawRoadsideBillboard(
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

  // Post
  g.rect(x - postW / 2, signBotY, postW, postH);
  g.fill(0x22203a);

  // Sign backing
  g.rect(signL, signTopY, signW, signH);
  g.fill(0x0d0e1e);

  // Neon border — outer glow passes
  for (let i = 3; i >= 1; i--) {
    const pad = i * 2 * scale;
    g.rect(signL - pad, signTopY - pad, signW + pad * 2, signH + pad * 2);
    g.stroke({ width: Math.max(0.5, 1.5 * scale), color: neonCol, alpha: 0.10 * (4 - i) });
  }

  // Bright neon border
  g.rect(signL, signTopY, signW, signH);
  g.stroke({ width: Math.max(0.8, 1.5 * scale), color: neonCol, alpha: 0.95 });

  // Inner horizontal stripes
  const stripeH = signH * 0.18;
  for (let s = 0; s < 3; s++) {
    const sy = signTopY + 4 * scale + s * (signH - 8 * scale) / 3;
    g.rect(signL + 4 * scale, sy, signW - 8 * scale, stripeH);
    g.fill({ color: neonCol, alpha: 0.10 + s * 0.06 });
  }

  // Bold divider line through middle
  const midY = signTopY + signH * 0.5;
  g.moveTo(signL + 4 * scale, midY);
  g.lineTo(signL + signW - 4 * scale, midY);
  g.stroke({ width: Math.max(0.5, 0.8 * scale), color: neonCol, alpha: 0.55 });

  // "Text" blocks — two rows of short rectangles
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

function drawFallenPalm(
  g: Graphics, cx: number, baseY: number, scale: number, seed: number,
  palette: PaletteConfig,
): void {
  const rng      = new Random(seed);
  const trunkLen = 380 * scale;
  const trunkCol = 0x2a2440;
  const neonCol  = palette.gridColor;
  const frondCol = 0x1e2a1e;

  const rootX  = cx - trunkLen * 0.5;
  const rootY  = baseY;
  const tipX   = cx + trunkLen * 0.5;
  const bow    = rng.float(-0.15, 0.15) * trunkLen;
  const tipY   = baseY + bow;
  const midX   = (rootX + tipX) * 0.5 + rng.float(-0.1, 0.1) * trunkLen;
  const midY   = Math.min(rootY, tipY) - rng.float(8, 18) * scale;

  const baseW = Math.max(2, 16 * scale);
  const topW  = Math.max(1, 5 * scale);
  const steps = 12;
  const leftPts: number[] = [];
  const rightPts: number[] = [];

  for (let i = 0; i <= steps; i++) {
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
    leftPts.push(px + nx * halfW, py + ny * halfW);
    rightPts.push(px - nx * halfW, py - ny * halfW);
  }

  const rightReversed: number[] = [];
  for (let i = rightPts.length - 2; i >= 0; i -= 2) {
    rightReversed.push(rightPts[i], rightPts[i + 1]);
  }

  const pts = [...leftPts, ...rightReversed];
  g.poly(pts);
  g.fill(trunkCol);

  g.poly(pts);
  g.stroke({ width: Math.max(0.5, 1.5 * scale), color: neonCol, alpha: 0.5 });

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

  const crownX = tipX;
  const crownY = tipY;

  const frondCount = 6 + rng.int(0, 2);
  for (let i = 0; i < frondCount; i++) {
    const baseAngle = -1.0 + (i / (frondCount - 1)) * 2.0 + rng.float(-0.15, 0.15);
    const frondLen  = (100 + rng.float(-10, 20)) * scale;
    const droopAmt  = (0.3 + rng.float(0, 0.3)) * frondLen;

    const spCpX  = crownX + Math.cos(baseAngle) * frondLen * 0.45;
    const spCpY  = crownY + Math.sin(baseAngle) * frondLen * 0.45 + droopAmt * 0.3;
    const spTipX = crownX + Math.cos(baseAngle) * frondLen * 0.85;
    const spTipY = crownY + Math.sin(baseAngle) * frondLen * 0.35 + droopAmt;

    g.moveTo(crownX, crownY);
    g.quadraticCurveTo(spCpX, spCpY, spTipX, spTipY);
    g.stroke({ width: Math.max(0.5, 2 * scale), color: frondCol, alpha: 0.9 });

    g.moveTo(crownX, crownY);
    g.quadraticCurveTo(spCpX, spCpY, spTipX, spTipY);
    g.stroke({ width: Math.max(0.3, 0.8 * scale), color: neonCol, alpha: 0.25 });

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

  const rootR = 14 * scale;
  g.circle(rootX, rootY, rootR);
  g.fill(0x1a1828);
  g.circle(rootX, rootY, rootR);
  g.stroke({ width: Math.max(0.5, 1 * scale), color: neonCol, alpha: 0.3 });
}

function drawRoadsideRock(
  g: Graphics, x: number, baseY: number, scale: number, seed: number,
  palette: PaletteConfig,
): void {
  const rng         = new Random(seed);
  const numBoulders = rng.int(2, 4);
  const rockCol     = 0x1c1a2c;

  for (let b = 0; b < numBoulders; b++) {
    const bx  = x + rng.float(-1, 1) * 20 * scale;
    const bw  = (24 + rng.float(0, 22)) * scale;
    const bh  = (14 + rng.float(0, 14)) * scale;

    const peakOff = rng.float(-0.2, 0.2) * bw;
    const pts = [
      bx - bw * 0.50, baseY,
      bx - bw * 0.45, baseY - bh * rng.float(0.5, 0.75),
      bx + peakOff,   baseY - bh,
      bx + bw * 0.45, baseY - bh * rng.float(0.45, 0.70),
      bx + bw * 0.50, baseY,
    ];

    g.poly(pts);
    g.fill(rockCol);

    g.poly([
      pts[0], pts[1],
      pts[8], pts[9],
      bx + bw * 0.45, baseY - bh * 0.4,
      bx - bw * 0.45, baseY - bh * 0.35,
    ]);
    g.fill({ color: 0x0e0c1a, alpha: 0.55 });

    g.moveTo(pts[0], pts[1]);
    g.lineTo(pts[2], pts[3]);
    g.lineTo(pts[4], pts[5]);
    g.lineTo(pts[6], pts[7]);
    g.lineTo(pts[8], pts[9]);
    g.stroke({ width: Math.max(0.5, 1.1 * scale), color: palette.gridColor, alpha: 0.45 });
  }
}

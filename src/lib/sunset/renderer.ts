// PixiJS renderer for the synthwave sunset scene
import { Application, Graphics, Container } from 'pixi.js';
import { Random } from '$lib/map/random';

export interface SunsetConfig {
  seed: number;
  sunY: number;           // 0 = horizon, 1 = high
  sunSize: number;        // radius in px
  sunStripes: boolean;    // classic synthwave horizontal lines in lower half
  gridSpeed: number;
  starDensity: number;
  mountainHeight: number;
  mountainLayers: number; // 1–3
  cloudDensity: number;   // 0–1
  showGrid: boolean;
  showStars: boolean;
  showMountains: boolean;
  showClouds: boolean;
  showTrees: boolean;
  palette: 'auto' | 'ember' | 'dusk' | 'amber' | 'neon';
}

// -----------------------------------------------------------------------
// Palettes — derived from the 4 reference images
// -----------------------------------------------------------------------
interface PaletteConfig {
  skyBands: Array<{ stop: number; color: [number, number, number] }>;
  cloudShadow: number;
  cloudMid: number;
  cloudHighlight: number;
  gridColor: number;
  horizonGlow: number;
  horizonCore: number;
}

const PALETTES: Record<string, PaletteConfig> = {
  // img1 — deep indigo fading through magenta to bright gold
  ember: {
    skyBands: [
      { stop: 0.00, color: [8,   4,  38] },
      { stop: 0.20, color: [30,  8,  75] },
      { stop: 0.45, color: [110, 18, 120] },
      { stop: 0.70, color: [210, 70,  55] },
      { stop: 1.00, color: [255, 170, 18] },
    ],
    cloudShadow:    0x451030,
    cloudMid:       0x9f3070,
    cloudHighlight: 0xf09050,
    gridColor:      0xff20a0,
    horizonGlow:    0xff6020,
    horizonCore:    0xff9050,
  },
  // img2 — blue-purple cresting into vivid coral-pink
  dusk: {
    skyBands: [
      { stop: 0.00, color: [14,  8,  52] },
      { stop: 0.25, color: [50,  20, 105] },
      { stop: 0.50, color: [155, 42, 138] },
      { stop: 0.75, color: [228, 85, 125] },
      { stop: 1.00, color: [255, 140, 140] },
    ],
    cloudShadow:    0x4a1560,
    cloudMid:       0xa03590,
    cloudHighlight: 0xf590b0,
    gridColor:      0xff30b0,
    horizonGlow:    0xff6090,
    horizonCore:    0xff90b0,
  },
  // img3 — warmest; deep navy through orange to amber
  amber: {
    skyBands: [
      { stop: 0.00, color: [10,  8,  50] },
      { stop: 0.25, color: [22,  16, 72] },
      { stop: 0.50, color: [65,  28, 85] },
      { stop: 0.75, color: [188, 70, 38] },
      { stop: 1.00, color: [255, 148, 28] },
    ],
    cloudShadow:    0x3a1535,
    cloudMid:       0x803060,
    cloudHighlight: 0xe08040,
    gridColor:      0xff3060,
    horizonGlow:    0xff7020,
    horizonCore:    0xff9040,
  },
  // img4 — coolest; indigo through purple to hot neon-pink
  neon: {
    skyBands: [
      { stop: 0.00, color: [8,   4,  44] },
      { stop: 0.25, color: [32,  10, 82] },
      { stop: 0.50, color: [105, 18, 132] },
      { stop: 0.75, color: [205, 35, 115] },
      { stop: 1.00, color: [255, 78, 148] },
    ],
    cloudShadow:    0x380a60,
    cloudMid:       0x8010a0,
    cloudHighlight: 0xe050c0,
    gridColor:      0xff10c0,
    horizonGlow:    0xff20a0,
    horizonCore:    0xff60c0,
  },
};

const PALETTE_NAMES = ['ember', 'dusk', 'amber', 'neon'] as const;

// -----------------------------------------------------------------------
// Procedural data types
// -----------------------------------------------------------------------
interface Star {
  x: number; y: number;
  size: number; phase: number; speed: number;
}

interface CloudPuff {
  x: number; y: number; r: number;
}

interface Cloud {
  puffs: CloudPuff[];
  speed: number;
}

interface MountainLayer {
  profile: number[]; // y-values per x pixel
  color: number;
  alpha: number;
}

interface Tree {
  x: number;
  y: number;      // base (feet)
  height: number;
  width: number;
  type: 'pine' | 'round';
}

// -----------------------------------------------------------------------
// Defaults
// -----------------------------------------------------------------------
const DEFAULT_CONFIG: SunsetConfig = {
  seed:          42,
  sunY:          0.35,
  sunSize:       80,
  sunStripes:    true,
  gridSpeed:     1,
  starDensity:   150,
  mountainHeight: 0.25,
  mountainLayers: 3,
  cloudDensity:  0.6,
  showGrid:      true,
  showStars:     true,
  showMountains: true,
  showClouds:    true,
  showTrees:     true,
  palette:       'auto',
};

// -----------------------------------------------------------------------
// Renderer
// -----------------------------------------------------------------------
export class SunsetRenderer {
  private app: Application;
  private container: Container;
  private config: SunsetConfig;
  private initialized = false;
  private width = 0;
  private height = 0;

  // Procedural data
  private stars: Star[] = [];
  private mountainLayers: MountainLayer[] = [];
  private clouds: Cloud[] = [];
  private trees: Tree[] = [];

  private animationTime = 0;

  constructor() {
    this.app = new Application();
    this.container = new Container();
    this.config = { ...DEFAULT_CONFIG };
  }

  async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
    this.width  = width;
    this.height = height;

    await this.app.init({
      canvas,
      width, height,
      backgroundColor: 0x080412,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    this.app.stage.addChild(this.container);
    this.initialized = true;

    this.generate();
    this.render();
    this.app.ticker.add(this.animate.bind(this));
  }

  setConfig(partial: Partial<SunsetConfig>): void {
    const prev = this.config;
    this.config = { ...this.config, ...partial };

    const needsRegen =
      prev.seed          !== this.config.seed          ||
      prev.starDensity   !== this.config.starDensity   ||
      prev.mountainHeight !== this.config.mountainHeight ||
      prev.mountainLayers !== this.config.mountainLayers ||
      prev.cloudDensity  !== this.config.cloudDensity;

    if (needsRegen) this.generate();
    this.render();
  }

  destroy(): void {
    if (this.initialized) {
      this.app.ticker.stop();
      this.app.destroy(true);
      this.initialized = false;
    }
  }

  // -----------------------------------------------------------------------
  // Palette helpers
  // -----------------------------------------------------------------------
  private getActivePalette(): PaletteConfig {
    if (this.config.palette !== 'auto') return PALETTES[this.config.palette];
    const idx = new Random(this.config.seed + 7777).int(0, PALETTE_NAMES.length - 1);
    return PALETTES[PALETTE_NAMES[idx]];
  }

  private getSkyColorAtY(t: number, palette: PaletteConfig): [number, number, number] {
    t = Math.max(0, Math.min(1, t));
    const hueShift = new Random(this.config.seed + 999).float(-1, 1) * 12;
    const bands = palette.skyBands;

    for (let i = 0; i < bands.length - 1; i++) {
      const a = bands[i], b = bands[i + 1];
      if (t >= a.stop && t <= b.stop) {
        const lt = (t - a.stop) / (b.stop - a.stop);
        return [
          Math.max(0, Math.min(255, a.color[0] + (b.color[0] - a.color[0]) * lt + hueShift)),
          Math.max(0, Math.min(255, a.color[1] + (b.color[1] - a.color[1]) * lt)),
          Math.max(0, Math.min(255, a.color[2] + (b.color[2] - a.color[2]) * lt + hueShift * 0.3)),
        ];
      }
    }
    const last = bands[bands.length - 1].color;
    return [last[0], last[1], last[2]];
  }

  private rgbToHex(r: number, g: number, b: number): number {
    return ((Math.round(r) & 0xff) << 16) | ((Math.round(g) & 0xff) << 8) | (Math.round(b) & 0xff);
  }

  // -----------------------------------------------------------------------
  // Procedural generation
  // -----------------------------------------------------------------------
  private generate(): void {
    const rng = new Random(this.config.seed);
    this.generateStars(rng);
    this.generateMountainLayers(rng);
    this.generateClouds(rng);
    this.generateTrees(rng);
  }

  private generateStars(rng: Random): void {
    this.stars = [];
    const horizonY = this.height * 0.55;
    for (let i = 0; i < this.config.starDensity; i++) {
      this.stars.push({
        x:     rng.float(0, this.width),
        y:     rng.float(0, horizonY * 0.85),
        size:  rng.float(0.5, 2),
        phase: rng.float(0, Math.PI * 2),
        speed: rng.float(0.5, 2.5),
      });
    }
  }

  private generateMountainProfile(
    rng: Random, horizonY: number, maxHeight: number, roughness: number
  ): number[] {
    const pts = this.width + 1;
    const p   = new Array<number>(pts);
    p[0]       = horizonY - rng.float(0.2, 0.5) * maxHeight;
    p[pts - 1] = horizonY - rng.float(0.2, 0.5) * maxHeight;
    this.mpDisplace(p, 0, pts - 1, maxHeight * 0.8, roughness, rng);
    for (let i = 0; i < pts; i++) p[i] = Math.min(p[i], horizonY);
    return p;
  }

  private mpDisplace(
    p: number[], left: number, right: number,
    disp: number, rough: number, rng: Random
  ): void {
    if (right - left <= 1) return;
    const mid = Math.floor((left + right) / 2);
    p[mid] = (p[left] + p[right]) / 2 + rng.float(-1, 1) * disp;
    this.mpDisplace(p, left,  mid,   disp * rough, rough, rng);
    this.mpDisplace(p, mid,   right, disp * rough, rough, rng);
  }

  private generateMountainLayers(rng: Random): void {
    this.mountainLayers = [];
    const horizonY = this.height * 0.55;
    const n        = Math.max(1, Math.min(3, this.config.mountainLayers));

    // Three layer templates; we take the last `n` (nearest-camera layers always included)
    const defs = [
      { hScale: 0.45, color: 0x4a5580, alpha: 0.85, rough: 0.65 }, // far — lighter blue
      { hScale: 0.72, color: 0x1c2040, alpha: 1.00, rough: 0.58 }, // mid
      { hScale: 1.00, color: 0x090715, alpha: 1.00, rough: 0.52 }, // near — darkest
    ];

    const start = 3 - n;
    for (let i = start; i < 3; i++) {
      const d    = defs[i];
      const maxH = this.height * 0.55 * this.config.mountainHeight * d.hScale;
      this.mountainLayers.push({
        profile: this.generateMountainProfile(rng, horizonY, maxH, d.rough),
        color:   d.color,
        alpha:   d.alpha,
      });
    }
  }

  private generateClouds(rng: Random): void {
    this.clouds = [];
    if (this.config.cloudDensity <= 0) return;

    const count    = Math.round(3 + this.config.cloudDensity * 10);
    const horizonY = this.height * 0.55;

    for (let c = 0; c < count; c++) {
      // Prefer the left/right thirds — clouds frame the sun as in the references
      let baseX: number;
      const roll = rng.float(0, 1);
      if (roll < 0.38)      baseX = rng.float(0, this.width * 0.38);
      else if (roll < 0.76) baseX = rng.float(this.width * 0.62, this.width);
      else                   baseX = rng.float(this.width * 0.15, this.width * 0.85);

      const baseY      = rng.float(horizonY * 0.05, horizonY * 0.65);
      const cloudWidth = rng.float(70, 220);
      const numPuffs   = rng.int(4, 9);
      const mainR      = cloudWidth * 0.22;

      const puffs: CloudPuff[] = [];

      // Primary row of puffs across the cloud width
      for (let p = 0; p < numPuffs; p++) {
        const t          = numPuffs === 1 ? 0.5 : p / (numPuffs - 1);
        const ox         = (t - 0.5) * cloudWidth;
        const edgeFactor = 1 - Math.abs(t - 0.5) * 1.6;
        const r          = mainR * Math.max(0.35, edgeFactor) * rng.float(0.88, 1.12);
        const oy         = Math.abs(t - 0.5) * mainR * 0.55;
        puffs.push({ x: baseX + ox, y: baseY + oy, r });
      }

      // A few extra bumps on top for organic variety
      const extras = rng.int(0, 3);
      for (let p = 0; p < extras; p++) {
        puffs.push({
          x: baseX + rng.float(-cloudWidth * 0.35, cloudWidth * 0.35),
          y: baseY - mainR * rng.float(0.1, 0.6),
          r: mainR * rng.float(0.35, 0.65),
        });
      }

      this.clouds.push({ puffs, speed: rng.float(0.5, 2.5) });
    }
  }

  private generateTrees(rng: Random): void {
    this.trees = [];
    const baseY = this.height * 0.55;

    const addCluster = (xMin: number, xMax: number, count: number) => {
      for (let i = 0; i < count; i++) {
        const h = rng.float(this.height * 0.12, this.height * 0.28);
        this.trees.push({
          x:      rng.float(xMin, xMax),
          y:      baseY + rng.float(-5, 18),
          height: h,
          width:  h * rng.float(0.38, 0.62),
          type:   rng.float(0, 1) < 0.65 ? 'pine' : 'round',
        });
      }
    };

    addCluster(-15, this.width * 0.28, rng.int(3, 7));  // left side
    addCluster(this.width * 0.72, this.width + 15, rng.int(3, 7)); // right side
  }

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------
  private render(): void {
    if (!this.initialized) return;
    this.container.removeChildren();

    const horizonY = this.height * 0.55;
    const palette  = this.getActivePalette();

    this.drawSky(horizonY, palette);

    if (this.config.showStars)     this.drawStars();
    this.drawSunGlow(horizonY);
    this.drawSun(horizonY, palette);
    if (this.config.showClouds)    this.drawClouds(horizonY, palette);
    if (this.config.showMountains) this.drawMountains(horizonY);
    this.drawGround(horizonY);
    this.drawHorizonGlow(horizonY, palette);
    if (this.config.showTrees)     this.drawTrees();
    if (this.config.showGrid)      this.drawGrid(horizonY, palette);
  }

  private drawSky(horizonY: number, palette: PaletteConfig): void {
    const g = new Graphics();
    const bands = 40;
    for (let i = 0; i < bands; i++) {
      const t = i / bands;
      const [r, gr, b] = this.getSkyColorAtY(t, palette);
      g.rect(0, t * horizonY, this.width, horizonY / bands + 1);
      g.fill(this.rgbToHex(r, gr, b));
    }
    this.container.addChild(g);
  }

  private drawStars(): void {
    const g = new Graphics();
    g.label = 'stars';
    for (const s of this.stars) {
      const alpha = 0.3 + 0.7 * ((Math.sin(this.animationTime * s.speed + s.phase) + 1) / 2);
      g.circle(s.x, s.y, s.size);
      g.fill({ color: 0xffffff, alpha });
    }
    this.container.addChild(g);
  }

  private drawSunGlow(horizonY: number): void {
    const g  = new Graphics();
    g.label  = 'sunGlow';
    const cx = this.width / 2;
    const cy = horizonY - this.config.sunY * horizonY * 0.8;
    const sr = this.config.sunSize;

    for (let i = 7; i >= 1; i--) {
      const breathe = 1 + 0.025 * (i / 7) * Math.sin(this.animationTime * 0.45);
      const radius = sr * (1 + i * 0.28) * breathe;
      const alpha  = (0.07 + 0.03 * ((Math.sin(this.animationTime * 0.6) + 1) / 2))
                   * (1 - i / 7);
      g.circle(cx, cy, radius);
      g.fill({ color: 0xffb040, alpha });
    }
    this.container.addChild(g);
  }

  private drawSun(horizonY: number, palette: PaletteConfig): void {
    const g        = new Graphics();
    const cx       = this.width / 2;
    const sr       = this.config.sunSize;
    const cy       = horizonY - this.config.sunY * horizonY * 0.8;
    const stripeH  = 2;
    const count    = Math.ceil(sr * 2 / stripeH);
    const gapStart = cy; // stripes only below center

    for (let i = 0; i < count; i++) {
      const localY = -sr + i * stripeH;
      const worldY = cy + localY;
      const dy     = Math.abs(localY);
      if (dy >= sr) continue;
      const hw = Math.sqrt(sr * sr - dy * dy);

      const t     = (localY + sr) / (sr * 2);
      const color = this.rgbToHex(255, 255 - t * 155, 50 - t * 50);

      if (this.config.sunStripes && worldY > gapStart) {
        const dist = worldY - gapStart;
        if ((dist % 6) < 3) {
          // fill gap with sky colour
          const [sr2, sg, sb] = this.getSkyColorAtY(Math.min(1, worldY / horizonY), palette);
          g.rect(cx - hw, worldY, hw * 2, stripeH);
          g.fill(this.rgbToHex(sr2, sg, sb));
          continue;
        }
      }

      g.rect(cx - hw, worldY, hw * 2, stripeH);
      g.fill(color);
    }
    this.container.addChild(g);
  }

  private drawClouds(_horizonY: number, palette: PaletteConfig): void {
    const g = new Graphics();
    g.label = 'clouds';
    this.renderCloudGraphics(g, palette);
    this.container.addChild(g);
  }

  private renderCloudGraphics(g: Graphics, palette: PaletteConfig): void {
    const wrapW = this.width + 600;
    for (const cloud of this.clouds) {
      const drift = (this.animationTime * cloud.speed * 8) % wrapW;

      // 1. Shadow — shifted down slightly
      for (const p of cloud.puffs) {
        let dx = p.x + drift;
        if (dx > this.width + 300) dx -= wrapW;
        g.circle(dx, p.y + p.r * 0.12, p.r);
        g.fill({ color: palette.cloudShadow, alpha: 0.72 });
      }
      // 2. Mid body
      for (const p of cloud.puffs) {
        let dx = p.x + drift;
        if (dx > this.width + 300) dx -= wrapW;
        g.circle(dx, p.y, p.r);
        g.fill({ color: palette.cloudMid, alpha: 0.80 });
      }
      // 3. Highlight — smaller circle near top edge
      for (const p of cloud.puffs) {
        let dx = p.x + drift;
        if (dx > this.width + 300) dx -= wrapW;
        g.circle(dx, p.y - p.r * 0.22, p.r * 0.60);
        g.fill({ color: palette.cloudHighlight, alpha: 0.42 });
      }
    }
  }

  private updateClouds(): void {
    if (!this.config.showClouds) return;
    const g = this.findByLabel('clouds');
    if (!g) return;
    g.clear();
    this.renderCloudGraphics(g, this.getActivePalette());
  }

  private drawMountains(horizonY: number): void {
    for (const layer of this.mountainLayers) {
      if (!layer.profile.length) continue;
      const g = new Graphics();
      g.moveTo(0, horizonY);
      for (let x = 0; x < layer.profile.length; x++) g.lineTo(x, layer.profile[x]);
      g.lineTo(this.width, horizonY);
      g.closePath();
      g.fill({ color: layer.color, alpha: layer.alpha });
      this.container.addChild(g);
    }
  }

  private drawGround(horizonY: number): void {
    const g = new Graphics();
    g.rect(0, horizonY, this.width, this.height - horizonY);
    g.fill(0x0d0518);
    this.container.addChild(g);
  }

  private drawHorizonGlow(horizonY: number, palette: PaletteConfig): void {
    const g = new Graphics();
    g.label = 'horizonGlow';

    for (let i = 8; i >= 0; i--) {
      const spread = i * 4;
      const alpha  = (0.15 + 0.05 * ((Math.sin(this.animationTime * 0.8) + 1) / 2))
                   * (1 - i / 8);
      g.rect(0, horizonY - spread / 2, this.width, spread + 2);
      g.fill({ color: palette.horizonGlow, alpha });
    }

    const coreAlpha = 0.6 + 0.2 * ((Math.sin(this.animationTime * 0.8) + 1) / 2);
    g.rect(0, horizonY - 1, this.width, 2);
    g.fill({ color: palette.horizonCore, alpha: coreAlpha });

    this.container.addChild(g);
  }

  private drawPineTree(g: Graphics, tree: Tree, color: number): void {
    const { x, y, height, width } = tree;
    const tiers = 3;
    for (let t = 0; t < tiers; t++) {
      const frac  = t / tiers;
      const tierY = y - frac * height * 0.85;
      const tierW = width * (1 - frac * 0.55);
      const tierH = (height / tiers) * 1.25;
      g.poly([x - tierW / 2, tierY, x + tierW / 2, tierY, x, tierY - tierH]);
      g.fill(color);
    }
    g.rect(x - 3, y - height * 0.06, 6, height * 0.09);
    g.fill(color);
  }

  private drawRoundTree(g: Graphics, tree: Tree, color: number): void {
    const { x, y, height, width } = tree;
    // Trunk
    const trunkTopY = y - height * 0.35;
    g.rect(x - 4, trunkTopY, 8, height * 0.38);
    g.fill(color);
    // Canopy blobs — position relative to trunk top so they always connect
    const r  = width * 0.45;
    const cy = trunkTopY - r * 0.7;
    for (const [ox, oy, scale] of [[0, 0, 1], [-0.5, 0.2, 0.75], [0.5, 0.2, 0.75], [0, -0.4, 0.7]] as [number,number,number][]) {
      g.circle(x + ox * r, cy + oy * r, r * scale);
      g.fill(color);
    }
  }

  private drawTrees(): void {
    const g     = new Graphics();
    const color = 0x080614;
    for (const tree of this.trees) {
      if (tree.type === 'pine') this.drawPineTree(g, tree, color);
      else                      this.drawRoundTree(g, tree, color);
    }
    this.container.addChild(g);
  }

  private drawGrid(horizonY: number, palette: PaletteConfig): void {
    const g          = new Graphics();
    g.label          = 'grid';
    const groundH    = this.height - horizonY;
    const cx         = this.width / 2;
    const spread     = this.width * 1.5;
    const numVLines  = 30;

    for (let i = -numVLines / 2; i <= numVLines / 2; i++) {
      const bottomX = cx + (i / (numVLines / 2)) * (spread / 2);
      g.moveTo(cx, horizonY);
      g.lineTo(bottomX, this.height);
      g.stroke({ width: 1, color: palette.gridColor, alpha: 0.6 });
    }

    const numHLines    = 20;
    const scrollOffset = (this.animationTime * this.config.gridSpeed * 0.3) % 1.0;

    for (let i = 0; i < numHLines; i++) {
      const rawT = (i + scrollOffset) / numHLines;
      const t    = rawT * rawT;
      const y    = horizonY + t * groundH;
      if (y <= horizonY || y >= this.height) continue;

      const perspT    = (y - horizonY) / groundH;
      const halfWidth = perspT * (spread / 2);
      g.moveTo(cx - halfWidth, y);
      g.lineTo(cx + halfWidth, y);
      g.stroke({ width: 0.5 + t * 1.5, color: palette.gridColor, alpha: 0.3 + t * 0.4 });
    }

    this.container.addChild(g);
  }

  // -----------------------------------------------------------------------
  // Animation
  // -----------------------------------------------------------------------
  private animate(ticker: { deltaTime: number }): void {
    if (!this.initialized) return;
    this.animationTime += ticker.deltaTime * 0.02;
    this.updateStars();
    this.updateSunGlow();
    this.updateClouds();
    this.updateHorizonGlow();
    this.updateGrid();
  }

  private updateStars(): void {
    if (!this.config.showStars) return;
    const g = this.findByLabel('stars');
    if (!g) return;
    g.clear();
    for (const s of this.stars) {
      const alpha = 0.3 + 0.7 * ((Math.sin(this.animationTime * s.speed + s.phase) + 1) / 2);
      g.circle(s.x, s.y, s.size);
      g.fill({ color: 0xffffff, alpha });
    }
  }

  private updateSunGlow(): void {
    const g = this.findByLabel('sunGlow');
    if (!g) return;
    const horizonY = this.height * 0.55;
    const cx       = this.width / 2;
    const cy       = horizonY - this.config.sunY * horizonY * 0.8;
    const sr       = this.config.sunSize;
    g.clear();
    for (let i = 7; i >= 1; i--) {
      const breathe = 1 + 0.025 * (i / 7) * Math.sin(this.animationTime * 0.45);
      const radius = sr * (1 + i * 0.28) * breathe;
      const alpha  = (0.07 + 0.03 * ((Math.sin(this.animationTime * 0.6) + 1) / 2)) * (1 - i / 7);
      g.circle(cx, cy, radius);
      g.fill({ color: 0xffb040, alpha });
    }
  }

  private updateHorizonGlow(): void {
    const g = this.findByLabel('horizonGlow');
    if (!g) return;
    const horizonY = this.height * 0.55;
    const palette  = this.getActivePalette();
    g.clear();

    for (let i = 8; i >= 0; i--) {
      const spread = i * 4;
      const alpha  = (0.15 + 0.05 * ((Math.sin(this.animationTime * 0.8) + 1) / 2)) * (1 - i / 8);
      g.rect(0, horizonY - spread / 2, this.width, spread + 2);
      g.fill({ color: palette.horizonGlow, alpha });
    }
    const coreAlpha = 0.6 + 0.2 * ((Math.sin(this.animationTime * 0.8) + 1) / 2);
    g.rect(0, horizonY - 1, this.width, 2);
    g.fill({ color: palette.horizonCore, alpha: coreAlpha });
  }

  private updateGrid(): void {
    if (!this.config.showGrid) return;
    const g = this.findByLabel('grid');
    if (!g) return;
    const horizonY = this.height * 0.55;
    const groundH  = this.height - horizonY;
    const cx       = this.width / 2;
    const spread   = this.width * 1.5;
    const palette  = this.getActivePalette();
    g.clear();

    const numVLines = 30;
    for (let i = -numVLines / 2; i <= numVLines / 2; i++) {
      const bottomX = cx + (i / (numVLines / 2)) * (spread / 2);
      g.moveTo(cx, horizonY);
      g.lineTo(bottomX, this.height);
      g.stroke({ width: 1, color: palette.gridColor, alpha: 0.6 });
    }

    const numHLines    = 20;
    const scrollOffset = (this.animationTime * this.config.gridSpeed * 0.3) % 1.0;
    for (let i = 0; i < numHLines; i++) {
      const rawT = (i + scrollOffset) / numHLines;
      const t    = rawT * rawT;
      const y    = horizonY + t * groundH;
      if (y <= horizonY || y >= this.height) continue;
      const perspT    = (y - horizonY) / groundH;
      const halfWidth = perspT * (spread / 2);
      g.moveTo(cx - halfWidth, y);
      g.lineTo(cx + halfWidth, y);
      g.stroke({ width: 0.5 + t * 1.5, color: palette.gridColor, alpha: 0.3 + t * 0.4 });
    }
  }

  private findByLabel(label: string): Graphics | null {
    for (const child of this.container.children) {
      if (child.label === label) return child as Graphics;
    }
    return null;
  }
}

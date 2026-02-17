// PixiJS renderer for the synthwave sunset scene
import { Application, Graphics, Container } from 'pixi.js';
import { Random } from '$lib/map/random';

export interface SunsetConfig {
  seed: number;
  sunY: number;           // 0 = horizon, 1 = high
  sunSize: number;        // radius in px
  gridSpeed: number;      // scroll speed multiplier
  starDensity: number;    // star count
  mountainHeight: number; // fraction of sky height
  showGrid: boolean;
  showStars: boolean;
  showMountains: boolean;
}

const DEFAULT_CONFIG: SunsetConfig = {
  seed: 42,
  sunY: 0.35,
  sunSize: 80,
  gridSpeed: 1,
  starDensity: 150,
  mountainHeight: 0.25,
  showGrid: true,
  showStars: true,
  showMountains: true,
};

// Sky palette — deep indigo top → orange at horizon
const SKY_BANDS = [
  { stop: 0.0, color: [10, 5, 40] },      // deep indigo
  { stop: 0.2, color: [30, 10, 80] },      // dark purple
  { stop: 0.4, color: [80, 15, 100] },     // magenta-purple
  { stop: 0.6, color: [160, 30, 80] },     // warm magenta
  { stop: 0.8, color: [220, 80, 30] },     // orange
  { stop: 1.0, color: [255, 160, 20] },    // bright orange-yellow
];

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;  // twinkle phase offset
  speed: number;  // twinkle speed
}

export class SunsetRenderer {
  private app: Application;
  private container: Container;
  private config: SunsetConfig;
  private initialized = false;
  private width = 0;
  private height = 0;

  // Procedural data
  private stars: Star[] = [];
  private mountainProfile: number[] = []; // y-values across width

  // Animation
  private animationTime = 0;

  constructor() {
    this.app = new Application();
    this.container = new Container();
    this.config = { ...DEFAULT_CONFIG };
  }

  async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
    this.width = width;
    this.height = height;

    await this.app.init({
      canvas,
      width,
      height,
      backgroundColor: 0x0a0528,
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

    // Regenerate procedural data if seed, density, or mountains changed
    if (
      prev.seed !== this.config.seed ||
      prev.starDensity !== this.config.starDensity ||
      prev.mountainHeight !== this.config.mountainHeight
    ) {
      this.generate();
    }

    this.render();
  }

  destroy(): void {
    if (this.initialized) {
      this.app.ticker.stop();
      this.app.destroy(true);
      this.initialized = false;
    }
  }

  // --- Procedural generation ---

  private generate(): void {
    const rng = new Random(this.config.seed);
    this.generateStars(rng);
    this.generateMountains(rng);
  }

  private generateStars(rng: Random): void {
    this.stars = [];
    const horizonY = this.height * 0.55;

    for (let i = 0; i < this.config.starDensity; i++) {
      // Stars only in the upper sky (above horizon)
      const y = rng.float(0, horizonY * 0.85);
      this.stars.push({
        x: rng.float(0, this.width),
        y,
        size: rng.float(0.5, 2),
        phase: rng.float(0, Math.PI * 2),
        speed: rng.float(0.5, 2.5),
      });
    }
  }

  private generateMountains(rng: Random): void {
    // Midpoint displacement algorithm
    const points = this.width + 1;
    this.mountainProfile = new Array(points);

    const horizonY = this.height * 0.55;
    const maxMtnHeight = this.height * 0.55 * this.config.mountainHeight;

    // Start with endpoints
    this.mountainProfile[0] = horizonY - rng.float(0.2, 0.5) * maxMtnHeight;
    this.mountainProfile[points - 1] = horizonY - rng.float(0.2, 0.5) * maxMtnHeight;

    // Midpoint displacement
    this.midpointDisplace(0, points - 1, maxMtnHeight * 0.8, 0.55, rng);

    // Ensure all values stay below horizon (mountains go upward = smaller y)
    for (let i = 0; i < points; i++) {
      this.mountainProfile[i] = Math.min(this.mountainProfile[i], horizonY);
    }
  }

  private midpointDisplace(
    left: number, right: number, displacement: number, roughness: number, rng: Random
  ): void {
    if (right - left <= 1) return;
    const mid = Math.floor((left + right) / 2);
    const avg = (this.mountainProfile[left] + this.mountainProfile[right]) / 2;
    this.mountainProfile[mid] = avg + (rng.float(-1, 1) * displacement);

    const newDisp = displacement * roughness;
    this.midpointDisplace(left, mid, newDisp, roughness, rng);
    this.midpointDisplace(mid, right, newDisp, roughness, rng);
  }

  // --- Rendering ---

  private render(): void {
    if (!this.initialized) return;

    this.container.removeChildren();

    const horizonY = this.height * 0.55;

    // Layer 1: Sky gradient
    this.drawSky(horizonY);

    // Layer 2: Stars
    if (this.config.showStars) {
      this.drawStars();
    }

    // Layer 3: Sun
    this.drawSun(horizonY);

    // Layer 4: Mountains
    if (this.config.showMountains) {
      this.drawMountains(horizonY);
    }

    // Layer 5: Ground fill
    this.drawGround(horizonY);

    // Layer 6: Horizon glow
    this.drawHorizonGlow(horizonY);

    // Layer 7: Grid
    if (this.config.showGrid) {
      this.drawGrid(horizonY);
    }
  }

  private getSkyColorAtY(normalizedY: number): [number, number, number] {
    // normalizedY: 0 = top of sky, 1 = horizon
    const t = Math.max(0, Math.min(1, normalizedY));

    // Seed shifts colors slightly
    const rng = new Random(this.config.seed + 999);
    const hueShift = (rng.float(-1, 1)) * 15;

    // Find surrounding bands
    for (let i = 0; i < SKY_BANDS.length - 1; i++) {
      const a = SKY_BANDS[i];
      const b = SKY_BANDS[i + 1];
      if (t >= a.stop && t <= b.stop) {
        const localT = (t - a.stop) / (b.stop - a.stop);
        return [
          Math.max(0, Math.min(255, a.color[0] + (b.color[0] - a.color[0]) * localT + hueShift)),
          Math.max(0, Math.min(255, a.color[1] + (b.color[1] - a.color[1]) * localT)),
          Math.max(0, Math.min(255, a.color[2] + (b.color[2] - a.color[2]) * localT + hueShift * 0.3)),
        ];
      }
    }
    const last = SKY_BANDS[SKY_BANDS.length - 1].color;
    return [last[0], last[1], last[2]];
  }

  private rgbToHex(r: number, g: number, b: number): number {
    return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
  }

  private drawSky(horizonY: number): void {
    const g = new Graphics();
    const bandCount = 40; // discrete horizontal bands

    for (let i = 0; i < bandCount; i++) {
      const t = i / bandCount;
      const y = t * horizonY;
      const bandHeight = horizonY / bandCount + 1; // +1 to avoid gaps
      const [r, gr, b] = this.getSkyColorAtY(t);
      g.rect(0, y, this.width, bandHeight);
      g.fill(this.rgbToHex(Math.round(r), Math.round(gr), Math.round(b)));
    }

    this.container.addChild(g);
  }

  private drawStars(): void {
    const g = new Graphics();
    g.label = 'stars';

    for (const star of this.stars) {
      // Initial alpha based on twinkle
      const alpha = 0.3 + 0.7 * ((Math.sin(this.animationTime * star.speed + star.phase) + 1) / 2);
      g.circle(star.x, star.y, star.size);
      g.fill({ color: 0xffffff, alpha });
    }

    this.container.addChild(g);
  }

  private drawSun(horizonY: number): void {
    const g = new Graphics();
    const cx = this.width / 2;
    const sunRadius = this.config.sunSize;
    // sunY: 0 = at horizon, 1 = high in sky
    const cy = horizonY - this.config.sunY * horizonY * 0.8;

    // Draw sun disk from top to bottom in horizontal stripes for gradient effect
    const stripeHeight = 2;
    const stripeCount = Math.ceil(sunRadius * 2 / stripeHeight);
    const gapStartY = cy; // gaps only in bottom half

    for (let i = 0; i < stripeCount; i++) {
      const localY = -sunRadius + i * stripeHeight;
      const worldY = cy + localY;

      // Calculate horizontal extent at this y (circle equation)
      const dy = Math.abs(localY);
      if (dy >= sunRadius) continue;
      const halfWidth = Math.sqrt(sunRadius * sunRadius - dy * dy);

      // Sun color: top = yellow, bottom = red-orange
      const t = (localY + sunRadius) / (sunRadius * 2); // 0 at top, 1 at bottom
      const r = 255;
      const green = Math.round(255 - t * 155); // 255 → 100
      const b = Math.round(50 - t * 50);       // 50 → 0
      const color = this.rgbToHex(r, green, b);

      // Check if this stripe is a gap (classic synthwave sun lines in bottom half)
      if (worldY > gapStartY) {
        const distBelow = worldY - gapStartY;
        const gapSpacing = 6;  // pixels between gap starts
        const gapWidth = 3;    // pixels of gap
        const inGap = (distBelow % gapSpacing) < gapWidth;

        if (inGap) {
          // Draw gap stripe using sky color at this y position
          const skyT = worldY / horizonY;
          const [sr, sg, sb] = this.getSkyColorAtY(Math.min(1, skyT));
          g.rect(cx - halfWidth, worldY, halfWidth * 2, stripeHeight);
          g.fill(this.rgbToHex(Math.round(sr), Math.round(sg), Math.round(sb)));
          continue;
        }
      }

      g.rect(cx - halfWidth, worldY, halfWidth * 2, stripeHeight);
      g.fill(color);
    }

    this.container.addChild(g);
  }

  private drawMountains(horizonY: number): void {
    if (this.mountainProfile.length === 0) return;

    const g = new Graphics();
    g.moveTo(0, horizonY);

    for (let x = 0; x < this.mountainProfile.length; x++) {
      g.lineTo(x, this.mountainProfile[x]);
    }

    g.lineTo(this.width, horizonY);
    g.closePath();
    g.fill(0x0a0510); // Very dark purple-black silhouette

    this.container.addChild(g);
  }

  private drawGround(horizonY: number): void {
    const g = new Graphics();
    g.rect(0, horizonY, this.width, this.height - horizonY);
    g.fill(0x0d0518); // dark purple-black
    this.container.addChild(g);
  }

  private drawHorizonGlow(horizonY: number): void {
    const g = new Graphics();
    g.label = 'horizonGlow';

    // Bright horizontal glow line at horizon
    const glowLayers = 8;
    for (let i = glowLayers; i >= 0; i--) {
      const spread = i * 4;
      const alpha = (0.15 + 0.05 * ((Math.sin(this.animationTime * 0.8) + 1) / 2)) * (1 - i / glowLayers);
      g.rect(0, horizonY - spread / 2, this.width, spread + 2);
      g.fill({ color: 0xff6030, alpha });
    }

    // Bright core line
    const coreAlpha = 0.6 + 0.2 * ((Math.sin(this.animationTime * 0.8) + 1) / 2);
    g.rect(0, horizonY - 1, this.width, 2);
    g.fill({ color: 0xff9060, alpha: coreAlpha });

    this.container.addChild(g);
  }

  private drawGrid(horizonY: number): void {
    const g = new Graphics();
    g.label = 'grid';

    const groundHeight = this.height - horizonY;
    const cx = this.width / 2;
    const vanishY = horizonY;

    // --- Vertical lines (converge to center) ---
    const numVLines = 30;
    const spread = this.width * 1.5;

    for (let i = -numVLines / 2; i <= numVLines / 2; i++) {
      const bottomX = cx + (i / (numVLines / 2)) * (spread / 2);
      // Draw from vanishing point to bottom
      g.moveTo(cx, vanishY);
      g.lineTo(bottomX, this.height);
      g.stroke({ width: 1, color: 0xff20a0, alpha: 0.6 });
    }

    // --- Horizontal lines (bunch near horizon, spread at bottom) ---
    const numHLines = 20;
    const scrollOffset = (this.animationTime * this.config.gridSpeed * 0.3) % 1.0;

    for (let i = 0; i < numHLines; i++) {
      // Exponential distribution — lines bunch near horizon
      const rawT = (i + scrollOffset) / numHLines;
      const t = rawT * rawT; // quadratic bunching near horizon
      const y = vanishY + t * groundHeight;

      if (y <= vanishY || y >= this.height) continue;

      // Line width increases with distance from horizon
      const lineWidth = 0.5 + t * 1.5;
      const alpha = 0.3 + t * 0.4;

      // Calculate horizontal extent at this y (perspective)
      const perspT = (y - vanishY) / groundHeight;
      const halfWidth = perspT * (spread / 2);

      g.moveTo(cx - halfWidth, y);
      g.lineTo(cx + halfWidth, y);
      g.stroke({ width: lineWidth, color: 0xff20a0, alpha });
    }

    this.container.addChild(g);
  }

  // --- Animation loop ---

  private animate(ticker: { deltaTime: number }): void {
    if (!this.initialized) return;

    this.animationTime += ticker.deltaTime * 0.02;

    // Update animated layers by finding them by label and redrawing
    this.updateStars();
    this.updateHorizonGlow();
    this.updateGrid();
  }

  private updateStars(): void {
    if (!this.config.showStars) return;
    const g = this.findByLabel('stars');
    if (!g) return;

    g.clear();
    for (const star of this.stars) {
      const alpha = 0.3 + 0.7 * ((Math.sin(this.animationTime * star.speed + star.phase) + 1) / 2);
      g.circle(star.x, star.y, star.size);
      g.fill({ color: 0xffffff, alpha });
    }
  }

  private updateHorizonGlow(): void {
    const g = this.findByLabel('horizonGlow');
    if (!g) return;

    const horizonY = this.height * 0.55;
    g.clear();

    const glowLayers = 8;
    for (let i = glowLayers; i >= 0; i--) {
      const spread = i * 4;
      const alpha = (0.15 + 0.05 * ((Math.sin(this.animationTime * 0.8) + 1) / 2)) * (1 - i / glowLayers);
      g.rect(0, horizonY - spread / 2, this.width, spread + 2);
      g.fill({ color: 0xff6030, alpha });
    }

    const coreAlpha = 0.6 + 0.2 * ((Math.sin(this.animationTime * 0.8) + 1) / 2);
    g.rect(0, horizonY - 1, this.width, 2);
    g.fill({ color: 0xff9060, alpha: coreAlpha });
  }

  private updateGrid(): void {
    if (!this.config.showGrid) return;
    const g = this.findByLabel('grid');
    if (!g) return;

    const horizonY = this.height * 0.55;
    const groundHeight = this.height - horizonY;
    const cx = this.width / 2;
    const vanishY = horizonY;
    const spread = this.width * 1.5;

    g.clear();

    // Vertical lines
    const numVLines = 30;
    for (let i = -numVLines / 2; i <= numVLines / 2; i++) {
      const bottomX = cx + (i / (numVLines / 2)) * (spread / 2);
      g.moveTo(cx, vanishY);
      g.lineTo(bottomX, this.height);
      g.stroke({ width: 1, color: 0xff20a0, alpha: 0.6 });
    }

    // Horizontal lines with scroll
    const numHLines = 20;
    const scrollOffset = (this.animationTime * this.config.gridSpeed * 0.3) % 1.0;

    for (let i = 0; i < numHLines; i++) {
      const rawT = (i + scrollOffset) / numHLines;
      const t = rawT * rawT;
      const y = vanishY + t * groundHeight;

      if (y <= vanishY || y >= this.height) continue;

      const lineWidth = 0.5 + t * 1.5;
      const alpha = 0.3 + t * 0.4;
      const perspT = (y - vanishY) / groundHeight;
      const halfWidth = perspT * (spread / 2);

      g.moveTo(cx - halfWidth, y);
      g.lineTo(cx + halfWidth, y);
      g.stroke({ width: lineWidth, color: 0xff20a0, alpha });
    }
  }

  private findByLabel(label: string): Graphics | null {
    for (const child of this.container.children) {
      if (child.label === label) return child as Graphics;
    }
    return null;
  }
}

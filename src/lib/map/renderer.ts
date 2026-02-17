// PixiJS renderer for the map
import { Application, Graphics, Container, Text, TextStyle } from 'pixi.js';
import type { MapData, Center, Edge } from './generator';
import type { Town } from './towns';
import type { Road } from './roads';
import { BIOME_COLORS } from './types';

// Text styles for town names
const TOWN_TEXT_SMALL = new TextStyle({
  fontFamily: 'Arial, sans-serif',
  fontSize: 8,
  fontWeight: 'normal',
  fill: 0xffffff,
  stroke: { color: 0x000000, width: 2 },
});

const TOWN_TEXT_LARGE = new TextStyle({
  fontFamily: 'Arial, sans-serif',
  fontSize: 14,
  fontWeight: 'bold',
  fill: 0xffffff,
  stroke: { color: 0x000000, width: 3 },
  dropShadow: {
    color: 0x000000,
    blur: 4,
    distance: 2,
  },
});

export interface RenderOptions {
  showPolygons: boolean;
  showEdges: boolean;
  showRivers: boolean;
  showRoads: boolean;
  showElevation: boolean;
  showMoisture: boolean;
  showTowns: boolean;
}

const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  showPolygons: true,
  showEdges: false,
  showRivers: true,
  showRoads: true,
  showElevation: false,
  showMoisture: false,
  showTowns: true,
};

// Town marker colors by type
const TOWN_COLORS = {
  shoreline: { fill: 0xf5d742, stroke: 0x8b6914 },    // Gold - port towns
  river: { fill: 0x42adf5, stroke: 0x1a5a8c },       // Blue - river towns
  elevation: { fill: 0xd9d9d9, stroke: 0x666666 },   // Silver - mountain towns
  inland: { fill: 0x8b5a2b, stroke: 0x4a2f17 },      // Brown - inland towns
};

// Retro SMB3-style ocean color palette
const OCEAN_COLORS = {
  dark: 0x1a3a5c,      // Deep water
  mid: 0x2858a0,       // Medium water
  light: 0x4080c0,     // Light wave
  highlight: 0x60a0d8, // Wave crest
  foam: 0xffffff,      // White cap
  foamLight: 0xe8f4ff, // Lighter foam
};

const LAKE_COLORS = {
  dark: 0x205080,
  mid: 0x3068a0,
  light: 0x4888c0,
  highlight: 0x58a0d0,
  foam: 0xffffff,
  foamLight: 0xe0f0ff,
};

// Shore foam colors
const SHORE_COLORS = {
  foam: 0xffffff,
  foamMid: 0xe0f0ff,
  foamLight: 0xc8e4ff,
};

// Cloud colors (Asian art style - soft, muted)
const CLOUD_COLORS = {
  main: 0xffffff,
  shadow: 0xe8f0f8,
  highlight: 0xffffff,
  outline: 0xd0e0f0,
};

// Cloud configuration
interface Cloud {
  x: number;
  y: number;
  scale: number;
  layers: number;
  seed: number;
  speed: number;
}

export class MapRenderer {
  private app: Application;
  private mapContainer: Container;
  private mapData: MapData | null = null;
  private options: RenderOptions;
  private initialized: boolean = false;
  private canvas: HTMLCanvasElement | null = null;
  private width: number = 0;
  private height: number = 0;

  // Zoom and pan state
  private zoom: number = 1;
  private minZoom: number = 0.5;
  private maxZoom: number = 4;
  private panX: number = 0;
  private panY: number = 0;
  private isPanning: boolean = false;
  private lastPanX: number = 0;
  private lastPanY: number = 0;

  // Animation state
  private oceanGraphics: Graphics | null = null;
  private lakeGraphics: Graphics | null = null;
  private foamGraphics: Graphics | null = null;
  private shoreGraphics: Graphics | null = null;
  private landGraphics: Graphics | null = null;
  private townGraphics: Graphics | null = null;
  private roadGraphics: Graphics | null = null;
  private cloudGraphics: Graphics | null = null;
  private oceanCenters: Center[] = [];  // True ocean only
  private lakeCenters: Center[] = [];   // Inland water (lakes, marshes)
  private coastlineEdges: Edge[] = [];
  private towns: Town[] = [];
  private roads: Road[] = [];
  private clouds: Cloud[] = [];
  private animationTime: number = 0;
  private animationFrame: number = 0;

  // Bound event handlers (for cleanup)
  private boundWheel: ((e: WheelEvent) => void) | null = null;
  private boundMouseDown: ((e: MouseEvent) => void) | null = null;
  private boundMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundMouseUp: ((e: MouseEvent) => void) | null = null;

  constructor() {
    this.app = new Application();
    this.mapContainer = new Container();
    this.options = { ...DEFAULT_RENDER_OPTIONS };
  }

  async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
    this.canvas = canvas;
    this.width = width;
    this.height = height;

    await this.app.init({
      canvas,
      width,
      height,
      backgroundColor: 0x1a3a5c,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    this.app.stage.addChild(this.mapContainer);
    this.initialized = true;

    // Set up zoom and pan event handlers
    this.setupInputHandlers(canvas);

    // Start animation loop
    this.app.ticker.add(this.animate.bind(this));
  }

  private setupInputHandlers(canvas: HTMLCanvasElement): void {
    // Mouse wheel zoom
    this.boundWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Get mouse position relative to canvas
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Zoom factor
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoomAt(mouseX, mouseY, zoomFactor);
    };
    canvas.addEventListener('wheel', this.boundWheel, { passive: false });

    // Pan with middle mouse or right mouse
    this.boundMouseDown = (e: MouseEvent) => {
      if (e.button === 1 || e.button === 2) { // Middle or right click
        e.preventDefault();
        this.isPanning = true;
        this.lastPanX = e.clientX;
        this.lastPanY = e.clientY;
        canvas.style.cursor = 'grabbing';
      }
    };
    canvas.addEventListener('mousedown', this.boundMouseDown);

    this.boundMouseMove = (e: MouseEvent) => {
      if (this.isPanning) {
        const dx = e.clientX - this.lastPanX;
        const dy = e.clientY - this.lastPanY;
        this.lastPanX = e.clientX;
        this.lastPanY = e.clientY;
        this.pan(dx, dy);
      }
    };
    window.addEventListener('mousemove', this.boundMouseMove);

    this.boundMouseUp = (e: MouseEvent) => {
      if (this.isPanning) {
        this.isPanning = false;
        canvas.style.cursor = 'default';
      }
    };
    window.addEventListener('mouseup', this.boundMouseUp);

    // Prevent context menu on right click
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Zoom at a specific point (for mouse wheel zoom)
  private zoomAt(x: number, y: number, factor: number): void {
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));

    if (newZoom !== this.zoom) {
      // Adjust pan to zoom toward mouse position
      const worldX = (x - this.panX) / this.zoom;
      const worldY = (y - this.panY) / this.zoom;

      this.zoom = newZoom;

      this.panX = x - worldX * this.zoom;
      this.panY = y - worldY * this.zoom;

      this.applyTransform();
    }
  }

  // Pan by delta
  private pan(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
    this.applyTransform();
  }

  // Apply zoom and pan transform to container
  private applyTransform(): void {
    this.mapContainer.scale.set(this.zoom);
    this.mapContainer.x = this.panX;
    this.mapContainer.y = this.panY;
  }

  // Public zoom methods
  zoomIn(): void {
    this.zoomAt(this.width / 2, this.height / 2, 1.25);
  }

  zoomOut(): void {
    this.zoomAt(this.width / 2, this.height / 2, 0.8);
  }

  resetZoom(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.applyTransform();
  }

  getZoom(): number {
    return this.zoom;
  }

  private animate(ticker: { deltaTime: number }): void {
    if (!this.mapData || !this.oceanGraphics || !this.options.showPolygons) return;
    if (this.options.showElevation || this.options.showMoisture) return;

    this.animationTime += ticker.deltaTime * 0.08;

    // Retro style: step animation frames (like old games)
    // Use continuous time, no modulo reset
    const newFrame = Math.floor(this.animationTime);
    if (newFrame !== this.animationFrame) {
      this.animationFrame = newFrame;
      this.drawOceanAnimated(this.oceanGraphics, this.foamGraphics!, this.animationTime);
      this.drawShorelineAnimated(this.shoreGraphics!, this.animationTime);
    }

    // Clouds animate smoothly (not stepped) for dreamlike drift
    if (this.cloudGraphics && this.clouds.length > 0) {
      this.drawClouds(this.cloudGraphics, this.animationTime);
    }
  }

  setMap(mapData: MapData): void {
    this.mapData = mapData;
    // Cache ocean centers for animation (true ocean only - connected to border)
    this.oceanCenters = mapData.centers.filter(c => c.ocean);
    // Cache lake/inland water centers (water but not ocean)
    this.lakeCenters = mapData.centers.filter(c => c.water && !c.ocean);
    // Cache coastline edges (edges between ocean and land)
    this.coastlineEdges = this.findCoastlineEdges(mapData);
    // Generate very infrequent clouds
    this.generateClouds(mapData.config.seed);
    this.render();
  }

  private generateClouds(seed: number): void {
    this.clouds = [];

    // Very infrequent: only 2-4 clouds on the entire map
    // Use seed for deterministic but varied placement
    const rng = this.mulberry32(seed + 12345);
    const numClouds = 2 + Math.floor(rng() * 3); // 2-4 clouds

    for (let i = 0; i < numClouds; i++) {
      // Spread clouds across the map, starting off-screen to the left
      const cloud: Cloud = {
        x: -100 + rng() * (this.width + 200), // Can start off-screen
        y: 30 + rng() * (this.height * 0.4), // Upper portion of map
        scale: 0.6 + rng() * 0.8, // Varied sizes
        layers: 2 + Math.floor(rng() * 3), // 2-4 wispy layers
        seed: rng() * 10000, // Unique seed for shape variation
        speed: 0.02 + rng() * 0.03, // Very slow drift
      };
      this.clouds.push(cloud);
    }
  }

  // Simple seeded random for cloud generation
  private mulberry32(seed: number): () => number {
    return function() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  private findCoastlineEdges(mapData: MapData): Edge[] {
    const coastEdges: Edge[] = [];

    for (const edge of mapData.edges) {
      if (!edge.d0 || !edge.d1 || !edge.v0 || !edge.v1) continue;

      // Only consider true ocean (connected to map border), not lakes
      const d0IsOcean = edge.d0.ocean;
      const d1IsOcean = edge.d1.ocean;

      // One side must be ocean, the other must be land (not water at all)
      const d0IsLand = !edge.d0.water;
      const d1IsLand = !edge.d1.water;

      // Ocean-to-land edge only (excludes lake shorelines)
      if ((d0IsOcean && d1IsLand) || (d1IsOcean && d0IsLand)) {
        coastEdges.push(edge);
      }
    }

    return coastEdges;
  }

  setOptions(options: Partial<RenderOptions>): void {
    this.options = { ...this.options, ...options };
    this.render();
  }

  setTowns(towns: Town[]): void {
    this.towns = towns;
    this.render();
  }

  setRoads(roads: Road[]): void {
    this.roads = roads;
    this.render();
  }

  setTownsAndRoads(towns: Town[], roads: Road[]): void {
    this.towns = towns;
    this.roads = roads;
    this.render();
  }

  render(): void {
    if (!this.mapData || !this.initialized) return;

    this.mapContainer.removeChildren();
    this.oceanGraphics = null;
    this.lakeGraphics = null;
    this.foamGraphics = null;
    this.shoreGraphics = null;
    this.landGraphics = null;
    this.townGraphics = null;
    this.roadGraphics = null;
    this.cloudGraphics = null;

    // Draw polygons
    if (this.options.showPolygons) {
      // Ocean layer (animated)
      this.oceanGraphics = new Graphics();
      this.foamGraphics = new Graphics();
      this.drawOceanAnimated(this.oceanGraphics, this.foamGraphics, this.animationTime);
      this.mapContainer.addChild(this.oceanGraphics);
      this.mapContainer.addChild(this.foamGraphics);

      // Lake layer (static - no wave animation)
      this.lakeGraphics = new Graphics();
      this.drawLakePolygons(this.lakeGraphics);
      this.mapContainer.addChild(this.lakeGraphics);

      // Land layer (static)
      this.landGraphics = new Graphics();
      this.drawLandPolygons(this.landGraphics);
      this.mapContainer.addChild(this.landGraphics);

      // Shoreline foam (animated, on top of land)
      this.shoreGraphics = new Graphics();
      this.drawShorelineAnimated(this.shoreGraphics, this.animationTime);
      this.mapContainer.addChild(this.shoreGraphics);
    }

    // Draw edges on top
    if (this.options.showEdges) {
      const edgeGraphics = new Graphics();
      this.drawEdges(edgeGraphics);
      this.mapContainer.addChild(edgeGraphics);
    }

    // Draw rivers on top of everything
    if (this.options.showRivers) {
      const riverGraphics = new Graphics();
      this.drawRivers(riverGraphics);
      this.mapContainer.addChild(riverGraphics);
    }

    // Draw roads between rivers and towns
    if (this.options.showRoads && this.roads.length > 0) {
      this.roadGraphics = new Graphics();
      this.drawRoads(this.roadGraphics);
      this.mapContainer.addChild(this.roadGraphics);
    }

    // Draw towns on very top
    if (this.options.showTowns && this.towns.length > 0) {
      this.townGraphics = new Graphics();
      this.drawTowns(this.townGraphics);
      this.mapContainer.addChild(this.townGraphics);
    }

    // Draw clouds on the very top (atmospheric layer)
    if (this.options.showPolygons && this.clouds.length > 0) {
      this.cloudGraphics = new Graphics();
      this.drawClouds(this.cloudGraphics, this.animationTime);
      this.mapContainer.addChild(this.cloudGraphics);
    }
  }

  private drawRoads(graphics: Graphics): void {
    const roadEdge = 0x555555;     // Gray road edge
    const roadSurface = 0x2a2a2a;  // Dark asphalt
    const lineColor = 0xe8c840;    // Yellow center line

    for (const road of this.roads) {
      if (road.path.length < 2) continue;

      // Road width based on connected town sizes
      const sizeScore = (s: string) =>
        s === 'large' ? 3 : s === 'medium' ? 2 : 1;
      const importance = sizeScore(road.from.size) + sizeScore(road.to.size);
      const outerWidth = importance >= 5 ? 6 : importance >= 3 ? 4.5 : 3;
      const innerWidth = outerWidth - 1.2;

      // Pass 1: gray edge / shoulder
      graphics.moveTo(road.path[0].x, road.path[0].y);
      for (let i = 1; i < road.path.length; i++) {
        graphics.lineTo(road.path[i].x, road.path[i].y);
      }
      graphics.stroke({
        width: outerWidth,
        color: roadEdge,
        alpha: 0.85,
        cap: 'round',
        join: 'round',
      });

      // Pass 2: dark asphalt surface
      graphics.moveTo(road.path[0].x, road.path[0].y);
      for (let i = 1; i < road.path.length; i++) {
        graphics.lineTo(road.path[i].x, road.path[i].y);
      }
      graphics.stroke({
        width: innerWidth,
        color: roadSurface,
        alpha: 0.9,
        cap: 'round',
        join: 'round',
      });

      // Pass 3: yellow dashed center line as small dots
      const dotSpacing = 6;
      const dotRadius = 0.7;

      for (let seg = 0; seg < road.path.length - 1; seg++) {
        const ax = road.path[seg].x;
        const ay = road.path[seg].y;
        const bx = road.path[seg + 1].x;
        const by = road.path[seg + 1].y;
        const dx = bx - ax;
        const dy = by - ay;
        const segLen = Math.sqrt(dx * dx + dy * dy);
        if (segLen < 1) continue;

        const steps = Math.floor(segLen / dotSpacing);
        for (let d = 0; d <= steps; d++) {
          const t = steps === 0 ? 0.5 : d / steps;
          graphics.circle(ax + dx * t, ay + dy * t, dotRadius);
          graphics.fill({ color: lineColor, alpha: 0.9 });
        }
      }
    }
  }

  private drawTowns(graphics: Graphics): void {
    for (const town of this.towns) {
      const colors = TOWN_COLORS[town.type] || TOWN_COLORS.inland;

      // Create a container for each town (for interactivity)
      const townContainer = new Container();
      townContainer.x = town.x;
      townContainer.y = town.y;
      townContainer.eventMode = 'static';
      townContainer.cursor = 'pointer';

      // Draw the marker based on town size
      const marker = new Graphics();
      let markerSize: number;

      switch (town.size) {
        case 'large':
          markerSize = 10;
          this.drawLargeTownIcon(marker, colors);
          break;
        case 'medium':
          markerSize = 7;
          this.drawMediumTownIcon(marker, colors);
          break;
        case 'small':
        default:
          markerSize = 4;
          this.drawSmallTownIcon(marker, colors);
          break;
      }

      // Hit area (slightly larger for easier hovering)
      const hitArea = new Graphics();
      hitArea.circle(0, 0, markerSize + 8);
      hitArea.fill({ color: 0xffffff, alpha: 0 });

      townContainer.addChild(hitArea);
      townContainer.addChild(marker);

      // Create text labels
      if (town.name) {
        // Small label (always visible)
        const smallText = new Text({ text: town.name, style: TOWN_TEXT_SMALL });
        smallText.anchor.set(0.5, 0);
        smallText.x = 0;
        smallText.y = markerSize + 3;
        smallText.alpha = 0.7;

        // Large label (visible on hover)
        const largeText = new Text({ text: town.name, style: TOWN_TEXT_LARGE });
        largeText.anchor.set(0.5, 1);
        largeText.x = 0;
        largeText.y = -(markerSize + 5);
        largeText.visible = false;

        townContainer.addChild(smallText);
        townContainer.addChild(largeText);

        // Hover events
        townContainer.on('pointerenter', () => {
          smallText.visible = false;
          largeText.visible = true;
          marker.scale.set(1.3);
          // Bring to front
          this.mapContainer.addChild(townContainer);
        });

        townContainer.on('pointerleave', () => {
          smallText.visible = true;
          largeText.visible = false;
          marker.scale.set(1);
        });
      }

      this.mapContainer.addChild(townContainer);
    }
  }

  // Large town: Castle/fortress icon with towers
  private drawLargeTownIcon(
    graphics: Graphics,
    colors: { fill: number; stroke: number }
  ): void {
    const size = 10;

    // Outer glow/stroke
    graphics.roundRect(-size - 1, -size - 1, size * 2 + 2, size * 2 + 2, 2);
    graphics.fill(colors.stroke);

    // Main building body
    graphics.roundRect(-size + 1, -size * 0.5, size * 2 - 2, size * 1.5, 1);
    graphics.fill(colors.fill);

    // Left tower
    graphics.rect(-size + 1, -size, 4, size * 0.6);
    graphics.fill(colors.fill);
    // Tower top (battlement)
    graphics.rect(-size, -size - 2, 2, 3);
    graphics.fill(colors.fill);
    graphics.rect(-size + 3, -size - 2, 2, 3);
    graphics.fill(colors.fill);

    // Right tower
    graphics.rect(size - 5, -size, 4, size * 0.6);
    graphics.fill(colors.fill);
    // Tower top (battlement)
    graphics.rect(size - 5, -size - 2, 2, 3);
    graphics.fill(colors.fill);
    graphics.rect(size - 2, -size - 2, 2, 3);
    graphics.fill(colors.fill);

    // Center tower (taller)
    graphics.rect(-2, -size - 1, 4, size * 0.7);
    graphics.fill(colors.fill);
    // Center battlement
    graphics.rect(-2, -size - 3, 1.5, 3);
    graphics.fill(colors.fill);
    graphics.rect(0.5, -size - 3, 1.5, 3);
    graphics.fill(colors.fill);

    // Gate/door
    graphics.roundRect(-1.5, size * 0.3, 3, 4, 1);
    graphics.fill(colors.stroke);

    // Highlight
    graphics.rect(-size + 2, -size + 1, 2, 2);
    graphics.fill(0xffffff);
  }

  // Medium town: House/building cluster icon
  private drawMediumTownIcon(
    graphics: Graphics,
    colors: { fill: number; stroke: number }
  ): void {
    const size = 7;

    // Outer stroke
    graphics.circle(0, 0, size + 1.5);
    graphics.fill(colors.stroke);

    // Main circle
    graphics.circle(0, 0, size);
    graphics.fill(colors.fill);

    // House shape in center
    // Roof (triangle)
    graphics.moveTo(0, -size * 0.7);
    graphics.lineTo(-size * 0.5, -size * 0.1);
    graphics.lineTo(size * 0.5, -size * 0.1);
    graphics.closePath();
    graphics.fill(colors.stroke);

    // Building body
    graphics.rect(-size * 0.4, -size * 0.1, size * 0.8, size * 0.7);
    graphics.fill(0xffffff);

    // Door
    graphics.rect(-size * 0.15, size * 0.2, size * 0.3, size * 0.4);
    graphics.fill(colors.stroke);

    // Highlight
    graphics.circle(-size * 0.3, -size * 0.3, size * 0.15);
    graphics.fill(0xffffff);
  }

  // Small town: Simple diamond/dot icon
  private drawSmallTownIcon(
    graphics: Graphics,
    colors: { fill: number; stroke: number }
  ): void {
    const size = 4;

    // Outer stroke (diamond shape)
    graphics.moveTo(0, -size - 1);
    graphics.lineTo(size + 1, 0);
    graphics.lineTo(0, size + 1);
    graphics.lineTo(-size - 1, 0);
    graphics.closePath();
    graphics.fill(colors.stroke);

    // Inner fill (diamond)
    graphics.moveTo(0, -size);
    graphics.lineTo(size, 0);
    graphics.lineTo(0, size);
    graphics.lineTo(-size, 0);
    graphics.closePath();
    graphics.fill(colors.fill);

    // Small highlight
    graphics.circle(-size * 0.25, -size * 0.25, size * 0.3);
    graphics.fill(0xffffff);
  }

  private drawShorelineAnimated(graphics: Graphics, time: number): void {
    if (!this.mapData || this.coastlineEdges.length === 0) return;
    if (this.options.showElevation || this.options.showMoisture) return;

    graphics.clear();

    for (const edge of this.coastlineEdges) {
      if (!edge.v0 || !edge.v1) continue;

      const x0 = edge.v0.point.x;
      const y0 = edge.v0.point.y;
      const x1 = edge.v1.point.x;
      const y1 = edge.v1.point.y;

      // Calculate edge properties
      const midX = (x0 + x1) / 2;
      const midY = (y0 + y1) / 2;
      const edgeLength = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);

      if (edgeLength < 3) continue;

      // Direction perpendicular to edge (pointing toward ocean)
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.sqrt(dx * dx + dy * dy);

      // Perpendicular normalized
      let perpX = -dy / len;
      let perpY = dx / len;

      // Make sure perpendicular points toward ocean side
      if (edge.d0 && edge.d1) {
        const oceanSide = edge.d0.ocean || edge.d0.biome === 'LAKE' ? edge.d0 : edge.d1;
        const toOceanX = oceanSide.point.x - midX;
        const toOceanY = oceanSide.point.y - midY;
        const dot = perpX * toOceanX + perpY * toOceanY;
        if (dot < 0) {
          perpX = -perpX;
          perpY = -perpY;
        }
      }

      // Wave breaking animation - multiple phases along the edge
      this.drawBreakingWave(graphics, x0, y0, x1, y1, perpX, perpY, time, edgeLength);
    }
  }

  private drawBreakingWave(
    graphics: Graphics,
    x0: number, y0: number,
    x1: number, y1: number,
    perpX: number, perpY: number,
    time: number,
    edgeLength: number
  ): void {
    // Number of foam segments along this edge
    const numSegments = Math.max(1, Math.floor(edgeLength / 15));

    for (let i = 0; i < numSegments; i++) {
      // Position along edge
      const t = (i + 0.5) / numSegments;
      const baseX = x0 + (x1 - x0) * t;
      const baseY = y0 + (y1 - y0) * t;

      // Wave phase - each segment has offset phase based on position
      const phaseOffset = baseX * 0.05 + baseY * 0.03;
      const wavePhase = (time * 0.25 + phaseOffset);

      // Wave cycle: 0-1 represents one complete wave breaking cycle
      const cycle = wavePhase - Math.floor(wavePhase);

      // Wave approaches shore (0-0.4), breaks (0.4-0.6), recedes (0.6-1.0)
      let foamAlpha = 0;
      let foamOffset = 0;
      let foamWidth = 0;

      if (cycle < 0.4) {
        // Wave approaching - building foam line
        const approach = cycle / 0.4;
        foamAlpha = approach * 0.4;
        foamOffset = (1 - approach) * 8; // Moving toward shore
        foamWidth = 1 + approach * 1.5;
      } else if (cycle < 0.6) {
        // Wave breaking - peak foam
        const breaking = (cycle - 0.4) / 0.2;
        foamAlpha = 0.4 + breaking * 0.5;
        foamOffset = 0;
        foamWidth = 2.5 + breaking * 1;
      } else {
        // Wave receding - foam dissipating
        const recede = (cycle - 0.6) / 0.4;
        foamAlpha = 0.9 * (1 - recede * recede); // Fade out
        foamOffset = -recede * 4; // Moving away from shore
        foamWidth = 3.5 * (1 - recede * 0.5);
      }

      if (foamAlpha < 0.05) continue;

      // Position with offset (perpendicular to shore)
      const foamX = baseX + perpX * foamOffset;
      const foamY = baseY + perpY * foamOffset;

      // Segment length
      const segLen = edgeLength / numSegments * 0.7;

      // Draw foam line segment
      const tangentX = (x1 - x0) / edgeLength;
      const tangentY = (y1 - y0) / edgeLength;

      const startX = foamX - tangentX * segLen * 0.5;
      const startY = foamY - tangentY * segLen * 0.5;
      const endX = foamX + tangentX * segLen * 0.5;
      const endY = foamY + tangentY * segLen * 0.5;

      // Main foam line
      graphics.moveTo(startX, startY);
      graphics.lineTo(endX, endY);
      graphics.stroke({
        width: foamWidth,
        color: SHORE_COLORS.foam,
        alpha: foamAlpha * 0.9,
        cap: 'round'
      });

      // Secondary softer foam line (slightly offset)
      if (foamAlpha > 0.3 && cycle >= 0.35 && cycle < 0.8) {
        const offset2 = foamOffset - 2;
        const foam2X = baseX + perpX * offset2;
        const foam2Y = baseY + perpY * offset2;

        const start2X = foam2X - tangentX * segLen * 0.4;
        const start2Y = foam2Y - tangentY * segLen * 0.4;
        const end2X = foam2X + tangentX * segLen * 0.4;
        const end2Y = foam2Y + tangentY * segLen * 0.4;

        graphics.moveTo(start2X, start2Y);
        graphics.lineTo(end2X, end2Y);
        graphics.stroke({
          width: foamWidth * 0.6,
          color: SHORE_COLORS.foamMid,
          alpha: foamAlpha * 0.5,
          cap: 'round'
        });
      }
    }
  }

  private drawOceanAnimated(graphics: Graphics, foamGraphics: Graphics, time: number): void {
    if (!this.mapData) return;

    graphics.clear();
    foamGraphics.clear();

    // Only draw true ocean (connected to border) with wave animation
    for (const center of this.oceanCenters) {
      if (center.corners.length < 3) continue;

      let color: number;

      if (this.options.showElevation) {
        const e = Math.floor(center.elevation * 255);
        color = (e << 16) | (e << 8) | e;
      } else if (this.options.showMoisture) {
        const m = Math.floor(center.moisture * 255);
        color = (0 << 16) | (m << 8) | 255;
      } else {
        // Retro wave effect for ocean only
        const waveInfo = this.getRetroWaveInfo(center.point.x, center.point.y, time, false);
        color = waveInfo.color;

        // Draw the polygon
        const points = center.corners.flatMap((c) => [c.point.x, c.point.y]);
        graphics.poly(points);
        graphics.fill(color);

        // Draw white caps on wave crests
        if (waveInfo.hasWhitecap) {
          this.drawWhitecap(foamGraphics, center, waveInfo.whitecapIntensity, OCEAN_COLORS);
        }
        continue;
      }

      const points = center.corners.flatMap((c) => [c.point.x, c.point.y]);
      graphics.poly(points);
      graphics.fill(color);
    }
  }

  private drawLakePolygons(graphics: Graphics): void {
    if (!this.mapData) return;

    // Draw inland water (lakes) with static color - no wave animation
    for (const center of this.lakeCenters) {
      if (center.corners.length < 3) continue;

      let color: number;

      if (this.options.showElevation) {
        const e = Math.floor(center.elevation * 255);
        color = (e << 16) | (e << 8) | e;
      } else if (this.options.showMoisture) {
        const m = Math.floor(center.moisture * 255);
        color = (0 << 16) | (m << 8) | 255;
      } else {
        // Static lake color
        color = LAKE_COLORS.mid;
      }

      const points = center.corners.flatMap((c) => [c.point.x, c.point.y]);
      graphics.poly(points);
      graphics.fill(color);
    }
  }

  private getRetroWaveInfo(
    x: number,
    y: number,
    time: number,
    isLake: boolean
  ): { color: number; hasWhitecap: boolean; whitecapIntensity: number } {
    const colors = isLake ? LAKE_COLORS : OCEAN_COLORS;

    // SMB3-style horizontal wave bands that scroll continuously
    // Using sine waves ensures smooth looping without resets
    const waveSpeed = 0.15;
    const waveFreq = 0.025;
    const waveFreq2 = 0.018;

    // Primary horizontal wave - scrolls right
    const wave1 = Math.sin((x * waveFreq) - (time * waveSpeed));
    // Secondary diagonal wave for variety
    const wave2 = Math.sin(((x + y * 0.5) * waveFreq2) - (time * waveSpeed * 0.7));
    // Vertical variation - slower movement
    const wave3 = Math.sin((y * 0.02) - (time * 0.08));

    // Combine waves
    const combined = wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2;

    // Quantize to discrete levels (retro style)
    const quantized = Math.floor((combined + 1) * 2.5); // 0-4 levels

    let color: number;
    let hasWhitecap = false;
    let whitecapIntensity = 0;

    switch (quantized) {
      case 0:
        color = colors.dark;
        break;
      case 1:
        color = colors.mid;
        break;
      case 2:
        color = colors.mid;
        break;
      case 3:
        color = colors.light;
        break;
      case 4:
      default:
        color = colors.highlight;
        // White caps appear on the highest wave crests
        // Use sine for smooth continuous foam appearance
        const foamPhase = Math.sin(x * 0.08 + y * 0.11 - time * 0.12);
        if (foamPhase > 0.3) {
          hasWhitecap = true;
          whitecapIntensity = (foamPhase - 0.3) / 0.7;
        }
        break;
    }

    return { color, hasWhitecap, whitecapIntensity };
  }

  private drawWhitecap(
    graphics: Graphics,
    center: Center,
    intensity: number,
    colors: typeof OCEAN_COLORS
  ): void {
    // Draw foam as small highlights within the polygon
    const cx = center.point.x;
    const cy = center.point.y;

    // Calculate polygon size for scaling foam
    let minX = Infinity, maxX = -Infinity;
    for (const corner of center.corners) {
      minX = Math.min(minX, corner.point.x);
      maxX = Math.max(maxX, corner.point.x);
    }
    const size = (maxX - minX) * 0.3 * intensity;

    if (size < 2) return;

    // Draw foam as small curved line segments (like SMB3 wave tops)
    const foamColor = intensity > 0.5 ? colors.foam : colors.foamLight;

    // Create a small arc/squiggle for the foam
    const foamY = cy - size * 0.3;

    graphics.moveTo(cx - size, foamY);
    graphics.quadraticCurveTo(cx - size * 0.5, foamY - size * 0.4, cx, foamY);
    graphics.quadraticCurveTo(cx + size * 0.5, foamY + size * 0.3, cx + size, foamY);
    graphics.stroke({ width: Math.max(1.5, size * 0.25), color: foamColor, cap: 'round' });

    // Add a second smaller foam line for more detail
    if (intensity > 0.6 && size > 4) {
      const foamY2 = cy + size * 0.2;
      graphics.moveTo(cx - size * 0.6, foamY2);
      graphics.quadraticCurveTo(cx, foamY2 - size * 0.2, cx + size * 0.5, foamY2);
      graphics.stroke({ width: Math.max(1, size * 0.15), color: colors.foamLight, cap: 'round' });
    }
  }

  private drawClouds(graphics: Graphics, time: number): void {
    graphics.clear();

    for (const cloud of this.clouds) {
      // Slowly drift clouds across the screen
      const driftX = cloud.x + time * cloud.speed * 20;

      // Wrap around when cloud goes off screen
      const wrappedX = ((driftX + 200) % (this.width + 400)) - 200;

      // Subtle vertical bob
      const bobY = cloud.y + Math.sin(time * 0.02 + cloud.seed) * 5;

      this.drawAsianCloud(graphics, wrappedX, bobY, cloud.scale, cloud.layers, cloud.seed, time);
    }
  }

  private drawAsianCloud(
    graphics: Graphics,
    x: number,
    y: number,
    scale: number,
    layers: number,
    seed: number,
    time: number
  ): void {
    // Asian art style clouds: flowing curves with layered wisps
    // Inspired by ukiyo-e and traditional Chinese painting

    const rng = this.mulberry32(Math.floor(seed));
    const baseWidth = 80 * scale;
    const baseHeight = 30 * scale;

    // Draw multiple wispy layers
    for (let layer = 0; layer < layers; layer++) {
      const layerOffset = layer * 8 * scale;
      const layerY = y + layerOffset;
      const layerScale = 1 - layer * 0.15;
      const alpha = 0.6 - layer * 0.12;

      // Each layer has flowing curved segments
      this.drawCloudWisp(
        graphics,
        x - baseWidth * 0.3 * layerScale + rng() * 20,
        layerY,
        baseWidth * layerScale,
        baseHeight * layerScale * (0.8 + rng() * 0.4),
        alpha,
        seed + layer,
        time
      );
    }

    // Add some smaller accent wisps
    const numAccents = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < numAccents; i++) {
      const accentX = x + (rng() - 0.5) * baseWidth * 1.5;
      const accentY = y + rng() * baseHeight * 0.5;
      const accentScale = 0.3 + rng() * 0.3;

      this.drawCloudWisp(
        graphics,
        accentX,
        accentY,
        baseWidth * accentScale,
        baseHeight * accentScale * 0.6,
        0.35,
        seed + 100 + i,
        time
      );
    }
  }

  private drawCloudWisp(
    graphics: Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    alpha: number,
    seed: number,
    time: number
  ): void {
    // Create flowing, curved cloud shape like traditional Asian art
    // Uses bezier curves for smooth, organic shapes

    const rng = this.mulberry32(Math.floor(seed * 7919));

    // Subtle breathing animation
    const breathe = 1 + Math.sin(time * 0.03 + seed * 0.1) * 0.05;
    const w = width * breathe;
    const h = height * breathe;

    // Number of curves in this wisp (more = more flowing)
    const numCurves = 3 + Math.floor(rng() * 2);

    // Start point (left side with slight curve up)
    const startX = x;
    const startY = y + h * 0.3;

    graphics.moveTo(startX, startY);

    // Top edge - flowing curves going right
    let currentX = startX;
    const segmentWidth = w / numCurves;

    for (let i = 0; i < numCurves; i++) {
      const nextX = currentX + segmentWidth;
      const peakOffset = (rng() - 0.3) * h * 0.8;
      const cpX1 = currentX + segmentWidth * 0.3;
      const cpY1 = y - h * 0.3 + peakOffset;
      const cpX2 = currentX + segmentWidth * 0.7;
      const cpY2 = y - h * 0.2 + peakOffset * 0.5;

      graphics.bezierCurveTo(cpX1, cpY1, cpX2, cpY2, nextX, y + rng() * h * 0.2);
      currentX = nextX;
    }

    // Right curl (characteristic of Asian clouds)
    const curlX = currentX + w * 0.1;
    const curlY = y + h * 0.4;
    graphics.bezierCurveTo(
      currentX + w * 0.05, y + h * 0.1,
      curlX, y + h * 0.2,
      curlX - w * 0.05, curlY
    );

    // Bottom edge - gentler curves going back left
    currentX = curlX - w * 0.05;
    for (let i = 0; i < numCurves; i++) {
      const nextX = currentX - segmentWidth;
      const dip = rng() * h * 0.3;
      const cpX1 = currentX - segmentWidth * 0.3;
      const cpY1 = y + h * 0.5 + dip;
      const cpX2 = currentX - segmentWidth * 0.7;
      const cpY2 = y + h * 0.4 + dip * 0.5;

      graphics.bezierCurveTo(cpX1, cpY1, cpX2, cpY2, nextX, y + h * 0.3 + rng() * h * 0.1);
      currentX = nextX;
    }

    // Close back to start with a small curl
    graphics.bezierCurveTo(
      startX - w * 0.05, y + h * 0.4,
      startX - w * 0.03, y + h * 0.35,
      startX, startY
    );

    // Fill with soft white
    graphics.fill({ color: CLOUD_COLORS.main, alpha: alpha * 0.85 });

    // Subtle outline for that ink-painting look
    graphics.moveTo(startX, startY);

    // Redraw just the top edge for the outline
    currentX = startX;
    const rng2 = this.mulberry32(Math.floor(seed * 7919));

    for (let i = 0; i < numCurves; i++) {
      const nextX = currentX + segmentWidth;
      const peakOffset = (rng2() - 0.3) * h * 0.8;
      const cpX1 = currentX + segmentWidth * 0.3;
      const cpY1 = y - h * 0.3 + peakOffset;
      const cpX2 = currentX + segmentWidth * 0.7;
      const cpY2 = y - h * 0.2 + peakOffset * 0.5;

      graphics.bezierCurveTo(cpX1, cpY1, cpX2, cpY2, nextX, y + rng2() * h * 0.2);
      currentX = nextX;
    }

    graphics.stroke({
      width: Math.max(0.5, width * 0.01),
      color: CLOUD_COLORS.outline,
      alpha: alpha * 0.4,
      cap: 'round'
    });
  }

  private drawLandPolygons(graphics: Graphics): void {
    if (!this.mapData) return;

    for (const center of this.mapData.centers) {
      // Skip ocean/lake tiles (they're drawn in the animated layer)
      if (center.ocean || center.biome === 'LAKE') continue;
      if (center.corners.length < 3) continue;

      let color: number;

      if (this.options.showElevation) {
        const e = Math.floor(center.elevation * 255);
        color = (e << 16) | (e << 8) | e;
      } else if (this.options.showMoisture) {
        const m = Math.floor(center.moisture * 255);
        color = (0 << 16) | (m << 8) | 255;
      } else {
        color = BIOME_COLORS[center.biome];
      }

      const points = center.corners.flatMap((c) => [c.point.x, c.point.y]);
      graphics.poly(points);
      graphics.fill(color);
    }
  }

  private drawEdges(graphics: Graphics): void {
    if (!this.mapData) return;

    for (const edge of this.mapData.edges) {
      if (edge.v0 && edge.v1) {
        graphics.moveTo(edge.v0.point.x, edge.v0.point.y);
        graphics.lineTo(edge.v1.point.x, edge.v1.point.y);
        graphics.stroke({ width: 1, color: 0x000000, alpha: 0.2 });
      }
    }
  }

  private drawRivers(graphics: Graphics): void {
    if (!this.mapData) return;

    const riverColor = 0x3068a0;

    // First pass: draw all river segments with round caps
    for (const edge of this.mapData.edges) {
      if (edge.river > 0 && edge.v0 && edge.v1) {
        const width = Math.sqrt(edge.river) * 2;
        graphics.moveTo(edge.v0.point.x, edge.v0.point.y);
        graphics.lineTo(edge.v1.point.x, edge.v1.point.y);
        graphics.stroke({ width, color: riverColor, cap: 'round', join: 'round' });
      }
    }

    // Second pass: draw circles at all river corners to smooth joins
    // Collect corners that have rivers and their max river width
    const cornerRiverWidth = new Map<number, number>();

    for (const edge of this.mapData.edges) {
      if (edge.river > 0) {
        const width = Math.sqrt(edge.river) * 2;

        if (edge.v0) {
          const current = cornerRiverWidth.get(edge.v0.index) || 0;
          cornerRiverWidth.set(edge.v0.index, Math.max(current, width));
        }
        if (edge.v1) {
          const current = cornerRiverWidth.get(edge.v1.index) || 0;
          cornerRiverWidth.set(edge.v1.index, Math.max(current, width));
        }
      }
    }

    // Draw circles at river junctions
    for (const corner of this.mapData.corners) {
      const width = cornerRiverWidth.get(corner.index);
      if (width && width > 0) {
        // Count how many river edges touch this corner
        let riverEdgeCount = 0;
        for (const edge of corner.protrudes) {
          if (edge.river > 0) riverEdgeCount++;
        }

        // Draw join circle if multiple rivers meet or river is thick
        if (riverEdgeCount >= 2 || width > 3) {
          graphics.circle(corner.point.x, corner.point.y, width / 2);
          graphics.fill(riverColor);
        }
      }
    }
  }

  resize(width: number, height: number): void {
    if (!this.initialized) return;
    this.app.renderer.resize(width, height);
  }

  destroy(): void {
    if (this.initialized) {
      this.app.ticker.stop();
      this.app.destroy(true);
      this.initialized = false;
    }
  }
}

// Data structures based on Amit Patel's polygon map generation
// Graph structure with Centers (polygons), Corners (vertices), and Edges

export interface Point {
  x: number;
  y: number;
}

export interface Corner {
  index: number;
  point: Point;
  ocean: boolean;
  water: boolean;
  coast: boolean;
  border: boolean;
  elevation: number;
  moisture: number;

  // Adjacent structures
  touches: Center[];  // Polygons touching this corner
  protrudes: Edge[];  // Edges touching this corner
  adjacent: Corner[]; // Corners connected to this corner

  // River
  river: number;
  downslope: Corner | null;
  watershed: Corner | null;
  watershedSize: number;
}

export interface Center {
  index: number;
  point: Point;
  ocean: boolean;
  water: boolean;
  coast: boolean;
  border: boolean;
  elevation: number;
  moisture: number;
  biome: Biome;

  // Adjacent structures
  neighbors: Center[];  // Adjacent polygons
  borders: Edge[];      // Bordering edges
  corners: Corner[];    // Polygon corners
}

export interface Edge {
  index: number;
  d0: Center | null;    // Polygon on one side
  d1: Center | null;    // Polygon on other side
  v0: Corner | null;    // Corner at one end
  v1: Corner | null;    // Corner at other end
  midpoint: Point | null;
  river: number;
}

export type Biome =
  | 'OCEAN'
  | 'LAKE'
  | 'BEACH'
  | 'ICE'
  | 'MARSH'
  | 'SNOW'
  | 'TUNDRA'
  | 'BARE'
  | 'SCORCHED'
  | 'TAIGA'
  | 'SHRUBLAND'
  | 'TEMPERATE_DESERT'
  | 'TEMPERATE_RAIN_FOREST'
  | 'TEMPERATE_DECIDUOUS_FOREST'
  | 'GRASSLAND'
  | 'TROPICAL_RAIN_FOREST'
  | 'TROPICAL_SEASONAL_FOREST'
  | 'SUBTROPICAL_DESERT';

export const BIOME_COLORS: Record<Biome, number> = {
  OCEAN: 0x080818,
  LAKE: 0x0a0c28,
  BEACH: 0xe0d8c8,                  // warm cream coastline
  ICE: 0xd8d8f0,                    // pale icy lavender
  MARSH: 0x304838,                  // dark blue-green
  SNOW: 0xf0eef8,                   // near-white with purple tint
  TUNDRA: 0x6030b0,                 // vibrant purple mid-mountain
  BARE: 0x2a1050,                   // deep purple upper-mountain
  SCORCHED: 0x100618,               // near-black purple peaks
  TAIGA: 0x485828,                  // dark olive
  SHRUBLAND: 0x7a7850,              // tan-olive
  TEMPERATE_DESERT: 0xa89a60,       // warm tan
  TEMPERATE_RAIN_FOREST: 0x486030,  // dark olive-green
  TEMPERATE_DECIDUOUS_FOREST: 0x5a7030, // medium olive-green
  GRASSLAND: 0x7a8838,              // muted olive green
  TROPICAL_RAIN_FOREST: 0x3a5028,   // deep dark green
  TROPICAL_SEASONAL_FOREST: 0x507038, // medium dark green
  SUBTROPICAL_DESERT: 0xa89860,     // sandy tan
};

export interface MapConfig {
  width: number;
  height: number;
  numPoints: number;
  seed: number;
  islandFactor: number;  // 1.0 = full island, 0.0 = no island shape
  lakeFactor: number;    // Probability of lakes
  riverCount: number;
}

export const DEFAULT_CONFIG: MapConfig = {
  width: 800,
  height: 600,
  numPoints: 2000,
  seed: 12345,
  islandFactor: 1.07,
  lakeFactor: 0.3,
  riverCount: 50,
};

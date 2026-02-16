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
  OCEAN: 0x44447a,
  LAKE: 0x336699,
  BEACH: 0xa09077,
  ICE: 0x99ffff,
  MARSH: 0x2f6666,
  SNOW: 0xffffff,
  TUNDRA: 0xbbbbaa,
  BARE: 0x888888,
  SCORCHED: 0x555555,
  TAIGA: 0x99aa77,
  SHRUBLAND: 0x889977,
  TEMPERATE_DESERT: 0xc9d29b,
  TEMPERATE_RAIN_FOREST: 0x448855,
  TEMPERATE_DECIDUOUS_FOREST: 0x679459,
  GRASSLAND: 0x88aa55,
  TROPICAL_RAIN_FOREST: 0x337755,
  TROPICAL_SEASONAL_FOREST: 0x559944,
  SUBTROPICAL_DESERT: 0xd2b98b,
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

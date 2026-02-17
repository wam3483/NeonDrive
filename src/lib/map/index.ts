// Map generation module exports
export { generateMap, DEFAULT_CONFIG, BIOME_COLORS } from './generator';
export { MapRenderer } from './renderer';
export {
  TownGenerator,
  DEFAULT_TOWN_CONFIG,
  createTownConfig,
  createElevationRule,
} from './towns';
export { TownNameGenerator, generateTownNames } from './townNames';
export { generateRoads } from './roads';
export { buildNoisyEdges, buildNoisyPolygon } from './noisyEdges';
export type { MapData, MapConfig, Center, Corner, Edge, Graph } from './generator';
export type { RenderOptions } from './renderer';
export type {
  Town,
  TownSize,
  TownConfig,
  TownPlacementRule,
  TownGeneratorResult,
} from './towns';
export type { Road, RoadNetwork } from './roads';
export type { NoisyEdgeData } from './noisyEdges';

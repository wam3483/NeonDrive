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
export type { MapData, MapConfig, Center, Corner, Edge, Graph } from './generator';
export type { RenderOptions } from './renderer';
export type {
  Town,
  TownConfig,
  TownPlacementRule,
  TownGeneratorResult,
} from './towns';

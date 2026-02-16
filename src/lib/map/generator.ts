// Main map generator that combines all components
import type { MapConfig, Center, Corner, Edge } from './types';
import { DEFAULT_CONFIG } from './types';
import { Random } from './random';
import { buildGraph, type Graph } from './voronoi';
import {
  assignWater,
  assignElevation,
  createRivers,
  assignMoisture,
  assignBiomes,
} from './terrain';

export interface MapData extends Graph {
  config: MapConfig;
}

export function generateMap(userConfig: Partial<MapConfig> = {}): MapData {
  const config: MapConfig = { ...DEFAULT_CONFIG, ...userConfig };
  const random = new Random(config.seed);

  // Build the graph structure
  const graph = buildGraph(config, random);

  // Assign terrain features
  assignWater(graph, config, random);
  assignElevation(graph, config);
  createRivers(graph, config, random);
  assignMoisture(graph);
  assignBiomes(graph);

  return {
    ...graph,
    config,
  };
}

// Re-export types
export type { MapConfig, Center, Corner, Edge, Graph };
export { DEFAULT_CONFIG, BIOME_COLORS } from './types';

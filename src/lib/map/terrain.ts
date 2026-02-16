// Terrain generation: elevation, moisture, rivers, and biomes
import type { Graph } from './voronoi';
import type { Center, Corner, Edge, MapConfig, Biome, Point } from './types';
import { Random, SimplexNoise } from './random';

// Assign water/land based on island shape
export function assignWater(graph: Graph, config: MapConfig, random: Random): void {
  const noise = new SimplexNoise(random);
  const { width, height, islandFactor } = config;
  const cx = width / 2;
  const cy = height / 2;

  // Assign water to corners
  for (const corner of graph.corners) {
    // Distance from center, normalized
    const dx = (corner.point.x - cx) / cx;
    const dy = (corner.point.y - cy) / cy;
    const d = Math.sqrt(dx * dx + dy * dy);

    // Use noise for irregular coastline
    const noiseVal = noise.fbm(corner.point.x * 0.01, corner.point.y * 0.01, 4);

    // Island shape: radial gradient with noise
    const islandShape = d * islandFactor - 0.3 + noiseVal * 0.4;

    corner.water = islandShape > 0.3;
    corner.ocean = corner.border;
  }

  // Flood fill to determine ocean vs lake
  const queue: Corner[] = [];

  // Start from border corners (they're ocean)
  for (const corner of graph.corners) {
    if (corner.border) {
      corner.ocean = true;
      corner.water = true;
      queue.push(corner);
    }
  }

  // Flood fill ocean
  while (queue.length > 0) {
    const corner = queue.shift()!;
    for (const adj of corner.adjacent) {
      if (adj.water && !adj.ocean) {
        adj.ocean = true;
        queue.push(adj);
      }
    }
  }

  // Assign water to centers based on corners
  for (const center of graph.centers) {
    let numWater = 0;
    let numOcean = 0;

    for (const corner of center.corners) {
      if (corner.water) numWater++;
      if (corner.ocean) numOcean++;
    }

    center.water = numWater >= center.corners.length * config.lakeFactor;
    center.ocean = numOcean >= center.corners.length * 0.5;

    // Border cells are always ocean
    if (center.corners.some((c) => c.border)) {
      center.border = true;
      center.ocean = true;
      center.water = true;
    }
  }

  // Determine coast (land adjacent to ocean)
  for (const center of graph.centers) {
    if (!center.water) {
      for (const neighbor of center.neighbors) {
        if (neighbor.ocean) {
          center.coast = true;
          break;
        }
      }
    }
  }

  for (const corner of graph.corners) {
    let landCount = 0;
    let oceanCount = 0;

    for (const center of corner.touches) {
      if (center.ocean) oceanCount++;
      if (!center.water) landCount++;
    }

    corner.coast = landCount > 0 && oceanCount > 0;
  }
}

// Assign elevation using distance from coast
export function assignElevation(graph: Graph, config: MapConfig): void {
  // Assign corner elevations (BFS from coast)
  const queue: Corner[] = [];

  for (const corner of graph.corners) {
    if (corner.ocean) {
      corner.elevation = 0;
      queue.push(corner);
    } else if (corner.coast) {
      corner.elevation = 0;
      queue.push(corner);
    } else {
      corner.elevation = Infinity;
    }
  }

  // BFS to assign elevations
  while (queue.length > 0) {
    const corner = queue.shift()!;

    for (const adj of corner.adjacent) {
      const newElevation = corner.elevation + 0.01;

      if (!adj.water && newElevation < adj.elevation) {
        adj.elevation = newElevation;
        queue.push(adj);
      }
    }
  }

  // Normalize and redistribute elevations for better terrain
  const landCorners = graph.corners.filter((c) => !c.ocean);
  landCorners.sort((a, b) => a.elevation - b.elevation);

  for (let i = 0; i < landCorners.length; i++) {
    // Use sqrt for more flat lowlands and steep mountains
    const y = i / (landCorners.length - 1 || 1);
    landCorners[i].elevation = Math.sqrt(y);
  }

  // Set ocean corner elevations
  for (const corner of graph.corners) {
    if (corner.ocean) {
      corner.elevation = 0;
    }
  }

  // Center elevation is average of corners
  for (const center of graph.centers) {
    let sum = 0;
    for (const corner of center.corners) {
      sum += corner.elevation;
    }
    center.elevation = sum / (center.corners.length || 1);
  }
}

// Calculate downslopes for river flow
export function calculateDownslopes(graph: Graph): void {
  for (const corner of graph.corners) {
    let lowest = corner;

    for (const adj of corner.adjacent) {
      if (adj.elevation < lowest.elevation) {
        lowest = adj;
      }
    }

    corner.downslope = lowest === corner ? null : lowest;
  }
}

// Create rivers
export function createRivers(graph: Graph, config: MapConfig, random: Random): void {
  calculateDownslopes(graph);

  // Find valid river starting points (high elevation, not ocean)
  const candidates = graph.corners.filter(
    (c) => !c.ocean && !c.coast && c.elevation > 0.3
  );

  random.shuffle(candidates);

  let riverCount = 0;
  for (const corner of candidates) {
    if (riverCount >= config.riverCount) break;

    // Trace river downhill
    let current: Corner | null = corner;
    while (current && !current.ocean) {
      if (current.river > 0) {
        // Join existing river
        current.river++;
        break;
      }

      current.river++;

      // Mark edge as river
      if (current.downslope) {
        for (const edge of current.protrudes) {
          if (
            (edge.v0 === current && edge.v1 === current.downslope) ||
            (edge.v1 === current && edge.v0 === current.downslope)
          ) {
            edge.river++;
          }
        }
      }

      current = current.downslope;
    }

    riverCount++;
  }
}

// Calculate moisture based on distance from water
export function assignMoisture(graph: Graph): void {
  const queue: Corner[] = [];

  // Start from water and rivers
  for (const corner of graph.corners) {
    if (corner.water || corner.river > 0) {
      corner.moisture = corner.river > 0 ? Math.min(3, corner.river * 0.2) : 1;
      queue.push(corner);
    } else {
      corner.moisture = 0;
    }
  }

  // BFS to spread moisture
  while (queue.length > 0) {
    const corner = queue.shift()!;

    for (const adj of corner.adjacent) {
      const newMoisture = corner.moisture * 0.9;

      if (newMoisture > adj.moisture) {
        adj.moisture = newMoisture;
        queue.push(adj);
      }
    }
  }

  // Normalize moisture
  const landCorners = graph.corners.filter((c) => !c.ocean);
  landCorners.sort((a, b) => a.moisture - b.moisture);

  for (let i = 0; i < landCorners.length; i++) {
    landCorners[i].moisture = i / (landCorners.length - 1 || 1);
  }

  // Center moisture is average of corners
  for (const center of graph.centers) {
    let sum = 0;
    for (const corner of center.corners) {
      sum += corner.moisture;
    }
    center.moisture = sum / (center.corners.length || 1);
  }
}

// Assign biomes based on elevation and moisture
export function assignBiomes(graph: Graph): void {
  for (const center of graph.centers) {
    center.biome = getBiome(center);
  }
}

function getBiome(center: Center): Biome {
  if (center.ocean) {
    return 'OCEAN';
  }

  if (center.water) {
    if (center.elevation < 0.1) return 'MARSH';
    return 'LAKE';
  }

  if (center.coast) {
    return 'BEACH';
  }

  const e = center.elevation;
  const m = center.moisture;

  // High elevation
  if (e > 0.8) {
    if (m > 0.5) return 'SNOW';
    if (m > 0.33) return 'TUNDRA';
    if (m > 0.16) return 'BARE';
    return 'SCORCHED';
  }

  // Medium-high elevation
  if (e > 0.6) {
    if (m > 0.66) return 'TAIGA';
    if (m > 0.33) return 'SHRUBLAND';
    return 'TEMPERATE_DESERT';
  }

  // Medium elevation
  if (e > 0.3) {
    if (m > 0.83) return 'TEMPERATE_RAIN_FOREST';
    if (m > 0.5) return 'TEMPERATE_DECIDUOUS_FOREST';
    if (m > 0.16) return 'GRASSLAND';
    return 'TEMPERATE_DESERT';
  }

  // Low elevation
  if (m > 0.66) return 'TROPICAL_RAIN_FOREST';
  if (m > 0.33) return 'TROPICAL_SEASONAL_FOREST';
  if (m > 0.16) return 'GRASSLAND';
  return 'SUBTROPICAL_DESERT';
}

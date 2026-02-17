// Noisy edge generation for polygon boundaries
// Each Voronoi edge (v0→v1) gets a fixed number of intermediate points
// displaced laterally within the quadrilateral formed by the edge and
// its adjacent polygon centers.

import type { Point, Center, Edge } from './types';
import type { MapData } from './generator';
import { Random } from './random';

export interface NoisyEdgeData {
  // edge index → full path from v0 to v1 (including endpoints)
  paths: Map<number, Point[]>;
}

const NUM_POINTS = 4; // intermediate points between each vertex pair

/**
 * Pre-compute noisy paths for every valid land-only edge.
 */
export function buildNoisyEdges(
  mapData: MapData,
  seed: number
): NoisyEdgeData {
  const random = new Random(seed + 77777);
  const paths = new Map<number, Point[]>();

  for (const edge of mapData.edges) {
    if (!edge.d0 || !edge.d1 || !edge.v0 || !edge.v1) continue;

    // Skip any edge that touches water
    if (edge.d0.water || edge.d0.ocean || edge.d1.water || edge.d1.ocean)
      continue;

    const amp =
      edge.d0.biome !== edge.d1.biome ? 0.04 : 0.02;

    paths.set(
      edge.index,
      noisyLine(random, edge.v0.point, edge.v1.point, edge.d0.point, edge.d1.point, amp)
    );
  }

  return { paths };
}

/**
 * Build the flat [x,y,x,y,...] polygon array for a center by walking its
 * noisy edge paths in sorted corner order.
 */
export function buildNoisyPolygon(
  center: Center,
  ne: NoisyEdgeData
): number[] {
  const corners = center.corners;
  if (corners.length < 3)
    return corners.flatMap((c) => [c.point.x, c.point.y]);

  // Lookup: "cornerA-cornerB" → Edge
  const edgeLookup = new Map<string, Edge>();
  for (const edge of center.borders) {
    if (edge.v0 && edge.v1) {
      edgeLookup.set(`${edge.v0.index}-${edge.v1.index}`, edge);
      edgeLookup.set(`${edge.v1.index}-${edge.v0.index}`, edge);
    }
  }

  const pts: number[] = [];

  for (let i = 0; i < corners.length; i++) {
    const c0 = corners[i];
    const c1 = corners[(i + 1) % corners.length];
    const edge = edgeLookup.get(`${c0.index}-${c1.index}`);

    if (edge && ne.paths.has(edge.index)) {
      const path = ne.paths.get(edge.index)!;

      // Path is stored v0→v1. Figure out if we're walking it forward or backward.
      const forward = edge.v0 !== null && c0.index === edge.v0.index;

      if (forward) {
        // Emit all points except the last (v1 = next edge's start)
        for (let j = 0; j < path.length - 1; j++) {
          pts.push(path[j].x, path[j].y);
        }
      } else {
        // Walk reversed, skip the last emitted (v0 = next edge's start)
        for (let j = path.length - 1; j >= 1; j--) {
          pts.push(path[j].x, path[j].y);
        }
      }
    } else {
      // No noisy path — straight corner
      pts.push(c0.point.x, c0.point.y);
    }
  }

  return pts;
}

// --- internals ---

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Generate a noisy path from v0 to v1.
 * d0 and d1 are the adjacent polygon centers, used to define the
 * lateral displacement direction.
 */
function noisyLine(
  random: Random,
  v0: Point,
  v1: Point,
  d0: Point,
  d1: Point,
  amplitude: number
): Point[] {
  // Perpendicular displacement direction: from d0 toward d1
  const perpX = d1.x - d0.x;
  const perpY = d1.y - d0.y;
  const perpLen = Math.sqrt(perpX * perpX + perpY * perpY);

  const points: Point[] = [v0];

  for (let i = 1; i <= NUM_POINTS; i++) {
    const t = i / (NUM_POINTS + 1);
    const base = lerp(v0, v1, t);

    // Displace along the d0→d1 direction by a random amount
    const offset = random.float(-amplitude, amplitude) * perpLen;
    points.push({
      x: base.x + (perpX / perpLen) * offset,
      y: base.y + (perpY / perpLen) * offset,
    });
  }

  points.push(v1);
  return points;
}

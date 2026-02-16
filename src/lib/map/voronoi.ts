// Voronoi diagram generation using Delaunator
import Delaunator from 'delaunator';
import type { Point, Center, Corner, Edge, MapConfig } from './types';
import { Random } from './random';

export interface Graph {
  centers: Center[];
  corners: Corner[];
  edges: Edge[];
}

// Generate random points with Lloyd relaxation for more even distribution
function generatePoints(config: MapConfig, random: Random): Point[] {
  const points: Point[] = [];

  // Generate initial random points
  for (let i = 0; i < config.numPoints; i++) {
    points.push({
      x: random.float(10, config.width - 10),
      y: random.float(10, config.height - 10),
    });
  }

  // Apply Lloyd relaxation (2 iterations)
  for (let iter = 0; iter < 2; iter++) {
    const delaunay = Delaunator.from(points.map(p => [p.x, p.y]));
    const centroids = calculateCentroids(points, delaunay, config);

    for (let i = 0; i < points.length; i++) {
      if (centroids[i]) {
        points[i] = centroids[i];
      }
    }
  }

  return points;
}

// Calculate Voronoi cell centroids for Lloyd relaxation
function calculateCentroids(
  points: Point[],
  delaunay: Delaunator<number[]>,
  config: MapConfig
): (Point | null)[] {
  const { triangles, halfedges } = delaunay;
  const numPoints = points.length;
  const centroids: (Point | null)[] = new Array(numPoints).fill(null);
  const counts: number[] = new Array(numPoints).fill(0);
  const sums: { x: number; y: number }[] = [];

  for (let i = 0; i < numPoints; i++) {
    sums.push({ x: 0, y: 0 });
  }

  // Calculate circumcenters of triangles
  for (let t = 0; t < triangles.length; t += 3) {
    const p0 = triangles[t];
    const p1 = triangles[t + 1];
    const p2 = triangles[t + 2];

    const circumcenter = getCircumcenter(
      points[p0],
      points[p1],
      points[p2]
    );

    if (
      circumcenter.x >= 0 &&
      circumcenter.x <= config.width &&
      circumcenter.y >= 0 &&
      circumcenter.y <= config.height
    ) {
      for (const p of [p0, p1, p2]) {
        sums[p].x += circumcenter.x;
        sums[p].y += circumcenter.y;
        counts[p]++;
      }
    }
  }

  for (let i = 0; i < numPoints; i++) {
    if (counts[i] > 0) {
      centroids[i] = {
        x: Math.max(10, Math.min(config.width - 10, sums[i].x / counts[i])),
        y: Math.max(10, Math.min(config.height - 10, sums[i].y / counts[i])),
      };
    }
  }

  return centroids;
}

// Calculate circumcenter of a triangle
function getCircumcenter(a: Point, b: Point, c: Point): Point {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));

  if (Math.abs(d) < 1e-10) {
    return { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
  }

  const ux =
    ((a.x * a.x + a.y * a.y) * (b.y - c.y) +
      (b.x * b.x + b.y * b.y) * (c.y - a.y) +
      (c.x * c.x + c.y * c.y) * (a.y - b.y)) / d;
  const uy =
    ((a.x * a.x + a.y * a.y) * (c.x - b.x) +
      (b.x * b.x + b.y * b.y) * (a.x - c.x) +
      (c.x * c.x + c.y * c.y) * (b.x - a.x)) / d;

  return { x: ux, y: uy };
}

// Build the graph structure from Delaunay triangulation
export function buildGraph(config: MapConfig, random: Random): Graph {
  const points = generatePoints(config, random);
  const delaunay = Delaunator.from(points.map(p => [p.x, p.y]));
  const { triangles, halfedges } = delaunay;

  // Create centers (one per input point)
  const centers: Center[] = points.map((point, index) => ({
    index,
    point,
    ocean: false,
    water: false,
    coast: false,
    border: false,
    elevation: 0,
    moisture: 0,
    biome: 'OCEAN',
    neighbors: [],
    borders: [],
    corners: [],
  }));

  // Create corners (one per triangle circumcenter)
  const cornerMap = new Map<string, Corner>();
  const corners: Corner[] = [];

  function getCorner(p: Point): Corner {
    // Clamp to bounds
    const x = Math.max(0, Math.min(config.width, p.x));
    const y = Math.max(0, Math.min(config.height, p.y));
    const key = `${Math.round(x * 10)},${Math.round(y * 10)}`;

    if (!cornerMap.has(key)) {
      const corner: Corner = {
        index: corners.length,
        point: { x, y },
        ocean: false,
        water: false,
        coast: false,
        border: x <= 1 || x >= config.width - 1 || y <= 1 || y >= config.height - 1,
        elevation: 0,
        moisture: 0,
        touches: [],
        protrudes: [],
        adjacent: [],
        river: 0,
        downslope: null,
        watershed: null,
        watershedSize: 0,
      };
      corners.push(corner);
      cornerMap.set(key, corner);
    }
    return cornerMap.get(key)!;
  }

  // Create edges
  const edges: Edge[] = [];
  const edgeMap = new Map<string, Edge>();

  function getEdgeKey(i: number, j: number): string {
    return i < j ? `${i},${j}` : `${j},${i}`;
  }

  // Process triangles to build relationships
  for (let t = 0; t < triangles.length; t += 3) {
    const p0 = triangles[t];
    const p1 = triangles[t + 1];
    const p2 = triangles[t + 2];

    const circumcenter = getCircumcenter(
      points[p0],
      points[p1],
      points[p2]
    );
    const corner = getCorner(circumcenter);

    // Connect corner to centers
    for (const p of [p0, p1, p2]) {
      if (!corner.touches.includes(centers[p])) {
        corner.touches.push(centers[p]);
      }
      if (!centers[p].corners.includes(corner)) {
        centers[p].corners.push(corner);
      }
    }
  }

  // Build edges from halfedges
  for (let e = 0; e < halfedges.length; e++) {
    const opposite = halfedges[e];
    if (e < opposite || opposite === -1) {
      const t1 = Math.floor(e / 3);
      const t2 = opposite !== -1 ? Math.floor(opposite / 3) : -1;

      const p0 = triangles[e];
      const p1 = triangles[e % 3 === 2 ? e - 2 : e + 1];

      // Get corners (circumcenters of adjacent triangles)
      const corner1 = getCorner(
        getCircumcenter(
          points[triangles[t1 * 3]],
          points[triangles[t1 * 3 + 1]],
          points[triangles[t1 * 3 + 2]]
        )
      );

      let corner2: Corner | null = null;
      if (t2 !== -1) {
        corner2 = getCorner(
          getCircumcenter(
            points[triangles[t2 * 3]],
            points[triangles[t2 * 3 + 1]],
            points[triangles[t2 * 3 + 2]]
          )
        );
      }

      const edge: Edge = {
        index: edges.length,
        d0: centers[p0],
        d1: centers[p1],
        v0: corner1,
        v1: corner2,
        midpoint: corner2
          ? {
              x: (corner1.point.x + corner2.point.x) / 2,
              y: (corner1.point.y + corner2.point.y) / 2,
            }
          : null,
        river: 0,
      };
      edges.push(edge);

      // Connect centers as neighbors
      if (!centers[p0].neighbors.includes(centers[p1])) {
        centers[p0].neighbors.push(centers[p1]);
      }
      if (!centers[p1].neighbors.includes(centers[p0])) {
        centers[p1].neighbors.push(centers[p0]);
      }

      // Connect edges to centers
      centers[p0].borders.push(edge);
      centers[p1].borders.push(edge);

      // Connect edges to corners
      corner1.protrudes.push(edge);
      if (corner2) {
        corner2.protrudes.push(edge);

        // Connect adjacent corners
        if (!corner1.adjacent.includes(corner2)) {
          corner1.adjacent.push(corner2);
        }
        if (!corner2.adjacent.includes(corner1)) {
          corner2.adjacent.push(corner1);
        }
      }
    }
  }

  // Sort corners around each center for proper polygon rendering
  for (const center of centers) {
    sortCorners(center);
  }

  return { centers, corners, edges };
}

// Sort corners clockwise around center
function sortCorners(center: Center): void {
  const cx = center.point.x;
  const cy = center.point.y;

  center.corners.sort((a, b) => {
    const angleA = Math.atan2(a.point.y - cy, a.point.x - cx);
    const angleB = Math.atan2(b.point.y - cy, b.point.x - cx);
    return angleA - angleB;
  });
}

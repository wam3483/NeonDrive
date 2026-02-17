// Road network generator
// Creates a connected (fully traversable) graph of roads between towns
// Uses MST for guaranteed connectivity + extra short edges for variety
// Roads pathfind along the Voronoi center graph to follow terrain

import type { Center, Point } from './types';
import type { MapData } from './generator';
import type { Town } from './towns';
import { Random } from './random';

export interface Road {
  from: Town;
  to: Town;
  // Sequence of center points the road follows through the map
  path: Point[];
  // Total path length
  length: number;
}

export interface RoadNetwork {
  roads: Road[];
  // Adjacency list keyed by town id
  adjacency: Map<number, number[]>;
}

export function generateRoads(
  towns: Town[],
  mapData: MapData,
  seed: number
): RoadNetwork {
  if (towns.length < 2) {
    return { roads: [], adjacency: new Map() };
  }

  const random = new Random(seed + 9999);

  // Step 1: Build MST for guaranteed connectivity
  const mstEdges = buildMST(towns);

  // Step 2: Add extra edges (~30% of MST count) preferring short distances
  const extraEdges = addExtraEdges(towns, mstEdges, random);
  const allEdges = [...mstEdges, ...extraEdges];

  // Step 3: Pathfind each road edge along the center graph
  const roads: Road[] = [];
  const adjacency = new Map<number, number[]>();

  for (const town of towns) {
    adjacency.set(town.id, []);
  }

  for (const [i, j] of allEdges) {
    const townA = towns[i];
    const townB = towns[j];

    const path = findPath(townA.center, townB.center, mapData);
    if (path.length >= 2) {
      roads.push({
        from: townA,
        to: townB,
        path,
        length: pathLength(path),
      });
      adjacency.get(townA.id)!.push(townB.id);
      adjacency.get(townB.id)!.push(townA.id);
    }
  }

  return { roads, adjacency };
}

// --- helpers ---

function euclidean(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Prim's MST over town positions
function buildMST(towns: Town[]): [number, number][] {
  const n = towns.length;
  const edges: [number, number][] = [];
  const inMST = new Set<number>();
  const minCost = new Float64Array(n).fill(Infinity);
  const minEdge = new Int32Array(n).fill(-1);

  minCost[0] = 0;

  for (let iter = 0; iter < n; iter++) {
    // Pick cheapest vertex not yet in MST
    let u = -1;
    for (let v = 0; v < n; v++) {
      if (!inMST.has(v) && (u === -1 || minCost[v] < minCost[u])) {
        u = v;
      }
    }

    inMST.add(u);
    if (minEdge[u] !== -1) {
      edges.push([u, minEdge[u]]);
    }

    // Update costs from u to remaining vertices
    for (let v = 0; v < n; v++) {
      if (!inMST.has(v)) {
        const d = euclidean(towns[u].center.point, towns[v].center.point);
        if (d < minCost[v]) {
          minCost[v] = d;
          minEdge[v] = u;
        }
      }
    }
  }

  return edges;
}

// Add short non-MST edges for extra connectivity
function addExtraEdges(
  towns: Town[],
  mstEdges: [number, number][],
  random: Random
): [number, number][] {
  const n = towns.length;
  const existing = new Set(
    mstEdges.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`)
  );

  // All non-MST edges sorted by distance
  const candidates: { i: number; j: number; d: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!existing.has(`${i}-${j}`)) {
        candidates.push({
          i,
          j,
          d: euclidean(towns[i].center.point, towns[j].center.point),
        });
      }
    }
  }
  candidates.sort((a, b) => a.d - b.d);

  const maxExtras = Math.max(1, Math.floor(mstEdges.length * 0.3));
  const extras: [number, number][] = [];

  for (const c of candidates) {
    if (extras.length >= maxExtras) break;
    if (random.next() < 0.6) {
      extras.push([c.i, c.j]);
    }
  }

  return extras;
}

// A* pathfinding on the Center neighbor graph, avoiding water,
// with an elevation penalty so roads prefer low ground.
function findPath(start: Center, end: Center, mapData: MapData): Point[] {
  if (start === end) return [start.point];

  const openSet = new Set<number>([start.index]);
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();
  const fScore = new Map<number, number>();

  const centerByIndex = new Map<number, Center>();
  for (const c of mapData.centers) {
    centerByIndex.set(c.index, c);
  }

  gScore.set(start.index, 0);
  fScore.set(start.index, euclidean(start.point, end.point));

  while (openSet.size > 0) {
    // Cheapest node in open set
    let current = -1;
    let bestF = Infinity;
    for (const idx of openSet) {
      const f = fScore.get(idx) ?? Infinity;
      if (f < bestF) {
        bestF = f;
        current = idx;
      }
    }

    if (current === end.index) {
      // Reconstruct path
      const indices: number[] = [];
      let node: number | undefined = current;
      while (node !== undefined) {
        indices.unshift(node);
        node = cameFrom.get(node);
      }
      return indices.map((i) => centerByIndex.get(i)!.point);
    }

    openSet.delete(current);
    const cc = centerByIndex.get(current)!;

    for (const neighbor of cc.neighbors) {
      // Skip ocean / inland water (but allow coast — shoreline towns live there)
      if (neighbor.ocean) continue;
      if (neighbor.water && neighbor.index !== end.index && neighbor.index !== start.index) continue;

      // Cost: distance * (1 + elevation penalty)
      const moveCost =
        euclidean(cc.point, neighbor.point) * (1 + neighbor.elevation * 2);
      const tentativeG = (gScore.get(current) ?? Infinity) + moveCost;

      if (tentativeG < (gScore.get(neighbor.index) ?? Infinity)) {
        cameFrom.set(neighbor.index, current);
        gScore.set(neighbor.index, tentativeG);
        fScore.set(
          neighbor.index,
          tentativeG + euclidean(neighbor.point, end.point)
        );
        openSet.add(neighbor.index);
      }
    }
  }

  // Fallback: straight line (shouldn't happen on well-formed maps)
  return [start.point, end.point];
}

function pathLength(path: Point[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += euclidean(path[i - 1], path[i]);
  }
  return total;
}

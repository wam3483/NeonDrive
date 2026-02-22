# NeonDrive

A procedurally generated fantasy map explorer with a synthwave driving game. Every map is seeded and deterministic — terrain, rivers, towns, and roads emerge from a single number.

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm (or pnpm / yarn)

### Install and Run

```sh
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

To open the app automatically:

```sh
npm run dev -- --open
```

### Production Build

```sh
npm run build
npm run preview
```

### Routes

| Path | Description |
|------|-------------|
| `/` | Procedural fantasy map with controls |
| `/sunset` | Synthwave sunset scene |
| `/drivegame` | First-person driving simulation |

---

## Project Structure

```
src/
├── lib/
│   ├── map/              # Procedural map generation
│   │   ├── types.ts      # Core data structures (Center, Corner, Edge, Biome)
│   │   ├── random.ts     # Seeded PRNG and Simplex noise
│   │   ├── voronoi.ts    # Delaunay triangulation → Voronoi graph
│   │   ├── terrain.ts    # Elevation, water, rivers, moisture, biomes
│   │   ├── noisyEdges.ts # Polygon edge perturbation
│   │   ├── towns.ts      # Town placement system
│   │   ├── townNames.ts  # Procedural name generation
│   │   ├── roads.ts      # Road network (MST + A*)
│   │   ├── generator.ts  # Orchestrates the full generation pipeline
│   │   └── renderer.ts   # PixiJS map rendering and animation
│   │
│   ├── sunset/           # Synthwave sunset scene
│   │   ├── renderer.ts   # Sky, stars, mountains, clouds, road
│   │   └── road.ts       # Road rendering strategies (grid / realistic)
│   │
│   ├── drivegame/        # Driving simulation
│   │   └── renderer.ts   # Extends sunset renderer with car and input
│   │
│   └── components/       # Svelte UI components
│       ├── MapView.svelte
│       ├── SunsetView.svelte
│       └── DriveGameView.svelte
│
└── routes/               # SvelteKit pages
    ├── +page.svelte
    ├── sunset/+page.svelte
    ├── drivegame/+page.svelte
    └── +layout.svelte
```

---

## Architecture and Separation of Concerns

The project is split into three independent domains — **map generation**, **sunset rendering**, and **drive game** — each with its own rendering and logic layer. Shared infrastructure (randomness, noise) lives in `lib/map/random.ts` and is consumed by both the map and sunset systems.

### Map Domain

The map domain follows a strict layered architecture:

**Data (`types.ts`)** defines the graph model and is import-only — no logic.

**Infrastructure (`random.ts`)** provides a seeded PRNG and Simplex noise. Nothing else in the pipeline depends on global state; all randomness flows from a single seed.

**Graph construction (`voronoi.ts`)** turns a set of points into a topologically valid Delaunay/Voronoi graph of Centers, Corners, and Edges. It has no knowledge of terrain or biomes.

**Terrain assignment (`terrain.ts`)** annotates the graph with elevation, water, rivers, moisture, and biomes. It reads the graph structure but never modifies it — only the properties on nodes.

**Post-processing (`noisyEdges.ts`)** computes perturbed polygon outlines for visual variety. It is a pure transformation over edge data.

**Feature placement (`towns.ts`, `roads.ts`)** layers towns and road networks on top of the finished terrain. These modules are independent of each other and of rendering.

**Orchestration (`generator.ts`)** calls each stage in sequence and returns the finished map object. It contains no algorithms of its own — only the pipeline order.

**Rendering (`renderer.ts`)** consumes the finished map and drives PixiJS. It is the only module allowed to create display objects. Animation state lives here and nowhere else.

### Sunset Domain

`sunset/renderer.ts` is self-contained: it manages the PixiJS application, draws the sky/mountains/clouds/road, and runs the animation ticker. Road rendering strategy is extracted into `road.ts`, which provides two implementations (`GridRoadRenderer` and `RealisticRoadRenderer`) behind a common interface so the renderer never switches on style internally.

### Drive Game Domain

`drivegame/renderer.ts` extends the sunset renderer with a car model and keyboard input handler. The car's logical state (lane position, depth) is kept separate from its screen projection, which is computed each frame as a pure function of state.

### UI Layer

Svelte components in `lib/components/` own only presentation and user controls. They hold no generation logic — they pass seed/config values down to the renderer classes and receive events back up.

---

## Procedural Generation Algorithms

### Overview of the Pipeline

Map generation runs as a sequential, deterministic pipeline. Given the same seed and config, the output is always identical.

```
generatePoints()     →  random point cloud + Lloyd relaxation
buildGraph()         →  Delaunay triangulation → Voronoi dual graph
assignWater()        →  island shape via radial noise
assignElevation()    →  BFS from coast + sqrt redistribution
createRivers()       →  downslope tracing from mountain peaks
assignMoisture()     →  BFS from water sources + rivers
assignBiomes()       →  elevation × moisture lookup table
noisyEdges()         →  lateral edge perturbation
placeTowns()         →  multi-rule priority placement
buildRoads()         →  MST + extra edges + A* pathfinding
```

---

### 1. Voronoi Graph via Delaunay Triangulation

**File:** `voronoi.ts`

The map is represented as a dual graph of Voronoi polygons (Centers) and their shared edges and vertices (Corners). This structure gives each region natural-looking neighbors and clean topological relationships.

**Step 1 — Point distribution:**
Random seed points are generated inside the map bounds. Two iterations of **Lloyd relaxation** then move each point to the centroid of its Voronoi cell, evening out clustering and producing a more organic distribution.

**Step 2 — Triangulation:**
[Delaunator](https://github.com/mapbox/delaunator) computes the Delaunay triangulation of the relaxed points. Triangle circumcenters become the Corners of the Voronoi graph; seed points become the Centers.

**Step 3 — Graph construction:**
The halfedge structure of the triangulation is walked to build:
- `Center.neighbors` — adjacent polygons sharing an edge
- `Center.corners` — polygon vertices (sorted radially)
- `Corner.touches` — polygons meeting at this vertex
- `Corner.adjacent` — neighboring corners along edges

Corners near identical positions are deduplicated with a spatial tolerance to avoid floating-point duplicates.

---

### 2. Island Shape and Water Assignment

**File:** `terrain.ts` — `assignWater()`

Land and ocean are determined by a combination of **radial distance** from the map center and **2D Simplex noise** for coastline irregularity:

```
islandShape = (1 - distance) * islandFactor - 0.3 + noise * 0.4
isLand      = islandShape > 0.3
```

A flood-fill from the map border then distinguishes ocean (connected to the border) from inland lakes.

**Simplex noise** (`random.ts`) is layered using **Fractal Brownian Motion (FBM)** — four octaves at doubling frequencies and halving amplitudes — to produce naturalistic coastline roughness at multiple scales.

---

### 3. Elevation

**File:** `terrain.ts` — `assignElevation()`

Raw elevation is computed by **breadth-first search** from the coast and ocean outward. Each step inland increments elevation by 0.01, so distance from water is the primary driver of height.

The raw values are then **redistributed using a square-root curve**:

```
elevation[i] = sqrt(rank / landCorners.length)
```

This flattens the lowlands (most of the map) and steepens the mountains (a small fraction near the top), producing the characteristic profile of island terrain.

Centers receive the average elevation of their corners.

---

### 4. Rivers

**File:** `terrain.ts` — `createRivers()`

River sources are chosen randomly from high-elevation corners (above 0.3) that are not on the coast. From each source, the algorithm traces **downslope** — always moving to the neighboring corner with the lowest elevation — until reaching the ocean.

Each traversed edge accumulates a flow counter. Where rivers share a path, the counter increases, which the renderer uses to scale line width:

```
lineWidth = sqrt(flowCount) * 2
```

---

### 5. Moisture and Biomes

**File:** `terrain.ts` — `assignMoisture()`, `assignBiomes()`

**Moisture** spreads outward from water bodies and river edges using BFS. Each hop multiplies by 0.9, creating a smooth gradient away from water sources. River-adjacent corners start with moisture proportional to river flow. Values are normalized to [0, 1] across all land corners.

**Biomes** are assigned via a lookup table keyed by elevation band and moisture level, adapted from [Amit Patel's polygon map generation](http://www-cs-students.stanford.edu/~amitp/game-programming/polygon-map-generation/):

| Elevation | High Moisture | Mid Moisture | Low Moisture | Dry |
|-----------|--------------|--------------|--------------|-----|
| > 0.8 | SNOW | TUNDRA | BARE | SCORCHED |
| > 0.6 | TAIGA | SHRUBLAND | TEMPERATE_DESERT | — |
| > 0.3 | TEMP. RAIN FOREST | TEMP. DECIDUOUS | GRASSLAND | TEMP. DESERT |
| ≤ 0.3 | TROPICAL RAIN FOREST | TROPICAL SEASONAL | GRASSLAND | SUBTROPICAL DESERT |

Ocean, lake, beach, marsh, and ice are assigned based on water flags and elevation before the biome table is consulted.

---

### 6. Noisy Edges

**File:** `noisyEdges.ts`

Straight Voronoi edges look mechanical. Each land edge is perturbed by **lateral displacement within the quadrilateral** formed by the two Centers and two Corners it separates:

1. Compute the perpendicular direction across the edge.
2. Subdivide the edge into four segments.
3. Displace each intermediate point randomly along the perpendicular by `amplitude × perpendicularLength`, where amplitude is larger (0.04) at biome boundaries and smaller (0.02) within the same biome.

The output is a flat polygon vertex array ready for the renderer, and the perturbation is invisible to all other pipeline stages.

---

### 7. Town Placement

**File:** `towns.ts`

Towns are placed using a **multi-rule priority system** with configurable placement categories:

| Rule | Target | Priority |
|------|--------|----------|
| Shoreline | 30% of towns | 10 |
| River-adjacent | 25% | 8 |
| High elevation | 15% | 6 |
| Mid elevation | 20% | 4 |
| Inland | 10% | 2 |

**Pass 1** fulfills the minimum count for each rule in priority order. **Pass 2** fills remaining town slots by proportionally matching targets. All placements enforce a minimum distance between towns (default 40 units). Town names are generated procedurally using feature-aware prefix/suffix pools (e.g., shore towns get coastal-themed names, river towns get water-themed names).

---

### 8. Road Network

**File:** `roads.ts`

Roads connect towns through three stages:

**Stage 1 — Minimum Spanning Tree (Prim's algorithm):**
All towns are connected into a spanning tree, guaranteeing full connectivity with no isolated settlements.

**Stage 2 — Extra edges:**
Non-tree town pairs are sorted by distance. The shortest ~30% (accepted with 60% probability each) are added to create loops and shortcuts, making the network feel less skeletal.

**Stage 3 — A\* pathfinding on the Center graph:**
Each road segment is realized by finding a path through the map's Center graph. The cost function penalizes elevation change:

```
cost = distance × (1 + elevationDelta × 2)
```

Ocean cells are blocked. The resulting path follows valleys and avoids mountains, giving roads a natural routing that adapts to terrain.

---

### 9. Seeded Randomness

**File:** `random.ts`

All generation uses a **Mulberry32** PRNG seeded from the map's seed value. The same seed always produces the same map. The `Random` class wraps the generator with convenience methods (`float`, `int`, `shuffle`, `pick`) used throughout the pipeline. Simplex noise is also seeded, so island shapes and cloud placements are fully reproducible.

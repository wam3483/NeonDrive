# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm install        # Install dependencies
npm run dev        # Start dev server (http://localhost:5173)
npm run dev -- --open  # Open browser automatically
npm run build      # Production build
npm run preview    # Preview production build
npm run check      # Type check with svelte-check
npm run check:watch  # Type check with watch mode
```

## Architecture Overview

The project is organized into three independent domains with shared infrastructure:

1. **Map Generation** (`src/lib/map/`) — Procedural fantasy maps seeded from a single number
2. **Sunset Rendering** (`src/lib/sunset/`) — Synthwave sunset scene with animated elements
3. **Drive Game** (`src/lib/drivegame/`) — Driving simulation extending the sunset renderer
4. **Music Generation** (`src/lib/music/`) — Procedural synthwave music engine

All rendering uses PixiJS v8. UI components are Svelte 5.

## Map Generation Architecture

The map domain follows strict layered architecture. Each module has a single responsibility and data flows unidirectionally:

**Data Layer (`types.ts`)**
- Defines graph model: Center (polygon), Corner (vertex), Edge
- Import-only — no logic

**Infrastructure (`random.ts`)**
- Seeded PRNG (Mulberry32) and Simplex noise
- All randomness flows from a single seed — same seed = identical output

**Graph Construction (`voronoi.ts`)**
- Generates random points → Lloyd relaxation → Delaunay triangulation → Voronoi dual graph
- Pure topology — no terrain/biome knowledge

**Terrain Assignment (`terrain.ts`)**
- Assigns water, elevation, rivers, moisture, biomes to the graph
- Reads graph structure, never modifies it (only properties)

**Post-Processing (`noisyEdges.ts`)**
- Perturbs polygon edges for visual variety
- Pure transformation over edge data

**Feature Placement (`towns.ts`, `roads.ts`)**
- Towns use multi-rule priority system (shoreline, river, elevation targets)
- Roads use MST + A* pathfinding on Center graph

**Orchestration (`generator.ts`)**
- Calls each stage in sequence
- Contains no algorithms — only pipeline order

**Rendering (`renderer.ts`)**
- Only module allowed to create PixiJS display objects
- Animation state lives here and nowhere else

**Do not violate this separation.** Terrain logic should not know about roads; towns should not know about rendering.

## Sunset & Drive Game Architecture

`SunsetRenderer` is a self-contained PixiJS renderer managing sky, sun, mountains, clouds, and a scrolling road.

**Key Patterns:**
- `render()` clears and rebuilds the entire scene each frame for elements that need config updates
- Animated elements use `findByLabel()` to find their Graphics object and `clear()` + redraw
- `animationTime` accumulates via PixiJS ticker (`deltaTime * 0.02`)
- Scrolling uses `(animationTime * speed * 0.3) % 1.0` with quadratic distribution `t = rawT^2`
- Road rendering is stateless via strategy pattern: `RoadRenderer.render(g, ctx)` called each frame

`DriveGameRenderer extends SunsetRenderer` and adds:
- Car model with two styles (`classic` | `sport`)
- Closed-loop track with curvature-based vanishing point offset
- WASD keyboard input handling
- Polymorphic override of `buildRoadCtx()` to pass `curveOffset` to base class road rendering

**Critical rendering constraint:** When overriding methods, ensure base class rendering still receives updated context (e.g., `curveOffset` must reach `RoadRenderer.render()`).

## Road Rendering Math

Both grid and realistic road renderers use the same perspective model:

- Horizon is at `height * 0.55`
- Road spread = `width * 1.5`
- Road half-width at bottom = `width * 0.75` (this is `halfBottom`)
- Edge lines at `edgeFrac = (width * .75) / halfBottom = 1.0` (road edge)
- Guard rails at `railFrac = (width * .85) / halfBottom` (slightly outside road)

**Warning:** Guard rail positioning was tuned through painful multi-iteration. Be extremely cautious adjusting perspective math.

## Car Rendering Notes

**Classic Car** (JDM sedan, `260 * s` wide):
- Boxy, tall cabin, rectangular taillights
- `drawRectTaillight()` helper

**Sport Car** (Testarossa-style exotic, `320 * s` wide):
- Very low profile (`bodyH = 70 * s`)
- No rear wing
- 9-slot horizontal louver panel on rear deck
- 3 circular taillights per side (6 total), using `drawCircleTaillight()`
- Wide diffuser with 2 exhaust channels per side
- Body color: `0x141828` (dark blue-grey)

## Music Generation

The music engine generates synthwave/bossa-nova hybrid music using Web Audio API:

- Progressions defined in `theory.ts` (`PROGRESSIONS` object)
- `electronicMix` blends acoustic patterns (bossa clave) with electronic (four-on-the-floor)
- `seed` (0–999) deterministically generates all variation patterns
- Voices: bass, pad, drums (kick, snare, hi-hat), arpeggiator, lead
- All patterns are 16-step arrays with velocity 0–1

## Palettes

Available: `'auto' | 'ember' | 'dusk' | 'amber' | 'neon' | 'terra'`

DriveGameView defaults to `'terra'`. SunsetView defaults to `'auto'` (randomly selected per seed).

## Routes

| Path | Component | Renderer |
|------|-----------|----------|
| `/` | `MapView.svelte` | `MapRenderer` |
| `/sunset` | `SunsetView.svelte` | `SunsetRenderer` |
| `/drivegame` | `DriveGameView.svelte` | `DriveGameRenderer` |
| `/music` | `MusicView.svelte` | `MusicEngine` |

## User Preferences

- Be direct and concise in communication
- Do NOT make unnecessary changes beyond what's requested
- Guard rail positioning required painful multi-iteration tuning — avoid perspective math changes without testing

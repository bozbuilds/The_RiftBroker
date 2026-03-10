# Real Galaxy Star Map

**Date:** 2026-03-09
**Status:** Ready for planning

## What We're Building

Replace the 20 hardcoded demo systems with real EVE Frontier stellar cartography data (~24K systems). The map should feel like the actual Frontier universe — vast, spatially accurate, and alive — while remaining performant in our Three.js/R3F scene.

## Why This Matters

The current map has 20 invented systems across 6 arbitrary regions. It doesn't represent the Frontier universe. EVE Frontier has ~24,000 solar systems, most of which are physically disconnected (no stargate web like EVE Online). Players navigate via player-deployed Smart Gates, creating an organic, sparse connectivity graph. The map should reflect this unique topology.

## Key Decisions

### 1. Data Source: Extract from local game client

EVE Frontier is installed locally. Use community extraction tools to get the real stellar cartography:

- **Primary:** [frontier-reapers/frontier-static-data](https://github.com/frontier-reapers/frontier-static-data) — Python, exports `starmapcache.pickle` to JSON from `ResFiles/`
- **Alternative:** [VULTUR-EveFrontier/eve-frontier-tools](https://github.com/VULTUR-EveFrontier/eve-frontier-tools) — Node/Python pipeline, produces `stellar_cartography.json`, `stellar_systems.json`, `stellar_regions.json`

Both require the game client's `ResFiles/` directory. Output is JSON with system coordinates, IDs, names, and hierarchy.

### 2. Rendering: Two-tier hybrid

| Layer | Count | Rendering | Interactivity |
|-------|-------|-----------|---------------|
| **Background particles** | All ~24K | Instanced points at real 3D positions. Tiny, dim, no labels. Gives galaxy shape and density. | None (visual only) |
| **Interactive systems** | ~100-500 | Full `SystemDot` with labels, glow, bloom. Only systems with active intel listings or that are region anchors. | Click to view, region wireframes |

This avoids rendering 24K interactive meshes while still showing the full galaxy structure.

### 3. Regions: Hybrid SDE labels + spatial density

- Use EVE Online SDE region/constellation names as labels (the geographic groupings still reflect the galactic structure even though Frontier's connectivity differs)
- Visually cluster by spatial density — wireframe zones highlight areas where systems are dense enough to matter
- Frontier-specific: most systems are disconnected islands, so regions are geographic groupings, not connectivity-based

### 4. Data Pipeline: Fetch at runtime

- Host the processed JSON on a CDN or Walrus
- Fetch on app load (keeps bundle small, easy to update without rebuilding)
- Process into the `StarSystem` interface client-side
- Extraction is a manual step (re-run when game updates)

## Data Schema (Expected)

Based on research, the extracted JSON likely contains per-system:

```typescript
interface RawStellarSystem {
  solarSystemID: number    // e.g., 30004759
  name: string             // e.g., "G-M4GK"
  position: {
    x: number              // 3D coordinate (light-years from cluster center)
    y: number
    z: number
  }
  constellationID?: number
  regionID?: number
  regionName?: string
  security?: number        // Security status (-1.0 to 1.0)
}
```

Exact schema TBD after extraction — the first step of planning should be running the extraction and inspecting the output.

## Architecture Impact

### What changes:
- `lib/systems.ts` — Replace `DEMO_SYSTEMS` with a loader that fetches + parses the hosted JSON
- `StarMapScene` — Add instanced particle layer for background systems
- `RegionZone` — Compute convex hulls from real positions, use SDE region names
- `lib/region-data.ts` — Update `aggregateByRegion` to work with real region assignments
- Coordinate mapping — Replace SVG-space (0-1000) with real 3D coordinates (will need normalization)

### What stays the same:
- Intel listings still reference `system_id: u64` — just needs a lookup into the real system data
- Heat map aggregation logic is system-agnostic
- Purchase/decrypt flows untouched
- Seed script would reference real system IDs

## Open Questions

1. **Exact JSON schema** — Need to run extraction and inspect the output before planning implementation
2. **Coordinate scale** — EVE coordinates are in meters (huge numbers). Need to determine normalization factor for Three.js scene.
3. **Region boundaries** — How many SDE regions exist in Frontier's subset? Are they all populated?
4. **Hosting** — CDN vs Walrus for the system data JSON. Walrus aligns with the project's decentralized ethos but adds blob-expiry concerns.
5. **Smart Gate overlay** — Future enhancement: show player-deployed gate connections as edges. Requires on-chain data from the EVE Frontier world API.

## Research Sources

- [frontier-reapers/frontier-static-data](https://github.com/frontier-reapers/frontier-static-data) — Python extraction from game files
- [VULTUR-EveFrontier/eve-frontier-tools](https://github.com/VULTUR-EveFrontier/eve-frontier-tools) — Node/Python extraction pipeline
- [ef-map.com](https://ef-map.com) — Reference implementation (24K+ systems, WebGL, in-browser SQLite)
- [EVE Online SDE](https://developers.eveonline.com/docs/services/static-data/) — Public static data with `mapSolarSystems`
- [beaukode/evedatacore-route-planner](https://github.com/beaukode/evedatacore-route-planner) — Rust route planner using extracted starmap data

## Next Steps

1. Extract stellar data from local EVE Frontier install using `frontier-static-data`
2. Inspect the JSON output to confirm schema and system count
3. Run `/workflows:plan` to design the implementation

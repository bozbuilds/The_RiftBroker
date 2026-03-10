---
title: "feat: Real Galaxy Star Map"
type: feat
date: 2026-03-09
---

# Real Galaxy Star Map

## Overview

Replace the 20 hardcoded demo systems with ~24K real EVE Frontier stellar cartography data. The map should feel like the actual Frontier universe — vast, spatially accurate, and alive — while remaining performant. Two-tier rendering: instanced background particles for all systems, interactive `SystemDot` components only for intel-active systems.

## Problem Statement

The current star map has 20 invented systems across 6 arbitrary regions. It doesn't represent the Frontier universe. EVE Frontier has ~24,000 solar systems with unique topology (mostly disconnected, no stargate web). The map should reflect this.

## Proposed Solution

### Architecture: Two-Tier Rendering

| Layer | Count | Rendering | Interactivity |
|-------|-------|-----------|---------------|
| **Background particles** | All ~24K | `<Points>` with `Float32Array` position buffer | None (visual ambiance) |
| **Interactive systems** | ~100-500 | `SystemDot` components (existing) | Click, hover, labels, glow |

### Data Pipeline

```
Game Client → Extraction Tool → JSON → CDN → App Fetch → Parse → Render
     (manual, offline)                              (runtime)
```

## Technical Approach

### Phase 0: Data Extraction & Inspection

**Goal:** Get the real system data and confirm schema, count, and coordinate ranges.

#### Step 0.1: Extract stellar cartography

Run [frontier-reapers/frontier-static-data](https://github.com/frontier-reapers/frontier-static-data) against the local EVE Frontier `ResFiles/` directory. Produces JSON with system positions, IDs, names, and hierarchy.

- Clone the repo, install Python dependencies
- Point at the game client's `ResFiles/` directory
- Run the extraction script
- Inspect the output: field names, value types, coordinate ranges, region data

#### Step 0.2: Analyze the data

With the extracted JSON in hand:

- [ ] Confirm the exact schema (field names, types)
- [ ] Count unique systems, regions, constellations
- [ ] Find coordinate min/max on each axis (needed for normalization)
- [ ] Measure JSON file size (raw + gzipped)
- [ ] Verify whether demo system IDs (e.g., `30004759`) exist in real data
- [ ] Decide: strip non-essential fields to reduce payload size

#### Step 0.3: Host the JSON

- [ ] Trim JSON to essential fields: `solarSystemID`, `name`, `x`, `y`, `z`, `regionID`, `regionName`
- [ ] Host on CDN (GitHub Pages raw URL, Cloudflare R2, or similar)
- [ ] Verify fetch works from browser with CORS headers
- [ ] Estimate: ~24K systems × ~80 bytes/system = ~2MB raw, ~300KB gzipped

**Output:** A publicly accessible URL returning the galaxy JSON.

**Why CDN over Walrus:** Walrus blob expiry creates maintenance burden. CDN is reliable, fast, and free for static files. Can migrate to Walrus later if desired.

---

### Phase 1: Galaxy Data Loader

**Goal:** Replace synchronous `DEMO_SYSTEMS` with an async loader that fetches, parses, and distributes galaxy data.

#### Step 1.1: Define types

**Modify:** `src/lib/types.ts`

```typescript
/** Raw system from the galaxy JSON (post-extraction) */
export interface RawStellarSystem {
  solarSystemID: number
  name: string
  x: number
  y: number
  z: number
  regionID: number
  regionName: string
}

/** Normalized system for the app (scene-space coordinates) */
export interface GalaxySystem {
  id: bigint
  name: string
  x: number        // normalized to scene scale
  y: number
  z: number
  region: string
  regionId: number
}
```

The existing `StarSystem` interface (with SVG-space `x`, `y`, `z` and `region`) remains for backward compatibility during migration but is eventually replaced by `GalaxySystem`.

#### Step 1.2: Galaxy data module

**Create:** `src/lib/galaxy-data.ts`

Core responsibilities:
- Fetch JSON from CDN URL
- Parse into `GalaxySystem[]`
- Normalize coordinates from EVE meters to scene scale (-50..+50)
- Build derived structures: `systemMap` (ID → system), `regionMap` (name → system[]), `regionSystemCounts`
- Export a `loadGalaxyData()` function returning a promise

```typescript
const GALAXY_JSON_URL = 'https://...'  // CDN URL from Phase 0

interface GalaxyData {
  systems: GalaxySystem[]
  systemMap: Map<bigint, GalaxySystem>
  regionMap: Map<string, GalaxySystem[]>
  regionSystemCounts: Map<string, number>
}

export async function loadGalaxyData(): Promise<GalaxyData> { ... }
```

**Coordinate normalization strategy:**

```typescript
function normalizeCoordinates(raw: RawStellarSystem[]): { x: number; y: number; z: number }[] {
  // Find bounding box
  // Compute center and max half-range (preserving aspect ratio)
  // Map to [-50, +50] using the largest axis as reference
  // Y axis may be thinner (EVE galaxy is disc-shaped) — that's correct
}
```

Use a single scale factor derived from the largest axis span. This preserves the galaxy's natural disc shape rather than stretching it to fill a cube.

#### Step 1.3: React context provider

**Create:** `src/providers/GalaxyDataProvider.tsx`

```typescript
const GalaxyDataContext = createContext<GalaxyData | null>(null)

export function GalaxyDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<GalaxyData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadGalaxyData().then(setData).catch(e => setError(e.message))
  }, [])

  return (
    <GalaxyDataContext.Provider value={data}>
      {error && <div className="status-message status-error">Failed to load galaxy data: {error}</div>}
      {children}
    </GalaxyDataContext.Provider>
  )
}

export function useGalaxyData(): GalaxyData | null {
  return useContext(GalaxyDataContext)
}
```

**Non-blocking loading pattern:** The provider passes `null` to context while fetching. The 3D scene renders its shell immediately (StarField, HoloGrid, OrbitControls) — the ambient environment is fully interactive while data arrives. Only `GalaxyParticles` and `SystemDots` gate on the data being non-null. Listing browser, create form, and My Intel tab show a compact HUD-style "Fetching galaxy data..." indicator in place of their system-dependent content rather than blocking the whole viewport.

```tsx
// StarMapScene.tsx — show shell immediately, particles when ready
function StarMapScene() {
  const galaxyData = useGalaxyData()
  return (
    <>
      <StarField />
      <HoloGrid />
      {!galaxyData && <HUDLoadingIndicator message="Fetching galaxy data..." />}
      {galaxyData && <GalaxyParticles systems={galaxyData.systems} />}
      {galaxyData && interactiveSystems.map(...)}
    </>
  )
}
```

#### Step 1.4: Migrate consumers

**Modify:** `src/App.tsx` — Wrap content in `<GalaxyDataProvider>`

**Modify:** `src/lib/systems.ts` — Keep `obfuscatedLocation` as a thin wrapper. It takes a `GalaxyData` reference (or is replaced by a hook). The existing function signature `(systemId: bigint) => string` can't work with async data, so:

Option A (preferred): Convert `obfuscatedLocation` to accept the `systemMap` and `regionSystemCounts` as parameters:
```typescript
export function obfuscatedLocation(
  systemId: bigint,
  systemMap: Map<bigint, GalaxySystem>,
  regionSystemCounts: Map<string, number>,
): string { ... }
```

Option B: Create a `useObfuscatedLocation(systemId)` hook.

Option A is simpler — it's a pure function that receives its dependencies explicitly. Callers already have access to galaxy data via `useGalaxyData()`.

**Files to update (8 total):**

| File | Current import | New approach |
|------|---------------|--------------|
| `App.tsx` | `DEMO_SYSTEMS` | `useGalaxyData()` for systems list |
| `CreateListing.tsx` | `DEMO_SYSTEMS` | `useGalaxyData()` + searchable selector (Phase 4) |
| `ListingBrowser.tsx` | `obfuscatedLocation` | `obfuscatedLocation(id, systemMap, regionCounts)` |
| `MyIntel.tsx` | `obfuscatedLocation` | Same as above |
| `RegionPanel.tsx` | `obfuscatedLocation` | Same as above |
| `HeatMap.tsx` | `DEMO_SYSTEMS`, `SYSTEM_MAP` | `useGalaxyData()` (SVG fallback — see Phase 5) |
| `seed-data.test.ts` | `SYSTEM_MAP` | Use test fixture data |
| `systems.test.ts` | Direct imports | Test `galaxy-data.ts` with mock fetch |

#### Step 1.5: Tests

**Modify:** `src/lib/systems.test.ts` → Rename to `src/lib/galaxy-data.test.ts`

- Test coordinate normalization (preserves aspect ratio, output in [-50, 50])
- Test `loadGalaxyData` with mocked fetch (happy path, 404 error, corrupt JSON)
- Test `obfuscatedLocation` with the new signature
- Test `regionSystemCounts` derivation
- Test system lookup by ID

**Modify:** `src/scripts/seed-data.test.ts` — Use a small fixture of real system IDs (verified in Phase 0)

---

### Phase 2: Instanced Background Particles

**Goal:** Render ~24K systems as a performant instanced point cloud.

#### Step 2.1: Background particle component

**Create:** `src/components/star-map/GalaxyParticles.tsx`

```typescript
export function GalaxyParticles({ systems }: { systems: GalaxySystem[] }) {
  const positions = useMemo(() => {
    const arr = new Float32Array(systems.length * 3)
    for (let i = 0; i < systems.length; i++) {
      arr[i * 3] = systems[i].x
      arr[i * 3 + 1] = systems[i].y
      arr[i * 3 + 2] = systems[i].z
    }
    return arr
  }, [systems])

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={systems.length}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.15}
        color="#334155"
        transparent
        opacity={0.4}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}
```

**Design choices:**
- **Two particle tiers** — Split into "core" and "frontier" buckets based on region density. Render two `<points>` elements: core systems slightly brighter/larger to give the galaxy visual depth without any interactivity cost
- **Color `#0f2a4a` / `#1a3a5c`** — Deep blue-navy rather than slate-gray; reads as cold, vast space rather than noise dust. Matches the cyan holographic theme without competing with it
- **Core tier:** `size={0.2}`, `opacity={0.5}` — visibly present but still dim
- **Frontier tier:** `size={0.12}`, `opacity={0.25}` — barely there; galaxy shape only
- **`depthWrite={false}`** — Prevents z-fighting with other transparent elements
- **`sizeAttenuation`** — Points shrink with distance, giving depth perception
- **No bloom** — The bloom threshold (0.6) is high enough that these dim particles won't trigger it

```tsx
// Two-tier particle split (no extra render pass — just two <points>)
const { core, frontier } = useMemo(() => {
  const core: GalaxySystem[] = []
  const frontier: GalaxySystem[] = []
  for (const s of systems)
    (regionSystemCounts.get(s.region) ?? 0) > CORE_THRESHOLD ? core.push(s) : frontier.push(s)
  return { core, frontier }
}, [systems, regionSystemCounts])
```

#### Step 2.2: Integrate into StarMapScene

**Modify:** `src/components/star-map/StarMapScene.tsx`

```typescript
// Inside the Canvas, before SystemDots:
<GalaxyParticles systems={galaxyData.systems} />
```

The background particles render before interactive dots so dots appear "on top" visually.

#### Step 2.3: Filter interactive systems

**Modify:** `StarMapScene.tsx` — Instead of rendering a `SystemDot` for every system, only render for systems that have heat map data (intel listings):

```typescript
const interactiveSystems = useMemo(() => {
  // Systems that have at least one listing in the heat map
  return galaxyData.systems.filter(s =>
    systemHeatMap.has(s.id.toString())
  )
}, [galaxyData.systems, systemHeatMap])
```

This drops the count from ~24K to however many systems have active intel (~100-500 in practice).

**Behavior change:** Systems with zero listings are no longer visible as gray dots — they become part of the dim particle cloud. This is intentional and matches the brainstorm decision.

#### Step 2.4: SystemDot visual separation from particle cloud

With a dense particle background, `SystemDot` spheres risk blending in — especially stale ones with near-zero emissive intensity. Two adjustments:

- **Emissive floor:** Raise the minimum emissive intensity so even stale systems clearly read above the background. Current: `0.5 + 1.5 × freshness` can approach 0.5 for old listings. New floor: `0.8` minimum.
- **Targeting ring:** Add a thin wireframe ring around each dot for instant visual separation:
  ```tsx
  <mesh rotation={[Math.PI / 2, 0, 0]}>
    <ringGeometry args={[radius + 0.15, radius + 0.25, 24]} />
    <meshBasicMaterial color={color} transparent opacity={0.5} />
  </mesh>
  ```

#### Step 2.5: Camera first-load orientation

With 24K systems spread across a real galaxy, the default camera position (`[0, 60, 60]`) may land far from any intel activity. On first load, compute the centroid of intel-active systems and orient the camera toward it:

```tsx
useEffect(() => {
  if (!interactiveSystems.length) return
  const cx = interactiveSystems.reduce((s, sys) => s + sys.x, 0) / interactiveSystems.length
  const cz = interactiveSystems.reduce((s, sys) => s + sys.z, 0) / interactiveSystems.length
  camera.position.set(cx, 60, cz + 60)
  controls.target.set(cx, 0, cz)
  controls.update()
}, [/* run once after interactiveSystems first populates */])
```

#### Step 2.6: Mobile performance guard

24K instanced points + Bloom post-processing may drop mobile to ~20fps. Add a device tier check and skip background particles on low-end devices:

```tsx
const isLowEnd = navigator.hardwareConcurrency <= 4
// GalaxyParticles only rendered on capable devices
{!isLowEnd && <GalaxyParticles systems={galaxyData.systems} />}
```

The interactive SystemDots are preserved on all devices — background particles are purely decorative.

---

### Phase 3: Region Zones with Real Data

**Goal:** Compute region boundaries from real system positions.

#### Step 3.1: Update region aggregation

**Modify:** `src/lib/region-data.ts`

- Remove `svgTo3D()` — coordinates are already in scene space after normalization
- `aggregateByRegion()` receives `GalaxySystem[]` instead of `StarSystem[]`
- Convex hull computed from `(system.x, system.z)` directly (no SVG conversion)
- Region names come from `system.region` (SDE region name)

```typescript
export function aggregateByRegion(
  systems: GalaxySystem[],
  heatMap: Map<string, SystemHeatData>,
): RegionHeatData[] {
  // Group by region name
  // Only include regions that have at least one system with intel
  // Compute hull from the intel-active systems in the region (not all systems)
  // ...
}
```

**Key decision:** Convex hull is computed from **intel-active systems only** within each region, not from all ~24K systems. This prevents hulls from spanning the entire galaxy and keeps them focused on where intel exists.

**Minimum hull fallback:** A convex hull requires at least 3 non-collinear points. A region with 1-2 active systems produces a degenerate hull (dot or line). When `hullPoints.length < 3`, skip the wireframe and render a billboard label with a small circle glyph instead:

```tsx
// RegionZone.tsx
if (region.hullPoints.length < 3) {
  return <RegionLabel position={centroid} name={region.name} count={region.listingCount} />
}
```

**Reduced motion:** The pulse animation (`sin(clock.elapsedTime × 2)`) must respect `prefers-reduced-motion`:

```tsx
const prefersReduced = useMemo(
  () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  [],
)
const opacity = (!prefersReduced && freshness > 0.5)
  ? 0.3 + 0.2 * Math.sin(clock.elapsedTime * 2)
  : 0.35
```

#### Step 3.2: Update RegionZone component

**Modify:** `src/components/star-map/RegionZone.tsx`

- Remove `svgTo3D` calls — hull points are already in scene coordinates
- No other changes needed (the component is data-agnostic)

#### Step 3.3: Update region-data tests

**Modify:** `src/lib/region-data.test.ts`

- Replace SVG-space test coordinates with scene-space coordinates
- Remove `svgTo3D` test cases
- Add test: regions with no intel-active systems produce no hull

---

### Phase 4: CreateListing System Selector

**Goal:** Replace the `<select>` dropdown (20 systems) with a searchable typeahead that handles ~24K systems.

#### Step 4.1: Searchable system picker

**Create:** `src/components/SystemPicker.tsx`

A lightweight typeahead component:
- Text input with debounced filtering
- Filters `GalaxySystem[]` by name (case-insensitive substring match)
- Shows top 20 matches in a dropdown
- Each option: system name + region name
- On select: sets the `systemId` value
- Grouped by region in results

```typescript
interface SystemPickerProps {
  systems: GalaxySystem[]
  value: bigint | null
  onChange: (systemId: bigint) => void
}
```

**No external dependencies** — a simple controlled input + filtered list. No need for a combobox library for this.

**Required UX details:**

- **Substring highlight** — Bold the matching portion of each result label. e.g., searching "G-M4" renders `<strong>G-M4</strong>GK` in the dropdown
- **Secondary region label** — Each row shows system name (primary weight) + region name (dim, secondary). e.g., `G-M4GK · Delve`
- **Keyboard navigation** — Arrow Up/Down moves through results, Enter selects, Escape closes and clears input. Without this the picker is unusable for power users
- **Outside-click dismiss** — `mousedown` listener on `document` closes the dropdown
- **Empty state** — When input has text but no matches: "No systems found" (not a blank dropdown)
- **Debounce** — 150ms debounce on filtering to avoid thrashing with 24K systems on each keystroke

#### Step 4.2: Wire into CreateListing

**Modify:** `src/components/CreateListing.tsx`

- Replace `<select>` + `<optgroup>` with `<SystemPicker>`
- Route intel type: replace origin/destination `<select>` elements with `<SystemPicker>` too
- Validate selected system ID exists in galaxy data before form submission

---

### Phase 5: SVG Heat Map Fallback

**Goal:** Keep the SVG fallback functional at scale.

**Modify:** `src/components/heat-map/HeatMap.tsx`

- Only render `SystemNode` for intel-active systems (same filter as Phase 2.3)
- Use galaxy data coordinates projected to 2D (x, z → SVG viewport)
- This keeps the SVG element count at ~100-500 (manageable) instead of 24K

---

### Phase 6: Camera & Scene Tuning

**Goal:** Ensure the camera, grid, and controls work with the real galaxy bounding box.

#### Step 6.1: Derive scene bounds from data

After normalization, the galaxy fits within [-50, +50] on the widest axis. The thinner axes may be smaller (disc-shaped galaxy). Camera settings should be adjusted:

- **Camera position:** May need to zoom out if the disc is wider than expected
- **`maxDistance`:** Increase if the galaxy spans a larger visual volume
- **HoloGrid:** Scale `args` to match galaxy extent

These are tuning values determined after seeing the real data in the scene.

#### Step 6.2: Keep StarField

The ambient `StarField` (1500 decorative particles at radius 200) stays. It occupies the skybox sphere, well outside the galaxy particle volume. No conflict.

---

## Acceptance Criteria

### Functional

- [ ] ~24K real EVE Frontier systems rendered as background particles (two-tier: core/frontier brightness)
- [ ] Only intel-active systems rendered as interactive `SystemDot` components
- [ ] Region zones use real SDE region names and spatial boundaries
- [ ] Regions with < 3 active systems show label glyph instead of hull wireframe
- [ ] `obfuscatedLocation` works with real region data
- [ ] CreateListing has a searchable system picker with keyboard nav, substring highlight, outside-click dismiss
- [ ] Galaxy data fetched at runtime from CDN (not bundled)
- [ ] 3D scene shell renders immediately; galaxy particles appear after fetch (non-blocking loading)
- [ ] Error banner shown in HUD if galaxy fetch fails
- [ ] SVG fallback renders only intel-active systems (not all 24K)
- [ ] Camera auto-orients toward intel-active centroid on first load
- [ ] Pulse animation respects `prefers-reduced-motion`

### Performance

- [ ] 60fps on mid-range hardware with 24K background particles
- [ ] Galaxy JSON < 3MB raw, < 500KB gzipped
- [ ] Background particles skipped on low-end devices (`hardwareConcurrency <= 4`)
- [ ] Initial load: galaxy data fetched in parallel with other app initialization

### Testing

- [ ] Galaxy data loader: fetch, parse, normalize, error handling
- [ ] Coordinate normalization: preserves aspect ratio, output range
- [ ] `obfuscatedLocation` with new signature
- [ ] Region aggregation with real coordinate space
- [ ] All existing tests pass or are updated

## Files Summary

| File | Action | Phase |
|------|--------|-------|
| `src/lib/types.ts` | Add `RawStellarSystem`, `GalaxySystem` | 1 |
| `src/lib/galaxy-data.ts` | **Create** — async loader, normalization | 1 |
| `src/lib/galaxy-data.test.ts` | **Create** — loader + normalization tests | 1 |
| `src/providers/GalaxyDataProvider.tsx` | **Create** — React context + loading gate | 1 |
| `src/lib/systems.ts` | Refactor `obfuscatedLocation` signature | 1 |
| `src/lib/systems.test.ts` | Update for new signature | 1 |
| `src/App.tsx` | Wrap in `GalaxyDataProvider`, use context | 1 |
| `src/components/ListingBrowser.tsx` | Pass galaxy data to `obfuscatedLocation` | 1 |
| `src/components/MyIntel.tsx` | Same | 1 |
| `src/components/RegionPanel.tsx` | Same | 1 |
| `src/components/star-map/GalaxyParticles.tsx` | **Create** — two-tier instanced point cloud | 2 |
| `src/components/star-map/StarMapScene.tsx` | Add particles, filter interactive systems, camera centroid, mobile guard | 2 |
| `src/lib/region-data.ts` | Remove `svgTo3D`, use scene coords | 3 |
| `src/lib/region-data.test.ts` | Update coordinate space | 3 |
| `src/components/star-map/RegionZone.tsx` | Remove `svgTo3D`, add hull fallback, reduced-motion | 3 |
| `src/components/SystemPicker.tsx` | **Create** — searchable typeahead | 4 |
| `src/components/CreateListing.tsx` | Replace `<select>` with `SystemPicker` | 4 |
| `src/components/heat-map/HeatMap.tsx` | Filter to intel-active systems only | 5 |
| `src/scripts/seed-data.test.ts` | Use real system IDs | 1 |

## Dependencies & Risks

### Prerequisites
- **EVE Frontier installed locally** — needed for data extraction
- **Extraction tool working** — community-maintained, may need fixes

### Risks
- **Schema mismatch** — Extraction tool output may differ from expected schema. Mitigated by Phase 0 inspection.
- **Demo system IDs orphaned** — Existing testnet listings may reference non-existent system IDs. Acceptable on testnet.
- **Large region hulls** — Real regions may have hundreds of systems, creating very large convex hulls that overlap. Mitigated by computing hulls only from intel-active systems.
- **Mobile performance** — 24K instanced points should be fine, but untested. Mitigated by `sizeAttenuation` and `depthWrite={false}`.

## Open Questions (Resolved in Phase 0)

1. ~~Exact JSON schema~~ → Inspect extraction output
2. ~~Coordinate scale~~ → Min-max normalize to [-50, +50]
3. ~~Region count~~ → Count unique `regionName` values
4. ~~Hosting~~ → CDN (simple, reliable, free)
5. ~~JSON size~~ → Measure after extraction

## References

- [Brainstorm: Real Galaxy Star Map](../brainstorms/2026-03-09-real-galaxy-star-map-brainstorm.md)
- [frontier-reapers/frontier-static-data](https://github.com/frontier-reapers/frontier-static-data) — Python extraction tool
- [ef-map.com](https://ef-map.com) — Reference implementation (24K+ systems, WebGL)
- Current star map: `src/components/star-map/StarMapScene.tsx`
- Current systems: `src/lib/systems.ts` (20 demo systems)

## Verification

- `pnpm test` — all tests pass (updated + new)
- `pnpm build` — clean TypeScript build
- Star map shows galaxy particle cloud on load
- Intel-active systems highlighted as interactive dots
- Region wireframes appear around clusters with intel
- CreateListing system picker searches ~24K systems
- `obfuscatedLocation` shows real region names in listing cards
- Camera, orbit controls, bloom all work at the new scale

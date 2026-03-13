# Intel Nebula — Canvas Texture Heat Cloud

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace SystemDot spheres/rings and RegionZone wireframes with a single-plane canvas-textured nebula cloud. Dense intel regions produce brighter, more saturated glow. Filter bar controls which intel types appear (changing both visual and tooltip counts).

**Brainstorm:** `docs/brainstorms/2026-03-13-intel-nebula-brainstorm.md` (Approach B chosen)

**Architecture:**
- New `IntelNebula` component: renders a `<mesh><planeGeometry>` on the XZ plane with a `CanvasTexture`
- Pure function `renderNebulaTexture(canvas, systems, galaxySystems, colorMap)` draws radial gradients with `globalCompositeOperation: 'screen'` — testable without Three.js
- `RegionZone` stripped to invisible hit area only (no wireframe, no fill visual)
- `SystemDot` removed entirely (all visuals live in the nebula texture)
- `App.tsx` passes `filteredRegionData` so tooltip counts match the active filter

**Tech Stack:** TypeScript, React Three Fiber, Canvas 2D API, Vitest

---

## Data Flow (Current → New)

```
useHeatMapData()
  ├── allSystems ──→ aggregateByRegion() ──→ regionData     (click targets, ALL tooltip)
  └── systems    ──→ [NEW] aggregateByRegion() ──→ filteredRegionData (filtered tooltip)
                 ──→ StarMapScene.systemHeats ──→ [NEW] IntelNebula (draws the glow)
                                               ──→ [REMOVED] SystemDot
                                               ──→ RegionZone (invisible hit area only)
```

---

### Task 1: Pure `renderNebulaTexture` Function (TDD)

**Files:**
- Create: `frontend/src/lib/nebula-texture.ts`
- Create: `frontend/src/lib/nebula-texture.test.ts`

The core rendering logic, extracted so it's testable without Three.js or React.

**Interface:**

```typescript
export interface NebulaPoint {
  /** Scene-space X coordinate [-50, +50] */
  x: number
  /** Scene-space Z coordinate [-50, +50] */
  z: number
  /** Number of listings at this point — drives gradient radius */
  listingCount: number
  /** Neon hex color for this point's intel type */
  color: string
}

/**
 * Draw radial gradient blobs onto a canvas, screen-composited.
 * Each point becomes a soft-edged circle whose radius scales with listingCount.
 * Multiple overlapping blobs merge into an amorphous cloud.
 *
 * @param canvas  - Pre-sized HTMLCanvasElement (e.g. 512×512)
 * @param points  - Intel-active systems with scene coords + color
 * @param sceneRange - Half-width of the scene coordinate space (default 50)
 */
export function renderNebulaTexture(
  canvas: HTMLCanvasElement,
  points: readonly NebulaPoint[],
  sceneRange?: number,
): void
```

**Mapping:** Scene coords `[-50,+50]` → canvas pixels `[0, canvas.width]`:
```
px = ((x + sceneRange) / (2 * sceneRange)) * canvas.width
py = ((z + sceneRange) / (2 * sceneRange)) * canvas.height
```

**Gradient per point:**
- Center: full color at alpha ~0.5
- Edge: same color at alpha 0
- Radius: `BASE_RADIUS + listingCount * SCALE_FACTOR` (in canvas pixels)
  - BASE_RADIUS = `canvas.width * 0.03` (~15px on a 512 canvas)
  - SCALE_FACTOR = `canvas.width * 0.015` (~8px per listing)
- `globalCompositeOperation = 'screen'` so overlaps lighten naturally

**Tests (write first):**

1. `clears canvas before drawing` — call with [], verify canvas is transparent (all pixels alpha=0)
2. `single point produces non-transparent center pixel` — one point at (0,0), sample center pixel, expect alpha > 0
3. `point color appears in output` — one red point, sample center, expect R channel dominant
4. `two overlapping points are brighter than one` — compare center alpha of 1-point vs 2-point at same location
5. `points at scene edges map to canvas edges` — point at (-50,-50), sample near (0,0) on canvas
6. `listingCount increases gradient radius` — 1-listing vs 5-listing, sample at fixed offset, 5-listing should have alpha > 0 where 1-listing doesn't
7. `empty points array produces blank canvas` — same as test 1 but explicit

**Implementation notes:**
- Use `OffscreenCanvas` in tests if `HTMLCanvasElement` isn't available in Vitest's happy-dom. Or use `createCanvas` from a `vitest.setup.ts` shim.
- Actually: Vitest with no DOM environment — use `canvas` npm package (`import { createCanvas } from 'canvas'`). OR since we only read pixel data, mock the canvas context. Simplest: inject `CanvasRenderingContext2D` or accept `{ width, height, getContext }` duck type.
- **Preferred approach:** Accept a duck-typed canvas (anything with `getContext('2d')` and `width`/`height`). In tests, use `jsdom`'s built-in Canvas (available via `@vitest/browser` or `jest-canvas-mock`). OR just test the pixel-mapping math as a separate pure function and keep the canvas draw calls thin.

**Revised approach — split into two layers:**

```typescript
/** Pure coordinate mapping — fully testable */
export function sceneToCanvas(
  x: number, z: number,
  canvasSize: number, sceneRange: number = 50,
): { px: number; py: number } {
  const px = ((x + sceneRange) / (2 * sceneRange)) * canvasSize
  const py = ((z + sceneRange) / (2 * sceneRange)) * canvasSize
  return { px, py }
}

/** Gradient radius in canvas pixels for a given listing count */
export function nebulaRadius(
  listingCount: number, canvasSize: number,
): number {
  const base = canvasSize * 0.03
  const scale = canvasSize * 0.015
  return base + listingCount * scale
}

/** Canvas draw — thin wrapper, not unit-tested (visual verification) */
export function renderNebulaTexture(
  canvas: HTMLCanvasElement,
  points: readonly NebulaPoint[],
  sceneRange?: number,
): void
```

**Tests for `sceneToCanvas`:**
1. Origin (0,0) → center of canvas
2. (-50,-50) → (0,0)
3. (+50,+50) → (canvasSize, canvasSize)
4. Custom sceneRange

**Tests for `nebulaRadius`:**
5. listingCount=1 → base + 1*scale
6. listingCount=5 → base + 5*scale
7. Scales with canvasSize

**Step-by-step:**
1. Write tests in `nebula-texture.test.ts`
2. Run — all fail
3. Implement `sceneToCanvas`, `nebulaRadius`, `renderNebulaTexture` in `nebula-texture.ts`
4. Run — all pass
5. Verify build

---

### Task 2: `IntelNebula` R3F Component

**Files:**
- Create: `frontend/src/components/star-map/IntelNebula.tsx`

R3F component that renders the nebula canvas texture on a flat plane in the 3D scene.

**Props:**
```typescript
interface IntelNebulaProps {
  /** Filtered intel-active systems with scene coords */
  readonly systems: readonly { heat: SystemHeatData; system: GalaxySystem }[]
}
```

**Implementation:**
- `useRef<HTMLCanvasElement>` — create a 512×512 offscreen canvas once
- `useMemo` or `useEffect` — call `renderNebulaTexture()` whenever `systems` changes
- `useRef<THREE.CanvasTexture>` — wrap canvas in `CanvasTexture`, set `needsUpdate = true` after each render
- Render: `<mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.2, 0]}>` (flat on XZ plane, just above grid)
  - `<planeGeometry args={[100, 100]}` — covers the full -50..+50 scene
  - `<meshBasicMaterial map={texture} transparent depthWrite={false} blending={THREE.AdditiveBlending} />`

**Color mapping:** Use `INTEL_TYPE_COLORS_NEON[heat.dominantType]` for each point.

**No test file** — visual component, verified by screenshot.

---

### Task 3: Strip RegionZone to Invisible Hit Area

**Files:**
- Modify: `frontend/src/components/star-map/RegionZone.tsx`

Remove all visual elements (wireframe lines, fill color). Keep only:
- The invisible polygon fill mesh (3+ hull) for click/hover
- The invisible line hit plane (2-point hull) for click/hover
- The hover tooltip (`<Html>`)
- The pulse animation (remove — no fill to pulse)

**Changes:**
- Delete both `<Line>` elements (glow + crisp wireframe)
- Delete `useFrame` (no fill to animate)
- Delete `fillRef` / `useRef` (no animated material)
- Set polygon fill `opacity={0}` (fully invisible, hit-test only)
- Keep line hit plane as-is (already opacity=0)
- Keep `<Html>` tooltip

---

### Task 4: Update StarMapScene — Swap SystemDot for IntelNebula

**Files:**
- Modify: `frontend/src/components/star-map/StarMapScene.tsx`

**Changes:**
- Remove `SystemDot` import, add `IntelNebula` import
- Remove the `{activeSystems.map((...) => <SystemDot>)}` block
- Add `<IntelNebula systems={activeSystems} />` before the `OrbitControls`
- Keep `activeSystems` computation (IntelNebula needs it)
- Keep `computeCentroid` (camera auto-orient still uses it)

---

### Task 5: Wire Filtered Region Data for Tooltips

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/star-map/StarMapScene.tsx`
- Modify: `frontend/src/components/star-map/RegionZone.tsx`

Currently `regionData` is aggregated from `heatMap.allSystems` (unfiltered). Tooltips
should show filtered counts when a type filter is active.

**App.tsx:**
```typescript
// Existing (keep for click targets — all regions always clickable)
const regionData = useMemo(
  () => aggregateByRegion(heatMap.allSystems, galaxy?.systems ?? []),
  [heatMap.allSystems, galaxy],
)

// NEW — filtered region data for tooltip counts
const filteredRegionData = useMemo(
  () => aggregateByRegion(heatMap.systems, galaxy?.systems ?? []),
  [heatMap.systems, galaxy],
)
```

Pass both to `StarMapScene`:
```typescript
<StarMapScene
  systems={galaxy?.systems ?? []}
  regions={regionData}
  filteredRegions={filteredRegionData}   // NEW
  systemHeats={heatMap.systems}
  panelOpen={panel.kind !== 'none'}
  onRegionClick={...}
/>
```

**StarMapScene:** Accept `filteredRegions` prop, pass to RegionZone.

**RegionZone:** Accept optional `filteredData` prop. Tooltip reads
`filteredData?.listingCount ?? data.listingCount`.

---

### Task 6: Clean Up Dead Code

**Files:**
- Delete or gut: `frontend/src/components/star-map/SystemDot.tsx`

Since nothing imports SystemDot anymore after Task 4, delete the file. Also remove
the `SystemDot` import from `StarMapScene.tsx` (already done in Task 4).

Verify no other files import SystemDot:
```bash
grep -r "SystemDot" frontend/src --include="*.ts" --include="*.tsx"
```

---

### Task 7: Build + Test + Visual Verify

1. `pnpm test --run` — all tests pass (existing 142 + new nebula-texture tests)
2. `pnpm build` — clean TypeScript build
3. Visual verification: `pnpm dev` → Map view shows nebula glow instead of dots
4. Filter check: click "Fleet" → only red nebula visible, tooltip shows fleet-only counts
5. Commit

---

## Verification Checklist

After all tasks:

- [ ] `pnpm test --run` — all tests pass
- [ ] `pnpm build` — clean TypeScript build
- [ ] No SystemDot spheres/rings visible on the map
- [ ] No RegionZone wireframes visible on the map
- [ ] Nebula glow visible in dense cluster (869-Y-51)
- [ ] Scattered singles show faint individual glow spots
- [ ] Hovering a glowing area shows region name + listing count
- [ ] Clicking a glowing area opens region panel
- [ ] "ALL" filter: all intel types' glow visible, tooltip shows total count
- [ ] "Resource" filter: only cyan glow, tooltip shows resource-only count
- [ ] "Fleet" filter: only red glow, tooltip shows fleet-only count
- [ ] Camera auto-orient still works (centroid computation unchanged)
- [ ] 2D SVG heat map fallback still functional (ErrorBoundary path)

---
title: "feat: Holographic UI rework — 3D star map and HUD chrome"
type: feat
date: 2026-03-09
brainstorm: docs/brainstorms/2026-03-08-holographic-ui-rework-brainstorm.md
---

# Holographic UI Rework — 3D Star Map and HUD Chrome

## Overview

Replace the flat 2D SVG heat map and basic dark theme with an immersive holographic tactical console: a persistent 3D star map (Three.js via React Three Fiber), neon wireframe region boundaries, floating HUD-styled panels, and full chrome restyle with Orbitron + JetBrains Mono typography.

This is a cosmetic/presentational rework. No contract changes, no data flow changes, no new on-chain interactions. All existing lib/hook tests remain valid.

## Problem Statement

The current UI is functional but visually flat — a static SVG heat map with basic dark theme styling. For the EVE Frontier hackathon submission, visual impact and interactivity are differentiators. The "Dark Net" intelligence marketplace brand deserves a tactical command console aesthetic that draws users in and makes them want to explore.

## Proposed Solution

### Architecture: Two-Layer DOM

```
┌─────────────────────────────────────────┐
│  Layer 0: <Canvas> (full viewport)      │  ← Three.js scene (stars, grid, regions, systems)
│  - OrbitControls (disabled when panel)  │
│  - Bloom postprocessing                 │
├─────────────────────────────────────────┤
│  Layer 1: DOM overlay (pointer-events)  │  ← HTML panels, nav, wallet button
│  - .hud-overlay (pointer-events: none)  │
│  - .hud-nav (pointer-events: auto)      │
│  - .panel-* (pointer-events: auto)      │
└─────────────────────────────────────────┘
```

The Three.js `<Canvas>` fills the viewport as a persistent backdrop. An absolutely-positioned DOM layer sits above it. The overlay container has `pointer-events: none` so mouse events pass through to the canvas. Individual panels and nav elements have `pointer-events: auto` to capture their own clicks.

When a panel is open, a semi-transparent backdrop div (`pointer-events: auto`) sits between the canvas and the panel, dimming the map and blocking camera interaction. Clicking the backdrop dismisses the panel.

### Panel State Machine

```typescript
type PanelState =
  | { kind: 'none' }                              // Full interactive map
  | { kind: 'region', regionName: string }         // Slide-in right drawer
  | { kind: 'browse' }                             // Centered floating card
  | { kind: 'create' }                             // Centered floating card
  | { kind: 'my-intel' }                           // Centered floating card

// Nested state within any panel:
// selectedListing → purchase flow → decrypt → view
// (Same as current App.tsx flow, contained within the active panel)
```

Rules:
- Only one panel at a time. Opening a new panel closes the previous.
- Escape key or backdrop click closes the active panel.
- Closing a panel returns to `{ kind: 'none' }` (full map).
- "Map" nav tab = force `{ kind: 'none' }`.
- Camera controls: enabled when `kind === 'none'`, disabled otherwise.

### 3D Coordinate Mapping

Current `StarSystem` has `x, y` in 0–1000 SVG space. For 3D:
- Map `x` → Three.js X axis: `(x - 500) / 10` → range -50 to +50
- Map `y` → Three.js Z axis: `(y - 500) / 10` → range -50 to +50
- Add `z` to `StarSystem` for Y axis (height): small random offsets per system (-3 to +3)
- Camera default: position `(0, 60, 60)`, looking at origin
- Grid plane at Y=0

### Region Aggregation

New pure function in `heat-map-data.ts`:

```typescript
interface RegionHeatData {
  readonly regionName: string
  readonly systemIds: readonly bigint[]
  readonly listingCount: number
  readonly dominantType: IntelType
  readonly freshness: number
  readonly avgPrice: bigint
  readonly listings: readonly IntelListingFields[]
  readonly hull: readonly [number, number][] // 2D convex hull points (x, z in 3D space)
}

function aggregateByRegion(systems: SystemHeatData[], allSystems: StarSystem[]): RegionHeatData[]
```

This groups `SystemHeatData` by region, computes a single dominant type per region, and pre-computes the 2D convex hull of system positions for wireframe rendering.

## Technical Approach

### Phase 1: Foundation — Dependencies, Data, Scaffold

**Step 1: Install Three.js ecosystem**

```bash
cd frontend && pnpm add three @react-three/fiber @react-three/drei @react-three/postprocessing
pnpm add -D @types/three
```

**Step 2: Add font imports to `index.html`**

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

Update CSS custom properties:
```css
--font-display: 'Orbitron', sans-serif;
--font-mono: 'JetBrains Mono', monospace;
```

**Step 3: Extend `StarSystem` with z-coordinate**

Add `z: number` to the interface and assign values to all 20 demo systems. Small vertical offsets (-3 to +3) to give depth without losing readability.

**Step 4: TDD — `aggregateByRegion` + convex hull**

Write tests first for:
- Groups systems by region name
- Computes dominant type across all regional listings
- Computes regional freshness (max of system freshnesses)
- Computes 2D convex hull from system x/z positions
- Returns empty array for no data
- Handles region with single system (hull is a point)

Implement `aggregateByRegion` and a simple `convexHull2D` function (Graham scan, ~30 lines) in `heat-map-data.ts`.

### Phase 2: 3D Scene — Canvas, Grid, Stars, Systems

**Step 5: Create `StarMapScene` component**

New file: `src/components/star-map/StarMapScene.tsx`

```tsx
<Canvas camera={{ position: [0, 60, 60], fov: 50 }} dpr={[1, 1.5]}>
  <ambientLight intensity={0.1} />
  <StarField />
  <HoloGrid />
  {regions.map(r => <RegionZone key={r.regionName} data={r} />)}
  {systems.map(s => <SystemDot key={s.id.toString()} system={s} />)}
  <OrbitControls enabled={!panelOpen} enablePan={false} maxDistance={120} minDistance={20} />
  <EffectComposer>
    <Bloom luminanceThreshold={0.6} intensity={0.8} radius={0.4} />
  </EffectComposer>
</Canvas>
```

**Step 6: `StarField` component**

`drei`'s `<Stars>` component: ~1500 points, radius 200, depth 100, saturation 0, small size. Provides parallax depth as camera rotates.

**Step 7: `HoloGrid` component**

`drei`'s `<Grid>` helper on the XZ plane at Y=0:
- Cell size: 5 units
- Section size: 25 units
- Cell color: `#0a3d5c` (dark cyan)
- Section color: `#0e7490` (brighter cyan)
- Fade from center: true, fadeDistance 80
- Transparent, side: DoubleSide

**Step 8: `SystemDot` component**

Each system rendered as a small emissive sphere (radius 0.3-0.8 based on listing count) with a `<Billboard>` label (system name). Color from intel type colors. Glow intensity from freshness.

No click handler on individual systems — they are visual indicators only. The clickable unit is the region zone.

**Step 9: `RegionZone` component**

For each region:
1. Render the convex hull as a `<Line>` (from drei) with emissive neon color matching dominant intel type
2. Render a transparent filled mesh inside the hull for click hit-testing (`visible: false` or `opacity: 0.05`)
3. On hover: brighten wireframe, show region name + listing count tooltip via `<Html>` from drei
4. On click: call `onRegionClick(regionName)` callback
5. Pulse animation on wireframe edges when region has fresh intel (`freshness > 0.8`)

Region color: use the `TYPE_COLORS` map (extracted to constants) keyed by `dominantType`.

### Phase 3: App Layout — Persistent Backdrop + Floating Panels

**Step 10: Restructure `App.tsx`**

Replace the current stacked layout with:

```tsx
<div className="app-viewport">
  {/* Layer 0: 3D scene */}
  <ErrorBoundary fallback={<SvgHeatMapFallback />}>
    <StarMapScene
      regions={regionData}
      systems={DEMO_SYSTEMS}
      panelOpen={panel.kind !== 'none'}
      onRegionClick={(name) => setPanel({ kind: 'region', regionName: name })}
    />
  </ErrorBoundary>

  {/* Layer 1: HUD overlay */}
  <div className="hud-overlay">
    <header className="hud-header">...</header>
    <nav className="hud-nav">...</nav>
    <HeatMapControls filters={filters} onChange={setFilters} />
  </div>

  {/* Layer 2: Panel + backdrop (when panel open) */}
  {panel.kind !== 'none' && (
    <>
      <div className="panel-backdrop" onClick={closePanel} />
      <PanelRouter panel={panel} ... />
    </>
  )}
</div>
```

The `ErrorBoundary` wrapping `<Canvas>` catches WebGL initialization failures and falls back to the existing SVG heat map — preserving full functionality on unsupported hardware.

**Step 11: `PanelRouter` component**

Routes to the correct panel based on `panel.kind`:
- `'region'` → `<RegionPanel>` (slide-in from right, 400px wide, full height)
- `'browse'` → `<ListingBrowser>` wrapped in `<FloatingPanel>`
- `'create'` → `<CreateListing>` wrapped in `<FloatingPanel>`
- `'my-intel'` → `<MyIntel>` wrapped in `<FloatingPanel>`

The existing content components (`ListingBrowser`, `CreateListing`, `MyIntel`) are unchanged internally — they just get wrapped in a panel container with slide/fade animations.

**Step 12: `RegionPanel` component**

New slide-in drawer for when a region is clicked on the map:
- Shows region name, listing count, dominant type
- Lists all active listings in the region (reuses listing item UI from `ListingBrowser`)
- Click a listing → same purchase/decrypt flow as current app
- Close button + backdrop click to dismiss

**Step 13: `FloatingPanel` wrapper**

A centered card container for Browse/Create/My Intel:
- `max-width: 800px`, `max-height: 80vh`, `overflow-y: auto`
- Semi-transparent dark background with neon border
- Fade-in animation on open, fade-out on close

### Phase 4: HUD Chrome Restyle

**Step 14: CSS custom property overhaul**

Update `:root` variables:

```css
/* Typography */
--font-display: 'Orbitron', sans-serif;
--font-mono: 'JetBrains Mono', monospace;

/* HUD accents */
--hud-cyan: #0ea5e9;
--hud-cyan-dim: #0a3d5c;
--hud-glow: 0 0 8px var(--hud-cyan), 0 0 20px rgba(14, 165, 233, 0.15);
--hud-border: 1px solid var(--hud-cyan-dim);

/* Panel backgrounds */
--panel-bg: rgba(10, 14, 23, 0.85);
--panel-backdrop: rgba(0, 0, 0, 0.5);
```

**Step 15: Header and nav restyle**

- Title uses `font-family: var(--font-display)`, letter-spacing, cyan text-shadow glow
- Nav buttons: transparent bg, cyan border on hover, box-shadow glow on active
- Wallet connect button: same HUD treatment
- All positioned as fixed HUD elements over the viewport

**Step 16: Panel and card restyle**

- Cards: `background: var(--panel-bg)`, `backdrop-filter: blur(8px)`, `border: var(--hud-border)`
- Subtle `box-shadow: var(--hud-glow)` on cards and active elements
- Form inputs: darker bg, cyan focus ring
- Buttons: `.btn-primary` gets cyan glow on hover, `.btn-secondary` gets dim cyan border
- Listing items: hover state adds faint cyan border-glow

**Step 17: `HeatMapControls` restyle**

Move from a stacked bar above the SVG to a compact floating HUD overlay in the top-left of the viewport. Same filter logic, restyled with HUD aesthetic. Only visible when `panel.kind === 'none'`.

### Phase 5: Polish and Verification

**Step 18: Animations and transitions**

- Panel open/close: CSS transitions (`transform: translateX` for slide-in, `opacity` for floating)
- Region hover: Three.js material color lerp (in `useFrame`)
- Region pulse: sine-wave opacity on wireframe when `freshness > 0.8`
- Backdrop fade: CSS `opacity` transition
- Camera: `OrbitControls` with `enableDamping`, `dampingFactor: 0.05`

**Step 19: WebGL fallback + loading state**

- `ErrorBoundary` around `<Canvas>` catches initialization failures
- Fallback renders the existing SVG `HeatMap` component (preserves full functionality)
- Brief loading indicator (the dark `--bg-primary` background + subtle spinner) while Three.js initializes
- `<Canvas>` fades in once scene is ready (use R3F's `onCreated` callback)

**Step 20: Extract `TYPE_COLORS` to constants**

Move the intel type → color mapping from `SystemNode.tsx` to `constants.ts` since it's now used by both the 3D `RegionZone`/`SystemDot` components and any HTML overlays.

**Step 21: Verify**

- `pnpm test` — all 66 existing tests pass (data layer unchanged)
- `pnpm build` — clean TypeScript build
- New `aggregateByRegion` + `convexHull2D` tests pass
- Visual check: 3D map renders, regions glow, camera orbits
- Panel check: all 4 panel types open/close correctly
- Purchase flow works end-to-end through floating panel
- WebGL fallback: disable WebGL in browser → SVG fallback renders

## Files Summary

| File | Action | What |
|------|--------|------|
| `package.json` | Modify | Add three, R3F, drei, postprocessing, @types/three |
| `index.html` | Modify | Add Google Fonts link for Orbitron + JetBrains Mono |
| `src/lib/systems.ts` | Modify | Add `z: number` to StarSystem, values for 20 systems |
| `src/lib/heat-map-data.ts` | Modify | Add `RegionHeatData`, `aggregateByRegion`, `convexHull2D` |
| `src/lib/heat-map-data.test.ts` | Modify | Add tests for region aggregation + convex hull |
| `src/lib/constants.ts` | Modify | Add `TYPE_COLORS` map, `--font-display` reference |
| `src/hooks/useHeatMapData.ts` | Modify | Add `useRegionData` or extend to return region aggregates |
| `src/components/star-map/StarMapScene.tsx` | Create | Main R3F Canvas + scene composition |
| `src/components/star-map/StarField.tsx` | Create | drei Stars wrapper |
| `src/components/star-map/HoloGrid.tsx` | Create | Grid helper on XZ plane |
| `src/components/star-map/SystemDot.tsx` | Create | Per-system 3D node (sphere + billboard label) |
| `src/components/star-map/RegionZone.tsx` | Create | Convex hull wireframe + hit mesh + hover/click |
| `src/components/panels/PanelRouter.tsx` | Create | Routes panel state to correct component |
| `src/components/panels/FloatingPanel.tsx` | Create | Centered card wrapper with animations |
| `src/components/panels/RegionPanel.tsx` | Create | Slide-in drawer for region listings |
| `src/App.tsx` | Rewrite | Two-layer viewport, panel state machine, HUD nav |
| `src/index.css` | Rewrite | HUD chrome, panel styles, viewport layout, font vars |
| `src/components/ListingBrowser.tsx` | Minor | Remove self-contained `<section>`, content only |
| `src/components/CreateListing.tsx` | Minor | Remove self-contained `<section>`, content only |
| `src/components/MyIntel.tsx` | Minor | Remove self-contained `<section>`, content only |

### Files Preserved (no changes)

- `src/lib/types.ts`, `src/lib/parse.ts`, `src/lib/format.ts`, `src/lib/intel-schemas.ts`
- `src/lib/transactions.ts`, `src/lib/seal.ts`, `src/lib/walrus.ts`
- `src/hooks/useListings.ts`, `src/hooks/usePurchase.ts`, `src/hooks/useDecrypt.ts`, `src/hooks/useReceipts.ts`
- `src/components/IntelViewer.tsx`, `src/components/PurchaseFlow.tsx`, `src/components/ErrorBoundary.tsx`
- `src/providers/AppProviders.tsx`
- All existing test files (data layer tests)

### Files Retired

- `src/components/heat-map/HeatMap.tsx` — kept as WebGL fallback only
- `src/components/heat-map/SystemNode.tsx` — replaced by `SystemDot.tsx`
- `src/components/heat-map/HeatMapControls.tsx` — content preserved, restyled as HUD overlay

## Acceptance Criteria

### Functional

- [ ] 3D star map renders with orbital camera controls (rotate, zoom)
- [ ] 6 region boundary zones visible as neon wireframe convex hulls
- [ ] Region glow color reflects dominant intel type
- [ ] Region glow intensity reflects listing density
- [ ] Region click opens slide-in panel with all region listings
- [ ] Browse/Create/My Intel open as floating panels over dimmed map
- [ ] Only one panel at a time, Escape/backdrop click dismisses
- [ ] Camera controls disabled when panel is open
- [ ] Purchase and decrypt flow works end-to-end through panels
- [ ] Existing filter controls work (intel type filtering)

### Visual

- [ ] Holographic grid visible on XZ plane with cyan lines
- [ ] Sparse star field provides depth parallax on camera rotation
- [ ] Orbitron font on all headings/nav, JetBrains Mono on data/body
- [ ] Nav, buttons, cards have neon HUD aesthetic with cyan glow
- [ ] Bloom effect on 3D region wireframes and active system nodes
- [ ] CSS glow on UI panels and interactive elements

### Resilience

- [ ] WebGL failure falls back to existing SVG heat map
- [ ] All 66+ existing tests pass unchanged
- [ ] New region aggregation + convex hull tests pass
- [ ] Clean TypeScript build
- [ ] Clean Vite production build

## Dependencies & Risks

- **Bundle size** — Three.js + R3F + drei + postprocessing adds ~200-300KB gzipped. Acceptable for hackathon but noted.
- **Browser compatibility** — WebGL2 required. Covered by ErrorBoundary fallback to SVG.
- **GPU performance** — Bloom postprocessing on integrated GPUs may drop frames. Mitigated by conservative bloom settings (`luminanceThreshold: 0.6`) and capped `dpr: [1, 1.5]`.
- **No mobile optimization** — Desktop-first for hackathon. OrbitControls has native touch support if needed later.
- **Convex hull edge case** — Regions with 1-2 systems produce degenerate hulls (point or line). Handle gracefully (render as circle/dot for 1 system, line segment for 2).

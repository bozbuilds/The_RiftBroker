# Star Map Visual Upgrade — Design Spec

> Inspired by [Scetrov/eve_frontier_dataviz](https://github.com/Scetrov/eve_frontier_dataviz)'s warm amber glow, system labels, and selection animations. Adapted from Blender GPU shaders to Three.js + React Three Fiber.

## Goal

Replace the current cold cyan point-sprite star map with a polished warm amber visualization. Intel presence is communicated through diffuse region clouds rather than per-system indicators, preserving information asymmetry (scouts sell intel — the map shouldn't give it away for free).

## Design Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| System coloring | Uniform warm amber for all 24K systems | No system should individually reveal intel presence |
| Intel visualization | Diffuse region clouds, not per-system sprites | Hints at regional activity without pinpointing systems |
| Cloud color | By dominant intel type (cyan/red/green/yellow) | Preserves type awareness at the regional level |
| Cloud density | Opacity scales with listing count per region | More intel = brighter cloud. Baseline locked at ~0.18 center opacity for 1-2 listings |
| Hover behavior | Warm radial bloom + bordered name label on mouseover | Matches Scetrov's polish: soft glow with monospace label |
| Click behavior | Locks selection (persistent bloom + pulse) AND opens RegionPanel | Single interaction path — click system or cloud → sidebar |
| Background | Pure black (remove HoloGrid) | Lets amber dots and region clouds stand out naturally |
| StarField | Keep existing ambient particles | Provides depth and parallax during orbit |
| Bloom post-processing | Keep existing | Enhances the warm glow naturally |
| Camera controls | Keep existing orbit/pan/zoom + smooth region focus | Already polished, no changes needed |

## Visual Spec

### Systems (GalaxyParticles upgrade)

**Current:** Two-tier cold blue (core #2a5298, frontier #0d1b33), additive blending, size 0.03.

**New:**
- Single warm amber color for all systems
- Radial gradient texture: center #ffb347 → mid #ff8c00 → edge #ff6600 (transparent)
- Slightly larger point size (~0.05) for better visibility
- Keep additive blending + depth write disabled
- Keep size attenuation (parallax at distance)
- **Ambient flicker:** Subtle per-system brightness variation via a time-varying uniform on the points shader. Random phase offset per system, ~0.02 amplitude, slow period (~3-5s). Makes the star field feel alive without being distracting. Implemented as a custom `ShaderMaterial` with a `uTime` uniform — each vertex gets a brightness multiplier of `1.0 + sin(uTime * rate + systemIndex * 0.37) * 0.02`.

### Intel Region Clouds (replaces IntelNebula)

**Current:** Per-system sprites with intel-type neon colors. Additive blending. Scale by listing count. Directly reveals which systems have intel.

**New:**
- One elliptical cloud mesh per region with intel activity
- Positioned at region centroid, sized to cover the region's convex hull
- Radial gradient: center at base opacity → 40% radius at half opacity → edge transparent
- Color: dominant intel type using existing neon palette
  - Resource: #00e5ff (cyan)
  - Fleet: #ff1744 (red)
  - Base: #76ff03 (green)
  - Route: #ffea00 (yellow)
- **Opacity scaling:** `baseOpacity + Math.min(listingCount / MIN_FLOOR, 1) * opacityRange`
  - Base center opacity: 0.18 (locked baseline for 1-2 listings)
  - Max center opacity: ~0.45 (high-density hotspots)
  - MIN_FLOOR: 10 (prevents single-listing saturation)
  - Edge always fades to 0
- Additive blending, depth write disabled, transparent
- Non-interactive (clicks pass through to RegionZone below)
- **Noise distortion:** Clouds use Perlin noise to break the uniform elliptical shape into organic nebula forms. Applied as a texture-space distortion on the cloud's alpha channel:
  - Generate a 256x256 Perlin noise texture (computed once per region, not per-frame)
  - Noise scale: ~3.0 octaves for coarse structure, ~0.5 amplitude for aggressive shape variation
  - The noise modulates the radial gradient alpha: `finalAlpha = baseGradientAlpha * (0.5 + noise * 0.8)`
  - At 0.8 amplitude, some areas of the cloud will nearly vanish while others intensify — creating tendrils and gaps rather than smooth ellipses
  - Each region gets a unique noise seed (derived from region name hash) so no two clouds look alike
  - Can be tuned down by reducing the 0.8 multiplier if the effect is too aggressive

### Hover Effect

**On mouseover (any system):**
- **Two-layer cinematic bloom:**
  - **Inner glow** (fast): sharp bright halo, fades in ~100ms, radius ~3x system dot, color #ffcc66 at center
  - **Outer halo** (delayed): soft wide bloom, fades in ~150ms after inner, radius ~8x system dot, color #ff8800 with low opacity
  - This staged reveal creates a "lighting up" moment — the system ignites from within rather than just appearing
- **HUD-style scanner label** floats above system:
  - Thin uppercase text, letter-spacing 0.1em, font-size 0.7rem
  - Color: #ffcc88 on rgba(0,0,0,0.8) background
  - Faint horizontal rule extends left and right from the text (~20px each side, 1px solid #ff8c0040)
  - Subtle vertical connector line from label down to system dot (1px solid #ff8c0030, dashed)
  - Positioned via R3F `Html` component (camera-facing)
  - Feels like an in-universe scanner readout, not a generic tooltip

**On mouseout:**
- Outer halo fades first (~150ms), then inner glow (~100ms) — reverse of the reveal order
- Label fades with the outer halo

### Click / Selection

**On click (system):**
- Selection locks: persistent bloom stays visible (both inner + outer layers)
- **Breathing pulse:** bloom *opacity* oscillates between 0.6–1.0 at ~1.5s period (sine wave). Pulsing opacity rather than radius avoids jitter and looks like a calm breathing rhythm.
- RegionPanel sidebar opens for the system's region
- Camera smooth-pans to region centroid (existing CameraFocus behavior)

**On click (region cloud / RegionZone):**
- RegionPanel sidebar opens (existing behavior)
- Camera smooth-pans to region centroid

**On deselect (click elsewhere / Escape):**
- Selection clears, bloom disappears
- RegionPanel closes

### Removed Components

- **HoloGrid** — removed entirely. Pure black background.
- **IntelNebula** — replaced by region clouds (different component, different rendering approach)

### Background Vignette (new)

- Fullscreen quad behind everything with a subtle radial vignette
- Corners darken to ~#000000, center stays at scene background (#050505)
- Very faint — just enough to add depth and frame the galaxy without being noticeable
- Single `PlaneGeometry` with a custom shader or a `<sprite>` with a radial gradient texture
- No performance cost (one extra draw call)

### Kept Components (no changes)

- **StarField** — ambient parallax star particles (drei Stars helper)
- **RegionZone** — invisible convex hull click targets per region
- **CameraFocus** — smooth lerp pan to region centroid
- **CameraAutoOrient** — initial camera orientation toward active regions
- **OrbitControls** — rotate/pan/zoom with damping
- **Bloom post-processing** — luminance threshold 0.6, intensity 0.4

## Component Map

All components live under `frontend/src/components/star-map/`.

| Component | Action | Notes |
|-----------|--------|-------|
| `GalaxyParticles.tsx` | Modify | Warm amber, custom ShaderMaterial with flicker, hover/click raycasting |
| `IntelNebula.tsx` | Replace | New `RegionClouds.tsx` — noise-distorted diffuse fog per region |
| `StarMapScene.tsx` | Modify | Wire up hover/click state, add vignette, remove HoloGrid, clean up unused hooks |
| `HoloGrid.tsx` | Remove | No longer rendered |
| `RegionZone.tsx` | Keep | Invisible click targets unchanged |
| `StarField.tsx` | Keep | No changes |
| `index.ts` | Keep | Barrel export (only exports StarMapScene) |
| `star-map-scene.test.ts` | Modify | Update tests for new components |

## Hover Raycasting on Points Geometry

The existing `IntelNebula` uses per-sprite `onPointerEnter`/`onPointerLeave` handlers — individual R3F elements. `GalaxyParticles` is a single `<points>` buffer geometry with 24K vertices and no raycasting.

To enable hover/click on individual systems within the `<points>` geometry:

- Add `onPointerMove` handler to the `<points>` element
- R3F's raycaster returns `event.index` — the vertex index into the positions buffer
- Map `event.index` back to the `systems[]` array to get `systemId` and `name` for the label
- Set `raycaster.params.Points.threshold` to ~0.5 scene units (balances precision vs. miss rate)
- **Throttle** pointer events to every ~50ms to avoid per-frame raycasting against 24K points
- Hover labels show **all 24K systems**, not just intel-active ones

**Click priority:** System-level clicks (on `<points>`) take priority via `event.stopPropagation()`. Only when no system point is hit does the click fall through to `RegionZone` meshes.

## Opacity Scaling

Formula: `baseOpacity + Math.min(listingCount / MIN_FLOOR, 1) * opacityRange`

- `baseOpacity`: 0.18 (locked baseline — what 1-2 listings looks like)
- `opacityRange`: 0.27 (max additional opacity)
- `MIN_FLOOR`: 10 (prevents a single-listing region from saturating at max)
- Result: 1 listing → ~0.21, 5 listings → ~0.32, 10+ listings → 0.45 (max)

This uses a linear clamp rather than relative-to-max, so opacity is stable regardless of how many listings exist globally.

## Performance Considerations

- Region clouds: one mesh per region (~10-50 total) with pre-computed noise textures — negligible vs 24K particles
- Noise textures: 256x256 per region, generated once on mount (not per-frame). ~10-50 small textures in GPU memory.
- Hover detection: raycasting on `<points>` with 50ms throttle to limit CPU cost
- Ambient flicker: single `uTime` uniform update per frame via `useFrame` — no per-vertex CPU work, GPU handles the sine computation
- Selection state: single `useState<bigint | null>` for selected system ID
- Label rendering: single `Html` component, only mounted when hovering/selected
- Vignette: single fullscreen quad — one extra draw call
- **Cleanup:** `useHeatMap` and `useActiveSystems` hooks in StarMapScene may become dead code after IntelNebula is replaced. Evaluate during implementation — region centroids can be computed from `RegionHeatData.hull` points instead.

## Data Flow

Region centroids are computed from `RegionHeatData.hull` convex hull points (average of vertices). `RegionHeatData` does not have a `centroid` field — compute it in the `RegionClouds` component.

```
Listings (raw from SUI)
  ↓
useHeatMapData → aggregateBySystem → aggregateByRegion
  ↓
RegionHeatData[] (hull, listingCount, dominantType)
  ↓
RegionClouds: compute centroids from hull, render elliptical fog per region
  ↓
GalaxyParticles: render all 24K systems as warm amber (hover/click raycasting)
  ↓
Hover/Click state managed in StarMapScene
  ↓
RegionPanel sidebar opens on click
```

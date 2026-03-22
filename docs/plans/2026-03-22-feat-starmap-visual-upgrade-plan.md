# Star Map Visual Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cold cyan star map with a polished warm amber visualization — warm-shifted UI palette, noise-distorted region clouds for intel, cinematic hover/select interactions, ambient system flicker.

**Architecture:** CSS variable swap for palette, then 3D scene overhaul: replace `GalaxyParticles` (custom ShaderMaterial with flicker), replace `IntelNebula` with `RegionClouds` (Perlin noise-distorted sprites), add hover/click raycasting on Points geometry, remove HoloGrid, add vignette.

**Tech Stack:** Three.js, React Three Fiber, @react-three/drei, @react-three/postprocessing, GLSL shaders, Vitest 4

**Spec:** `docs/brainstorms/2026-03-22-starmap-visual-upgrade-brainstorm.md`

---

## Design Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Implementation order | Palette first, then 3D scene | Palette is a single-file CSS swap; scene changes are multi-file |
| ShaderMaterial approach | Inline GLSL strings (vertex + fragment) | Avoids .glsl file loader config; keeps shader code co-located with component |
| Perlin noise | Pure JS implementation in a utility file | No npm dependency; ~30 lines for 2D Perlin noise |
| Hover raycasting | `onPointerMove` on `<points>` with 50ms throttle | R3F handles raycasting; throttle prevents per-frame CPU cost |
| Region centroids | Computed from hull vertices in RegionClouds | No type changes to RegionHeatData |

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/index.css` | Modify | Palette warm-shift (`:root` variables only) |
| `frontend/src/components/star-map/GalaxyParticles.tsx` | Rewrite | Warm amber, custom ShaderMaterial with flicker, hover/click raycasting |
| `frontend/src/components/star-map/IntelNebula.tsx` | Delete | Replaced by RegionClouds |
| `frontend/src/components/star-map/RegionClouds.tsx` | Create | Noise-distorted diffuse fog per intel region |
| `frontend/src/components/star-map/Vignette.tsx` | Create | Fullscreen radial vignette background |
| `frontend/src/components/star-map/SystemLabel.tsx` | Create | HUD-style scanner label (Html component) |
| `frontend/src/components/star-map/SystemBloom.tsx` | Create | Two-layer cinematic hover bloom + breathing selection pulse |
| `frontend/src/components/star-map/StarMapScene.tsx` | Modify | Wire hover/click state, remove HoloGrid, swap IntelNebula → RegionClouds, add Vignette |
| `frontend/src/components/star-map/HoloGrid.tsx` | Delete | No longer rendered |
| `frontend/src/lib/noise.ts` | Create | 2D Perlin noise function for cloud textures |
| `frontend/src/lib/noise.test.ts` | Create | Tests for noise determinism and range |
| `frontend/src/lib/hull.ts` | Create | Shared hullCentroid + hullRadius utilities |
| `frontend/src/lib/hull.test.ts` | Create | Tests for hull utilities |
| `frontend/src/components/star-map/star-map-scene.test.ts` | Modify | Update for new components, add hull centroid test |

---

## Chunk 1: UI Palette Warm-Shift

### Task 1: CSS Variable Swap

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Replace `:root` variables**

In `frontend/src/index.css`, replace the `:root` block (lines 16–52) with the warm-shifted palette. Only the variable declarations change — all 47+ `var(--hud-cyan)` references throughout the file continue to work unchanged.

Replace:
```css
:root {
  --bg-primary: #0a0e17;
  --bg-secondary: rgba(10, 14, 23, 0.85);
  --bg-tertiary: rgba(15, 20, 30, 0.9);
  --bg-elevated: rgba(20, 28, 40, 0.9);
  --text-primary: #e0ecff;
  --text-secondary: #8ecae6;
  --text-muted: #4a6a7a;
  --accent-green: #10b981;
  --accent-red: #ef4444;
  --accent-orange: #f59e0b;
  --accent-blue: #3b82f6;
  --accent-purple: #8b5cf6;
  --border: rgba(14, 116, 144, 0.2);
  --border-bright: rgba(14, 165, 233, 0.3);
  --success: #10b981;
  --error: #ef4444;
  --warning: #f59e0b;
  --radius: 4px;
  --radius-lg: 8px;

  /* Typography */
  --font-display: 'Orbitron', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --font-sans: 'JetBrains Mono', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;

  /* HUD accents */
  --hud-cyan: #0ea5e9;
  --hud-cyan-dim: rgba(14, 116, 144, 0.3);
  --hud-glow: 0 0 8px rgba(14, 165, 233, 0.4), 0 0 20px rgba(14, 165, 233, 0.1);
  --hud-glow-strong: 0 0 12px rgba(14, 165, 233, 0.6), 0 0 30px rgba(14, 165, 233, 0.2);
  --hud-border: 1px solid var(--hud-cyan-dim);

  /* Panel */
  --panel-bg: rgba(10, 14, 23, 0.92);
  --panel-backdrop: rgba(0, 0, 0, 0.5);
}
```

With:
```css
:root {
  --bg-primary: #0a0a0d;
  --bg-secondary: rgba(12, 10, 8, 0.85);
  --bg-tertiary: rgba(16, 14, 12, 0.9);
  --bg-elevated: rgba(22, 18, 14, 0.9);
  --text-primary: #ede6db;
  --text-secondary: #c4a87a;
  --text-muted: #6a5a48;
  --accent-green: #10b981;
  --accent-red: #ef4444;
  --accent-orange: #f59e0b;
  --accent-blue: #3b82f6;
  --accent-purple: #8b5cf6;
  --border: rgba(212, 168, 83, 0.15);
  --border-bright: rgba(212, 168, 83, 0.3);
  --success: #10b981;
  --error: #ef4444;
  --warning: #f59e0b;
  --radius: 4px;
  --radius-lg: 8px;

  /* Typography */
  --font-display: 'Orbitron', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --font-sans: 'JetBrains Mono', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;

  /* HUD accents (warm gold — was cyan) */
  --hud-cyan: #d4a853;
  --hud-cyan-dim: rgba(212, 168, 83, 0.3);
  --hud-glow: 0 0 8px rgba(212, 168, 83, 0.4), 0 0 20px rgba(212, 168, 83, 0.1);
  --hud-glow-strong: 0 0 12px rgba(212, 168, 83, 0.6), 0 0 30px rgba(212, 168, 83, 0.2);
  --hud-border: 1px solid var(--hud-cyan-dim);

  /* Panel */
  --panel-bg: rgba(10, 9, 7, 0.92);
  --panel-backdrop: rgba(0, 0, 0, 0.5);
}
```

- [ ] **Step 2: Run all frontend tests**

Run: `cd frontend && pnpm exec vitest run`
Expected: All tests pass (CSS-only change, no logic affected).

- [ ] **Step 3: Visual check**

Run: `cd frontend && pnpm dev`
Open http://localhost:5173 — verify the UI has warm gold accents instead of cyan. Panels, buttons, borders, headings should all be gold-tinted. Badge colors (red, green, blue, purple) should be unchanged.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(frontend): warm-shift UI palette — gold accents replace cyan"
```

---

## Chunk 2: Noise Utility + Vignette + SystemLabel

### Task 2: Perlin Noise Utility (TDD)

**Files:**
- Create: `frontend/src/lib/noise.ts`
- Create: `frontend/src/lib/noise.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/lib/noise.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'

import { noise2D } from './noise'

describe('noise2D', () => {
  it('returns a value between -1 and 1', () => {
    for (let i = 0; i < 100; i++) {
      const val = noise2D(i * 0.1, i * 0.3)
      expect(val).toBeGreaterThanOrEqual(-1)
      expect(val).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic — same input gives same output', () => {
    const a = noise2D(1.5, 2.7)
    const b = noise2D(1.5, 2.7)
    expect(a).toBe(b)
  })

  it('varies across space — adjacent samples differ', () => {
    const a = noise2D(0, 0)
    const b = noise2D(10, 10)
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 2: Run tests to verify FAIL**

Run: `cd frontend && pnpm exec vitest run src/lib/noise.test.ts`
Expected: FAIL — `noise2D` not found.

- [ ] **Step 3: Implement noise2D**

Create `frontend/src/lib/noise.ts`:

```typescript
/**
 * 2D Perlin noise function.
 * Returns values in [-1, 1]. Deterministic for same inputs.
 * Used for region cloud texture distortion.
 */

// Permutation table (deterministic pseudo-random)
const perm = new Uint8Array(512)
for (let i = 0; i < 256; i++) perm[i] = i
// Fisher-Yates shuffle with fixed seed
let seed = 42
for (let i = 255; i > 0; i--) {
  seed = (seed * 16807 + 0) % 2147483647
  const j = seed % (i + 1)
  const tmp = perm[i]!
  perm[i] = perm[j]!
  perm[j] = tmp!
}
for (let i = 0; i < 256; i++) perm[256 + i] = perm[i]!

function fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10) }
function lerp(a: number, b: number, t: number) { return a + t * (b - a) }

function grad(hash: number, x: number, y: number): number {
  const h = hash & 3
  const u = h < 2 ? x : y
  const v = h < 2 ? y : x
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
}

export function noise2D(x: number, y: number): number {
  const xi = Math.floor(x) & 255
  const yi = Math.floor(y) & 255
  const xf = x - Math.floor(x)
  const yf = y - Math.floor(y)
  const u = fade(xf)
  const v = fade(yf)

  const aa = perm[perm[xi]! + yi]!
  const ab = perm[perm[xi]! + yi + 1]!
  const ba = perm[perm[xi + 1]! + yi]!
  const bb = perm[perm[xi + 1]! + yi + 1]!

  return lerp(
    lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
    lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
    v,
  )
}
```

- [ ] **Step 4: Run tests to verify PASS**

Run: `cd frontend && pnpm exec vitest run src/lib/noise.test.ts`
Expected: All 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/noise.ts frontend/src/lib/noise.test.ts
git commit -m "feat(frontend): add 2D Perlin noise utility for cloud textures"
```

---

### Task 2b: Hull Utilities (TDD)

**Files:**
- Create: `frontend/src/lib/hull.ts`
- Create: `frontend/src/lib/hull.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/lib/hull.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'

import { hullCentroid, hullRadius } from './hull'

describe('hullCentroid', () => {
  it('returns null for empty hull', () => {
    expect(hullCentroid([])).toBeNull()
  })

  it('returns centroid of square hull', () => {
    const result = hullCentroid([[0, 0], [10, 0], [10, 10], [0, 10]])
    expect(result!.cx).toBeCloseTo(5)
    expect(result!.cz).toBeCloseTo(5)
  })

  it('returns exact point for single-vertex hull', () => {
    expect(hullCentroid([[7, -3]]))
      .toEqual({ cx: 7, cz: -3 })
  })
})

describe('hullRadius', () => {
  it('returns minimum radius for empty hull', () => {
    expect(hullRadius([], 0, 0)).toBe(2)
  })

  it('returns distance to farthest vertex', () => {
    const r = hullRadius([[0, 0], [10, 0]], 5, 0)
    expect(r).toBeCloseTo(5)
  })
})
```

- [ ] **Step 2: Run tests to verify FAIL**

Run: `cd frontend && pnpm exec vitest run src/lib/hull.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `frontend/src/lib/hull.ts`:

```typescript
/** Compute centroid from convex hull vertices. */
export function hullCentroid(
  hull: readonly [number, number][],
): { cx: number; cz: number } | null {
  if (hull.length === 0) return null
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length
  const cz = hull.reduce((s, p) => s + p[1], 0) / hull.length
  return { cx, cz }
}

/** Compute bounding radius of hull from a center point. */
export function hullRadius(
  hull: readonly [number, number][],
  cx: number,
  cz: number,
): number {
  let maxR = 0
  for (const [x, z] of hull) {
    const dx = x - cx, dz = z - cz
    maxR = Math.max(maxR, Math.sqrt(dx * dx + dz * dz))
  }
  return Math.max(maxR, 2) // minimum radius to avoid zero-size clouds
}
```

- [ ] **Step 4: Run tests to verify PASS**

Run: `cd frontend && pnpm exec vitest run src/lib/hull.test.ts`
Expected: All 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/hull.ts frontend/src/lib/hull.test.ts
git commit -m "feat(frontend): add shared hull centroid and radius utilities"
```

---

### Task 3: Vignette Component

**Files:**
- Create: `frontend/src/components/star-map/Vignette.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/star-map/Vignette.tsx`:

```tsx
import { useMemo } from 'react'
import * as THREE from 'three'

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.999, 1.0);
}
`

const FRAG = `
varying vec2 vUv;
void main() {
  vec2 center = vUv - 0.5;
  float dist = length(center) * 2.0;
  float vignette = smoothstep(0.4, 1.4, dist);
  gl_FragColor = vec4(0.0, 0.0, 0.0, vignette * 0.35);
}
`

/**
 * Fullscreen radial vignette — darkens corners to frame the galaxy.
 * Rendered as a screen-space quad (NDC coordinates, no camera transform).
 */
export function Vignette() {
  const material = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    }),
    [],
  )

  return (
    <mesh renderOrder={-1} frustumCulled={false} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}
```

- [ ] **Step 2: Run all tests**

Run: `cd frontend && pnpm exec vitest run`
Expected: All tests pass (new file, no imports yet).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/star-map/Vignette.tsx
git commit -m "feat(frontend): add fullscreen radial vignette component"
```

---

### Task 4: SystemLabel Component

**Files:**
- Create: `frontend/src/components/star-map/SystemLabel.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/star-map/SystemLabel.tsx`:

```tsx
import { Html } from '@react-three/drei'

interface SystemLabelProps {
  readonly name: string
  readonly position: [number, number, number]
  readonly selected?: boolean
}

/**
 * HUD-style scanner label floating above a system.
 * Thin uppercase text with horizontal rules and a vertical connector line.
 */
export function SystemLabel({ name, position, selected }: SystemLabelProps) {
  return (
    <Html
      position={[position[0], position[1] + 2, position[2]]}
      center
      distanceFactor={40}
      style={{ pointerEvents: 'none' }}
    >
      <div className="system-label" data-selected={selected || undefined}>
        <div className="system-label-connector" />
        <div className="system-label-content">
          <span className="system-label-rule" />
          <span className="system-label-text">{name}</span>
          <span className="system-label-rule" />
        </div>
      </div>
    </Html>
  )
}
```

- [ ] **Step 2: Add CSS for the label**

In `frontend/src/index.css`, after the existing region tooltip styles (search for `.region-tooltip`), add:

```css
/* System scanner label — HUD readout style */
.system-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  opacity: 0;
  animation: system-label-in 0.15s ease-out forwards;
}

.system-label[data-selected] {
  animation: none;
  opacity: 1;
}

@keyframes system-label-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.system-label-connector {
  width: 1px;
  height: 12px;
  border-left: 1px dashed rgba(255, 140, 0, 0.19);
}

.system-label-content {
  display: flex;
  align-items: center;
  gap: 0;
  background: rgba(0, 0, 0, 0.8);
  padding: 3px 0;
}

.system-label-rule {
  display: inline-block;
  width: 20px;
  height: 1px;
  background: rgba(255, 140, 0, 0.25);
}

.system-label-text {
  color: #ffcc88;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 0 6px;
  white-space: nowrap;
}
```

- [ ] **Step 3: Run all tests**

Run: `cd frontend && pnpm exec vitest run`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/star-map/SystemLabel.tsx frontend/src/index.css
git commit -m "feat(frontend): add HUD-style system scanner label component"
```

---

### Task 4b: SystemBloom Component (Two-Layer Hover + Selection Pulse)

**Files:**
- Create: `frontend/src/components/star-map/SystemBloom.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/star-map/SystemBloom.tsx`:

```tsx
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

const GLOW_TEX_SIZE = 64

function createGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = GLOW_TEX_SIZE
  canvas.height = GLOW_TEX_SIZE
  const ctx = canvas.getContext('2d')!
  const half = GLOW_TEX_SIZE / 2
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.4)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, GLOW_TEX_SIZE, GLOW_TEX_SIZE)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

let _glowTex: THREE.CanvasTexture | null = null
function getGlowTexture() {
  if (!_glowTex) _glowTex = createGlowTexture()
  return _glowTex
}

interface SystemBloomProps {
  readonly position: [number, number, number]
  readonly mode: 'hover' | 'selected'
}

/**
 * Two-layer cinematic bloom for system hover/selection.
 *
 * Hover mode:
 *   - Inner glow: sharp, fades in fast (~100ms via opacity spring)
 *   - Outer halo: soft, fades in delayed (~150ms after inner)
 *
 * Selected mode:
 *   - Both layers persistent
 *   - Breathing pulse: opacity oscillates 0.6–1.0 at 1.5s period
 */
export function SystemBloom({ position, mode }: SystemBloomProps) {
  const glowTexture = useMemo(getGlowTexture, [])
  const innerRef = useRef<THREE.Sprite>(null)
  const outerRef = useRef<THREE.Sprite>(null)
  const startTime = useRef(performance.now())

  // Reset animation timer on mount
  useMemo(() => { startTime.current = performance.now() }, [position, mode])

  useFrame(({ clock }) => {
    const elapsed = (performance.now() - startTime.current) / 1000

    if (mode === 'hover') {
      // Inner: fade in over 0.1s
      const innerAlpha = Math.min(elapsed / 0.1, 1) * 0.8
      // Outer: delayed 0.15s, fade in over 0.15s
      const outerAlpha = Math.max(0, Math.min((elapsed - 0.15) / 0.15, 1)) * 0.3
      if (innerRef.current) innerRef.current.material.opacity = innerAlpha
      if (outerRef.current) outerRef.current.material.opacity = outerAlpha
    } else {
      // Selected: breathing pulse
      const pulse = 0.6 + Math.sin(clock.elapsedTime * (Math.PI * 2 / 1.5)) * 0.4
      if (innerRef.current) innerRef.current.material.opacity = pulse * 0.8
      if (outerRef.current) outerRef.current.material.opacity = pulse * 0.3
    }
  })

  // Inner glow: ~3x system dot size, sharp
  // Outer halo: ~8x system dot size, soft
  return (
    <group>
      <sprite ref={innerRef} position={position} scale={[1.5, 1.5, 1]}>
        <spriteMaterial
          map={glowTexture}
          color="#ffcc66"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={outerRef} position={position} scale={[4, 4, 1]}>
        <spriteMaterial
          map={glowTexture}
          color="#ff8800"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
    </group>
  )
}
```

- [ ] **Step 2: Run all tests**

Run: `cd frontend && pnpm exec vitest run`
Expected: All tests pass (new file, not imported yet).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/star-map/SystemBloom.tsx
git commit -m "feat(frontend): add two-layer cinematic bloom for hover + selection pulse"
```

---

## Chunk 3: GalaxyParticles Rewrite

### Task 5: Warm Amber GalaxyParticles with Flicker + Hover/Click Raycasting

**Files:**
- Modify: `frontend/src/components/star-map/GalaxyParticles.tsx`

This is a full rewrite of GalaxyParticles. The new version uses a custom `ShaderMaterial` for ambient flicker and adds `onPointerMove`/`onClick` handlers for system interaction.

- [ ] **Step 1: Rewrite GalaxyParticles**

Replace the entire content of `frontend/src/components/star-map/GalaxyParticles.tsx` with:

```tsx
import { useFrame, useThree, ThreeEvent } from '@react-three/fiber'
import { useCallback, useMemo, useRef } from 'react'
import * as THREE from 'three'

import type { GalaxySystem } from '../../lib/galaxy-data'

// Warm amber palette
const AMBER_R = 1.0, AMBER_G = 0.702, AMBER_B = 0.278  // #ffb347

const DOT_TEX_SIZE = 32

const VERT = `
uniform float uTime;
attribute float aPhase;
varying float vBrightness;
varying vec2 vUv;

void main() {
  vBrightness = 1.0 + sin(uTime * 0.8 + aPhase) * 0.02;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = 50.0 * (1.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`

const FRAG = `
uniform sampler2D uDotTex;
uniform vec3 uColor;
varying float vBrightness;

void main() {
  vec4 tex = texture2D(uDotTex, gl_PointCoord);
  gl_FragColor = vec4(uColor * vBrightness, tex.a * 0.5);
}
`

function createDotTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = DOT_TEX_SIZE
  canvas.height = DOT_TEX_SIZE
  const ctx = canvas.getContext('2d')!
  const half = DOT_TEX_SIZE / 2
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.6)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, DOT_TEX_SIZE, DOT_TEX_SIZE)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

let _dotTexture: THREE.CanvasTexture | null = null
function getDotTexture() {
  if (!_dotTexture) _dotTexture = createDotTexture()
  return _dotTexture
}

/** Throttle helper — returns true if enough time has passed. */
function useThrottle(ms: number) {
  const lastRef = useRef(0)
  return useCallback(() => {
    const now = performance.now()
    if (now - lastRef.current < ms) return false
    lastRef.current = now
    return true
  }, [ms])
}

interface GalaxyParticlesProps {
  readonly systems: readonly GalaxySystem[]
  readonly onSystemHover: (system: GalaxySystem | null) => void
  readonly onSystemClick: (system: GalaxySystem) => void
}

/**
 * All ~24K systems as warm amber dots with ambient flicker.
 * Custom ShaderMaterial for per-vertex brightness variation.
 * Hover/click raycasting with 50ms throttle.
 */
export function GalaxyParticles({ systems, onSystemHover, onSystemClick }: GalaxyParticlesProps) {
  const dotTexture = useMemo(getDotTexture, [])
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const { raycaster } = useThree()
  const shouldFire = useThrottle(50)

  // Set raycaster threshold for points
  useMemo(() => {
    raycaster.params.Points = { threshold: 0.5 }
  }, [raycaster])

  const [positions, phases] = useMemo(() => {
    const pos = new Float32Array(systems.length * 3)
    const ph = new Float32Array(systems.length)
    for (let i = 0; i < systems.length; i++) {
      const s = systems[i]!
      pos[i * 3] = s.x
      pos[i * 3 + 1] = s.y
      pos[i * 3 + 2] = s.z
      ph[i] = i * 0.37  // deterministic phase offset
    }
    return [pos, ph]
  }, [systems])

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uDotTex: { value: dotTexture },
    uColor: { value: new THREE.Color(AMBER_R, AMBER_G, AMBER_B) },
  }), [dotTexture])

  useFrame(({ clock }) => {
    if (materialRef.current) materialRef.current.uniforms.uTime!.value = clock.elapsedTime
  })

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!shouldFire()) return
    const idx = e.index
    if (idx !== undefined && idx >= 0 && idx < systems.length)
      onSystemHover(systems[idx]!)
    else
      onSystemHover(null)
  }, [systems, onSystemHover, shouldFire])

  const handlePointerLeave = useCallback(() => {
    onSystemHover(null)
  }, [onSystemHover])

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    const idx = e.index
    if (idx !== undefined && idx >= 0 && idx < systems.length) {
      e.stopPropagation()
      onSystemClick(systems[idx]!)
    }
  }, [systems, onSystemClick])

  return (
    <points
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
    >
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}
```

- [ ] **Step 2: Run all tests**

Run: `cd frontend && pnpm exec vitest run`
Expected: Tests may fail if StarMapScene imports changed — that's OK, we'll fix StarMapScene in Task 8.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/star-map/GalaxyParticles.tsx
git commit -m "feat(frontend): rewrite GalaxyParticles — warm amber, flicker shader, hover/click raycasting"
```

---

## Chunk 4: RegionClouds

### Task 6: RegionClouds Component (replaces IntelNebula)

**Files:**
- Create: `frontend/src/components/star-map/RegionClouds.tsx`

- [ ] **Step 1: Create RegionClouds**

Create `frontend/src/components/star-map/RegionClouds.tsx`:

```tsx
import { useMemo } from 'react'
import * as THREE from 'three'

import { noise2D } from '../../lib/noise'
import { hullCentroid, hullRadius } from '../../lib/hull'
import { INTEL_TYPE_COLORS_NEON } from '../../lib/constants'
import type { RegionHeatData } from '../../lib/region-data'

const NOISE_TEX_SIZE = 256
const BASE_OPACITY = 0.18
const OPACITY_RANGE = 0.27
const MIN_FLOOR = 10
const NOISE_AMPLITUDE = 0.8

/** Simple string hash for deterministic noise seed per region. */
function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Generate a noise-distorted radial gradient texture for a cloud. */
function createCloudTexture(seed: number, opacity: number, color: THREE.Color): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = NOISE_TEX_SIZE
  canvas.height = NOISE_TEX_SIZE
  const ctx = canvas.getContext('2d')!
  const imgData = ctx.createImageData(NOISE_TEX_SIZE, NOISE_TEX_SIZE)
  const half = NOISE_TEX_SIZE / 2

  const r = Math.round(color.r * 255)
  const g = Math.round(color.g * 255)
  const b = Math.round(color.b * 255)
  const seedOffset = seed * 13.37

  for (let y = 0; y < NOISE_TEX_SIZE; y++) {
    for (let x = 0; x < NOISE_TEX_SIZE; x++) {
      const dx = (x - half) / half
      const dy = (y - half) / half
      const dist = Math.sqrt(dx * dx + dy * dy)

      // Radial gradient falloff
      const radial = 1 - Math.min(dist, 1)
      const gradientAlpha = radial * radial * opacity

      // Perlin noise distortion
      const nx = (x / NOISE_TEX_SIZE) * 3 + seedOffset
      const ny = (y / NOISE_TEX_SIZE) * 3 + seedOffset
      const n = noise2D(nx, ny)
      const finalAlpha = gradientAlpha * (0.5 + n * NOISE_AMPLITUDE)

      const idx = (y * NOISE_TEX_SIZE + x) * 4
      imgData.data[idx] = r
      imgData.data[idx + 1] = g
      imgData.data[idx + 2] = b
      imgData.data[idx + 3] = Math.max(0, Math.min(255, finalAlpha * 255))
    }
  }

  ctx.putImageData(imgData, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

interface RegionCloudsProps {
  readonly regions: RegionHeatData[]
}

/**
 * Diffuse fog clouds over intel-active regions.
 * Each region gets a noise-distorted radial gradient sprite.
 * Color = dominant intel type. Opacity scales with listing density.
 */
export function RegionClouds({ regions }: RegionCloudsProps) {
  const clouds = useMemo(() => {
    return regions.map(region => {
      const center = hullCentroid(region.hull)
      if (!center) return null
      const { cx, cz } = center
      const radius = hullRadius(region.hull, cx, cz) + 3 // padding
      const opacity = BASE_OPACITY + Math.min(region.listingCount / MIN_FLOOR, 1) * OPACITY_RANGE
      const colorHex = INTEL_TYPE_COLORS_NEON[region.dominantType] ?? '#00e5ff'
      const color = new THREE.Color(colorHex)
      const seed = hashString(region.regionName)
      const texture = createCloudTexture(seed, opacity, color)
      return { key: region.regionName, cx, cz, radius, texture }
    }).filter(Boolean) as { key: string; cx: number; cz: number; radius: number; texture: THREE.CanvasTexture }[]
  }, [regions])

  return (
    <group>
      {clouds.map(({ key, cx, cz, radius, texture }) => (
        <sprite
          key={key}
          position={[cx, 0.5, cz]}
          scale={[radius * 2, radius * 2, 1]}
          renderOrder={-2}
        >
          <spriteMaterial
            map={texture}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
      ))}
    </group>
  )
}
```

- [ ] **Step 2: Run all tests**

Run: `cd frontend && pnpm exec vitest run`
Expected: All tests pass (new file, not imported by anything yet).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/star-map/RegionClouds.tsx
git commit -m "feat(frontend): add RegionClouds — noise-distorted diffuse fog per intel region"
```

---

## Chunk 5: StarMapScene Integration

### Task 7: StarMapScene Rewrite

**Files:**
- Modify: `frontend/src/components/star-map/StarMapScene.tsx`
- Modify: `frontend/src/App.tsx`

This wires everything together: removes HoloGrid/IntelNebula imports, adds RegionClouds/Vignette/SystemLabel/SystemBloom, manages hover/click state, uses shared hull utilities, and cleans up dead code.

**Important:** This task MUST be done BEFORE Task 8 (deleting HoloGrid/IntelNebula). The rewrite removes the imports first, then Task 8 safely deletes the orphaned files.

- [ ] **Step 1: Rewrite StarMapScene**

Replace the entire content of `frontend/src/components/star-map/StarMapScene.tsx` with:

```tsx
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import type { GalaxySystem } from '../../lib/galaxy-data'
import type { RegionHeatData } from '../../lib/region-data'
import { hullCentroid } from '../../lib/hull'
import { GalaxyParticles } from './GalaxyParticles'
import { StarField } from './StarField'
import { RegionClouds } from './RegionClouds'
import { RegionZone } from './RegionZone'
import { Vignette } from './Vignette'
import { SystemLabel } from './SystemLabel'
import { SystemBloom } from './SystemBloom'

interface StarMapSceneProps {
  readonly systems: readonly GalaxySystem[]
  readonly filteredRegions: RegionHeatData[]
  readonly panelOpen: boolean
  readonly onRegionClick: (regionName: string) => void
}

// ─── Pure utilities (exported for testing) ───────────────────────────────────

export function computeCentroid(
  systems: readonly { x: number; z: number }[],
): { cx: number; cz: number } | null {
  if (systems.length === 0) return null
  const cx = systems.reduce((s, sys) => s + sys.x, 0) / systems.length
  const cz = systems.reduce((s, sys) => s + sys.z, 0) / systems.length
  return { cx, cz }
}

// ─── Camera controllers (inside Canvas) ─────────────────────────────────────

function CameraAutoOrient({ centroid }: { centroid: { cx: number; cz: number } | null }) {
  const { camera, controls } = useThree()
  const oriented = useRef(false)

  useEffect(() => {
    if (oriented.current || !centroid || !controls) return
    camera.position.set(centroid.cx, 60, centroid.cz + 60)
    ;(controls as any).target?.set(centroid.cx, 0, centroid.cz)
    ;(controls as any).update?.()
    oriented.current = true
  }, [centroid, camera, controls])

  return null
}

const LERP_SPEED = 0.07
const ARRIVE_THRESHOLD_SQ = 0.01

function CameraFocus({ target }: { target: { cx: number; cz: number } | null }) {
  const { camera, controls } = useThree()
  const focusRef = useRef<{ cx: number; cz: number } | null>(null)

  useEffect(() => {
    focusRef.current = target
  }, [target])

  useFrame(() => {
    const focus = focusRef.current
    const ctrl = controls as any
    if (!focus || !ctrl?.target) return

    const offX = camera.position.x - ctrl.target.x
    const offY = camera.position.y - ctrl.target.y
    const offZ = camera.position.z - ctrl.target.z

    ctrl.target.x += (focus.cx - ctrl.target.x) * LERP_SPEED
    ctrl.target.z += (focus.cz - ctrl.target.z) * LERP_SPEED

    camera.position.set(ctrl.target.x + offX, ctrl.target.y + offY, ctrl.target.z + offZ)
    ctrl.update()

    const dx = focus.cx - ctrl.target.x
    const dz = focus.cz - ctrl.target.z
    if (dx * dx + dz * dz < ARRIVE_THRESHOLD_SQ) {
      ctrl.target.x = focus.cx
      ctrl.target.z = focus.cz
      camera.position.set(focus.cx + offX, ctrl.target.y + offY, focus.cz + offZ)
      ctrl.update()
      focusRef.current = null
    }
  })

  return null
}

const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth < 768

export function StarMapScene({
  systems,
  filteredRegions,
  panelOpen,
  onRegionClick,
}: StarMapSceneProps) {
  const [focusTarget, setFocusTarget] = useState<{ cx: number; cz: number } | null>(null)
  const [hoveredSystem, setHoveredSystem] = useState<GalaxySystem | null>(null)
  const [selectedSystem, setSelectedSystem] = useState<GalaxySystem | null>(null)

  // Centroid from regions with intel (for initial camera orientation)
  const centroid = useMemo(() => {
    const allHullPoints = filteredRegions.flatMap(r => r.hull.map(([x, z]) => ({ x, z })))
    return computeCentroid(allHullPoints)
  }, [filteredRegions])

  // Region centroids for camera focus on click
  const regionCentroids = useMemo(() => {
    const result = new Map<string, { cx: number; cz: number }>()
    for (const r of filteredRegions) {
      const c = hullCentroid(r.hull)
      if (c) result.set(r.regionName, c)
    }
    return result
  }, [filteredRegions])

  const handleRegionClick = useCallback((regionName: string) => {
    const c = regionCentroids.get(regionName)
    if (c) setFocusTarget(c)
    onRegionClick(regionName)
  }, [regionCentroids, onRegionClick])

  const handleSystemClick = useCallback((system: GalaxySystem) => {
    setSelectedSystem(prev => prev?.id === system.id ? null : system)
    handleRegionClick(system.region)
  }, [handleRegionClick])

  const handleSystemHover = useCallback((system: GalaxySystem | null) => {
    setHoveredSystem(system)
  }, [])

  // Escape key deselects
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedSystem(null)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const displaySystem = selectedSystem ?? hoveredSystem
  const bloomMode = selectedSystem ? 'selected' : hoveredSystem ? 'hover' : null

  return (
    <Canvas
      camera={{ position: [0, 60, 60], fov: 50 }}
      dpr={[1, 1.5]}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      flat
    >
      <ambientLight intensity={0.15} />
      <pointLight position={[0, 80, 0]} intensity={0.3} />

      <CameraAutoOrient centroid={centroid} />
      <CameraFocus target={focusTarget} />

      <Vignette />
      <StarField />

      <RegionClouds regions={filteredRegions} />

      {filteredRegions.map((r) => (
        <RegionZone
          key={r.regionName}
          data={r}
          onClick={handleRegionClick}
        />
      ))}

      {!IS_MOBILE && systems.length > 0 && (
        <GalaxyParticles
          systems={systems}
          onSystemHover={handleSystemHover}
          onSystemClick={handleSystemClick}
        />
      )}

      {displaySystem && bloomMode && (
        <SystemBloom
          position={[displaySystem.x, displaySystem.y, displaySystem.z]}
          mode={bloomMode}
        />
      )}

      {displaySystem && (
        <SystemLabel
          name={displaySystem.name}
          position={[displaySystem.x, displaySystem.y, displaySystem.z]}
          selected={selectedSystem?.id === displaySystem.id}
        />
      )}

      <OrbitControls
        makeDefault
        enabled={!panelOpen}
        enablePan
        maxDistance={150}
        minDistance={5}
        enableDamping
        dampingFactor={0.05}
        maxPolarAngle={Math.PI / 2.2}
        mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
      />

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.6}
          intensity={0.4}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  )
}
```

- [ ] **Step 2: Update App.tsx**

In `frontend/src/App.tsx`, remove the `systemHeats` prop from the `StarMapScene` JSX (line ~192):

Replace:
```tsx
        <StarMapScene
          systems={galaxy?.systems ?? []}
          filteredRegions={filteredRegionData}
          systemHeats={heatMap.systems}
          panelOpen={panel.kind !== 'none'}
          onRegionClick={(name) => {
```

With:
```tsx
        <StarMapScene
          systems={galaxy?.systems ?? []}
          filteredRegions={filteredRegionData}
          panelOpen={panel.kind !== 'none'}
          onRegionClick={(name) => {
```

- [ ] **Step 3: Update tests**

In `frontend/src/components/star-map/star-map-scene.test.ts`, remove the `hullCentroid` import (it's now in `hull.ts` with its own tests) and keep only `computeCentroid` tests:

```typescript
import { computeCentroid } from './StarMapScene'

// ... existing computeCentroid tests unchanged ...

describe('hullCentroid', () => {
  it('returns null for empty hull', () => {
    expect(hullCentroid([])).toBeNull()
  })

  it('returns centroid of hull vertices', () => {
    const result = hullCentroid([[0, 0], [10, 0], [10, 10], [0, 10]])
    expect(result!.cx).toBeCloseTo(5)
    expect(result!.cz).toBeCloseTo(5)
  })
})
```

- [ ] **Step 4: Run all tests**

Run: `cd frontend && pnpm exec vitest run`
Expected: All tests pass.

- [ ] **Step 5: TypeScript check**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/star-map/StarMapScene.tsx
git add frontend/src/components/star-map/star-map-scene.test.ts
git add frontend/src/App.tsx
git commit -m "feat(frontend): integrate warm amber star map — region clouds, vignette, hover/click"
```

---

### Task 8: Delete HoloGrid and IntelNebula

**Files:**
- Delete: `frontend/src/components/star-map/HoloGrid.tsx`
- Delete: `frontend/src/components/star-map/IntelNebula.tsx`

These files are no longer imported by anything after the StarMapScene rewrite in Task 7.

- [ ] **Step 1: Delete the files**

```bash
rm frontend/src/components/star-map/HoloGrid.tsx
rm frontend/src/components/star-map/IntelNebula.tsx
```

- [ ] **Step 2: Run all tests**

Run: `cd frontend && pnpm exec vitest run`
Expected: All tests pass (no imports reference these files).

- [ ] **Step 3: Commit**

```bash
git add -u frontend/src/components/star-map/HoloGrid.tsx frontend/src/components/star-map/IntelNebula.tsx
git commit -m "chore(frontend): remove HoloGrid and IntelNebula (replaced by warm amber + region clouds)"
```

---

## Chunk 6: Cleanup + Documentation

### Task 9: Final Cleanup

**Files:**
- Modify: various (if needed)

- [ ] **Step 1: Run all tests**

Run: `cd frontend && pnpm exec vitest run`
Expected: All tests pass.

- [ ] **Step 2: TypeScript check**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Visual verification**

Run: `cd frontend && pnpm dev`
Open http://localhost:5173 and verify:
- Warm gold UI accents (panels, borders, buttons)
- Warm amber star dots (all 24K uniform, subtle flicker)
- Diffuse region clouds over intel areas (noise-distorted, colored by type)
- Hover: two-layer bloom + scanner label on any system
- Click: persistent bloom pulse + RegionPanel opens
- Escape: deselects
- No HoloGrid visible
- Subtle vignette darkening at corners
- StarField ambient particles still visible
- Bloom post-processing working

- [ ] **Step 4: Update documentation**

Update `CLAUDE.md` and `README.md`:
- Note the star map visual upgrade
- Update any references to "cyan" accent color

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: update project documentation for star map visual upgrade"
```

---

## Post-Implementation

### Test Count Summary

| Suite | Before | After |
|-------|--------|-------|
| Frontend (Vitest) | ~235 | ~245 (~235 + noise tests + hull tests) |

### Files Created
- `frontend/src/lib/noise.ts` — 2D Perlin noise function
- `frontend/src/lib/noise.test.ts` — Noise unit tests
- `frontend/src/lib/hull.ts` — Shared hull centroid + radius utilities
- `frontend/src/lib/hull.test.ts` — Hull utility tests
- `frontend/src/components/star-map/RegionClouds.tsx` — Noise-distorted fog per region
- `frontend/src/components/star-map/Vignette.tsx` — Fullscreen radial vignette
- `frontend/src/components/star-map/SystemLabel.tsx` — HUD scanner label
- `frontend/src/components/star-map/SystemBloom.tsx` — Two-layer cinematic hover/selection bloom

### Files Deleted
- `frontend/src/components/star-map/HoloGrid.tsx`
- `frontend/src/components/star-map/IntelNebula.tsx`

### Files Modified
- `frontend/src/index.css` — Palette warm-shift
- `frontend/src/components/star-map/GalaxyParticles.tsx` — Full rewrite
- `frontend/src/components/star-map/StarMapScene.tsx` — Integration rewrite
- `frontend/src/components/star-map/star-map-scene.test.ts` — New tests
- `frontend/src/App.tsx` — Remove systemHeats prop

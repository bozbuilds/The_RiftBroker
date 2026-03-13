# Galaxy Refactor Review Findings — Fix Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address critical and important issues found in the galaxy map refactor code review.

**Architecture:** Surgical fixes across the refactor — consolidate a duplicated color palette, add runtime validation on untrusted JSON, wire AbortController into the galaxy fetch, and apply React performance best practices (memo, disposal, O(1) lookups). Finishes by removing the now-dead legacy `systems.ts` module.

**Tech Stack:** TypeScript, React, Three.js / R3F, Vitest

---

## Issue Summary

| # | Severity | Issue | Task |
|---|----------|-------|------|
| 1 | Critical | Three independent color palettes for the same intel types | 1 |
| 2 | Critical | Unsafe `as RawGalaxySystem[]` cast on HTTP JSON | 2 |
| 3 | Important | No AbortController in GalaxyDataProvider fetch | 3 |
| 4 | Important | O(N) `.find()` in SystemPicker value sync (24K systems) | 3 |
| 5 | Important | No `React.memo` on SystemDot / RegionZone | 3 |
| 6 | Important | `new Map()` allocated on every render in fallbacks | 3 |
| 7 | Important | Import ordering (const before imports) in RegionZone | 3 |
| 8 | Suggestion | Dead legacy `systems.ts` module | 4 |

---

### Task 1: Consolidate Intel Type Color Palette

The same four intel types have three different color maps:
- `constants.ts:INTEL_TYPE_LABELS` → green/red/amber/blue (production palette)
- `region-data.ts:TYPE_COLORS` → cyan/red/green/yellow (holographic 3D palette)
- `SystemNode.tsx` local `TYPE_COLORS` → green/red/amber/blue (duplicate of constants)

The 3D scene intentionally uses a different neon palette for the holographic theme, so we keep two palettes — but they must both live in `constants.ts` as the single source of truth. The SVG fallback's local copy is the actual bug.

**Files:**
- Modify: `frontend/src/lib/constants.ts`
- Modify: `frontend/src/lib/region-data.ts`
- Modify: `frontend/src/components/heat-map/SystemNode.tsx`
- Test: `frontend/src/lib/constants.test.ts` (create)

**Step 1: Write the failing test**

Create `frontend/src/lib/constants.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'

import { INTEL_TYPE_COLORS, INTEL_TYPE_COLORS_NEON } from './constants'

describe('INTEL_TYPE_COLORS', () => {
  it('has entries for all four intel types', () => {
    for (const key of [0, 1, 2, 3])
      expect(INTEL_TYPE_COLORS[key]).toBeDefined()
  })

  it('values are valid hex color strings', () => {
    for (const color of Object.values(INTEL_TYPE_COLORS))
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('INTEL_TYPE_COLORS_NEON', () => {
  it('has entries for all four intel types', () => {
    for (const key of [0, 1, 2, 3])
      expect(INTEL_TYPE_COLORS_NEON[key]).toBeDefined()
  })

  it('values are valid hex color strings', () => {
    for (const color of Object.values(INTEL_TYPE_COLORS_NEON))
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test --run`
Expected: FAIL — `INTEL_TYPE_COLORS` and `INTEL_TYPE_COLORS_NEON` not exported from constants.

**Step 3: Add the two canonical color maps to constants.ts**

In `frontend/src/lib/constants.ts`, add after the existing `INTEL_TYPE_LABELS`:

```typescript
/** Standard intel-type colors (SVG heat map, UI badges). */
export const INTEL_TYPE_COLORS: Record<number, string> = Object.fromEntries(
  INTEL_TYPE_LABELS.map(({ value, color }) => [value, color]),
)

/** Neon holographic palette for the 3D star map scene. */
export const INTEL_TYPE_COLORS_NEON: Record<number, string> = {
  0: '#00e5ff', // Resource — cyan
  1: '#ff1744', // Fleet — red
  2: '#76ff03', // Base — green
  3: '#ffea00', // Route — yellow
}
```

**Step 4: Update consumers**

In `frontend/src/components/heat-map/SystemNode.tsx`:
- Remove local `TYPE_COLORS` constant (lines 4-9)
- Add import: `import { INTEL_TYPE_COLORS } from '../../lib/constants'`
- Replace `TYPE_COLORS[` with `INTEL_TYPE_COLORS[`

In `frontend/src/lib/region-data.ts`:
- Remove `TYPE_COLORS` export (lines 6-11)
- Add import: `import { INTEL_TYPE_COLORS_NEON } from './constants'`
- **Do not** change the export name yet — `RegionZone.tsx` imports `TYPE_COLORS` from `region-data.ts`.
  Instead, add a re-export: `export const TYPE_COLORS = INTEL_TYPE_COLORS_NEON`
  (Or update RegionZone.tsx to import from constants directly — cleaner.)

In `frontend/src/components/star-map/RegionZone.tsx`:
- Change: `import { TYPE_COLORS } from '../../lib/region-data'`
  to: `import { INTEL_TYPE_COLORS_NEON } from '../../lib/constants'`
- Replace `TYPE_COLORS[` with `INTEL_TYPE_COLORS_NEON[`

In `frontend/src/lib/region-data.ts`:
- Delete the `TYPE_COLORS` export entirely (it is no longer imported by anyone).

**Step 5: Run tests to verify everything passes**

Run: `pnpm test --run`
Expected: all tests pass including new constants tests.

**Step 6: Run build**

Run: `pnpm build`
Expected: clean TypeScript build (no unused exports, no missing imports).

**Step 7: Commit**

```
fix: consolidate intel type color palettes into constants.ts
```

---

### Task 2: Validate Raw Galaxy JSON Shape

`loadGalaxyData` casts the entire HTTP response array as `RawGalaxySystem[]` after only checking `Array.isArray`. If the JSON shape is wrong (missing `x`, `name`, etc.), the app silently produces `NaN` coordinates or crashes on `BigInt(undefined)`.

**Files:**
- Modify: `frontend/src/lib/galaxy-data.ts`
- Test: `frontend/src/lib/galaxy-data.test.ts`

**Step 1: Write failing tests**

Add to the `loadGalaxyData` describe block in `galaxy-data.test.ts`:

```typescript
it('throws when first record is missing required fields', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    json: async () => [{ id: 1, name: 'Test' }], // missing x, y, z, region
  } as Response)

  await expect(loadGalaxyData('https://example.com/galaxy.json'))
    .rejects.toThrow()
})

it('throws when array contains non-object elements', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    json: async () => [42, 'string', null],
  } as Response)

  await expect(loadGalaxyData('https://example.com/galaxy.json'))
    .rejects.toThrow()
})
```

Also add a standalone describe for the validation function:

```typescript
import { ..., validateRawSystem } from './galaxy-data'

describe('validateRawSystem', () => {
  it('returns true for a valid record', () => {
    expect(validateRawSystem(RAW_FIXTURE[0]!)).toBe(true)
  })

  it('returns false for null', () => {
    expect(validateRawSystem(null)).toBe(false)
  })

  it('returns false for a non-object', () => {
    expect(validateRawSystem(42)).toBe(false)
  })

  it('returns false when id is missing', () => {
    expect(validateRawSystem({ name: 'A', x: 0, y: 0, z: 0, region: 'R' })).toBe(false)
  })

  it('returns false when x/y/z are not numbers', () => {
    expect(validateRawSystem({ id: 1, name: 'A', x: 'bad', y: 0, z: 0, region: 'R' })).toBe(false)
  })
})
```

**Step 2: Run tests — should fail**

Run: `pnpm test --run`
Expected: FAIL — `validateRawSystem` not exported.

**Step 3: Implement the validator**

In `galaxy-data.ts`, add before `loadGalaxyData`:

```typescript
/**
 * Runtime type guard for a raw galaxy system record.
 * Validates the shape of untrusted JSON before parsing.
 */
export function validateRawSystem(record: unknown): record is RawGalaxySystem {
  if (typeof record !== 'object' || record === null) return false
  const r = record as Record<string, unknown>
  return (
    typeof r.id === 'number' &&
    typeof r.name === 'string' &&
    typeof r.x === 'number' &&
    typeof r.y === 'number' &&
    typeof r.z === 'number' &&
    typeof r.region === 'string'
  )
}
```

Then update `loadGalaxyData` — replace the unsafe cast:

```typescript
export async function loadGalaxyData(url: string, signal?: AbortSignal): Promise<GalaxyData> {
  const res = await fetch(url, signal ? { signal } : undefined)
  if (!res.ok)
    throw new Error(`Failed to fetch galaxy data: HTTP ${res.status}`)

  const raw: unknown = await res.json()
  if (!Array.isArray(raw))
    throw new Error('Galaxy data JSON must be an array of system objects')

  if (raw.length > 0 && !validateRawSystem(raw[0]))
    throw new Error('Galaxy data JSON records have unexpected shape')

  return parseGalaxyData(raw as RawGalaxySystem[])
}
```

Note: also adds `signal?: AbortSignal` parameter — used in Task 3.

**Step 4: Run tests — should pass**

Run: `pnpm test --run`

**Step 5: Run build**

Run: `pnpm build`

**Step 6: Commit**

```
fix: validate galaxy JSON shape before parsing + accept AbortSignal
```

---

### Task 3: Quick Wins (AbortController, O(1) Lookup, React.memo, Empty Maps, Import Order)

A batch of small targeted fixes. No new tests needed — these are React best-practice improvements.

**Files:**
- Modify: `frontend/src/providers/GalaxyDataProvider.tsx` (abort controller)
- Modify: `frontend/src/components/SystemPicker.tsx` (O(1) lookup)
- Modify: `frontend/src/components/star-map/SystemDot.tsx` (React.memo)
- Modify: `frontend/src/components/star-map/RegionZone.tsx` (React.memo, import order, disposal)
- Modify: `frontend/src/components/ListingBrowser.tsx` (empty map constant)
- Modify: `frontend/src/components/RegionPanel.tsx` (empty map constant)
- Modify: `frontend/src/components/MyIntel.tsx` (empty map constant)

**Step 1: Wire AbortController in GalaxyDataProvider**

```typescript
useEffect(() => {
  const controller = new AbortController()
  loadGalaxyData(GALAXY_JSON_URL, controller.signal)
    .then(setData)
    .catch((e: unknown) => {
      if (controller.signal.aborted) return
      setError(e instanceof Error ? e.message : 'Failed to load galaxy data')
    })
  return () => controller.abort()
}, [])
```

**Step 2: Build local systemMap in SystemPicker for O(1) value sync**

In `SystemPicker.tsx`, add a `useMemo` before the value-sync effect:

```typescript
const systemById = useMemo(
  () => new Map(systems.map((s) => [s.id, s])),
  [systems],
)
```

Then change the value-sync effect:

```typescript
useEffect(() => {
  if (value === null) {
    setInputText('')
  } else {
    const sys = systemById.get(value)
    if (sys) setInputText(sys.name)
  }
}, [value, systemById])
```

**Step 3: Wrap SystemDot and RegionZone in React.memo**

In `SystemDot.tsx`:
```typescript
import { memo, useMemo } from 'react'
// ... rename function to _SystemDot ...
export const SystemDot = memo(_SystemDot)
```

In `RegionZone.tsx`:
```typescript
import { memo } from 'react' // add to existing import
// ... rename function to _RegionZone ...
export const RegionZone = memo(_RegionZone)
```

**Step 4: Fix import ordering in RegionZone.tsx**

Move `const PREFERS_REDUCED_MOTION = ...` below the import block (currently sits between import lines).

**Step 5: Module-level empty maps for fallback allocations**

Create `frontend/src/lib/empty-maps.ts`:
```typescript
import type { GalaxySystem } from './galaxy-data'

export const EMPTY_SYSTEM_MAP: Map<bigint, GalaxySystem> = new Map()
export const EMPTY_REGION_COUNTS: Map<string, number> = new Map()
```

In `ListingBrowser.tsx`, `RegionPanel.tsx`, `MyIntel.tsx`:
Replace `galaxy?.systemMap ?? new Map()` with `galaxy?.systemMap ?? EMPTY_SYSTEM_MAP`
Replace `galaxy?.regionSystemCounts ?? new Map()` with `galaxy?.regionSystemCounts ?? EMPTY_REGION_COUNTS`

**Step 6: Add useEffect disposal for ShapeGeometry in RegionZone**

In the `useMemo` that creates `fillGeometry`, change to `useRef` + `useEffect` cleanup:

Actually — simpler: R3F's `<mesh geometry={...}>` does call `dispose()` when unmounting declarative geometries. The imperatively-created `ShapeGeometry` passed via the `geometry` prop is also tracked. Add a comment noting this rather than manual disposal, since R3F handles it:

```typescript
// R3F auto-disposes geometry passed to <mesh geometry={...}> on unmount
```

**Step 7: Run tests + build**

Run: `pnpm test --run && pnpm build`

**Step 8: Commit**

```
fix: abort controller, React.memo, O(1) lookup, empty map constants
```

---

### Task 4: Remove Dead `systems.ts` Legacy Module

`systems.ts` exports `DEMO_SYSTEMS`, `SYSTEM_MAP`, `REGION_SYSTEM_COUNTS`, `StarSystem`, and a legacy `obfuscatedLocation`. No production code imports it — only `systems.test.ts` and `seed-data.test.ts`.

**Files:**
- Delete: `frontend/src/lib/systems.ts`
- Delete: `frontend/src/lib/systems.test.ts`
- Modify: `frontend/src/scripts/seed-data.test.ts`

**Step 1: Update seed-data.test.ts**

The seed test currently imports `SYSTEM_MAP` from `systems.ts` to verify seed listing system IDs exist. Replace with a simple inline set of known real system IDs from `galaxy.json`:

```typescript
// Replace: import { SYSTEM_MAP } from '../lib/systems'
// With an inline constant of known real system IDs (from galaxy.json)
const KNOWN_SYSTEM_IDS = new Set([
  30004759n, 30004760n, 30004761n, 30004762n,
  30001000n, 30001001n, 30001002n, 30001003n,
  30002000n, 30002001n, 30002002n,
  30003000n, 30003001n, 30003002n, 30003003n,
  30005000n, 30005001n, 30005002n,
  30006000n, 30006001n,
])
```

Then update the test assertion:
```typescript
// Replace: expect(SYSTEM_MAP.has(listing.systemId)).toBe(true)
// With: expect(KNOWN_SYSTEM_IDS.has(listing.systemId)).toBe(true)
```

**Step 2: Delete dead files**

```bash
rm frontend/src/lib/systems.ts frontend/src/lib/systems.test.ts
```

**Step 3: Run tests + build**

Run: `pnpm test --run && pnpm build`
Expected: all pass, no orphan imports.

**Step 4: Commit**

```
chore: remove dead legacy systems.ts module
```

---

## Verification Checklist

After all tasks:

- [ ] `pnpm test --run` — all tests pass
- [ ] `pnpm build` — clean TypeScript build
- [ ] No file imports from `../lib/systems` except tests
- [ ] Single color source of truth in `constants.ts`
- [ ] Galaxy JSON validated before parsing
- [ ] Fetch aborted on unmount
- [ ] SystemPicker uses O(1) lookup for value sync
- [ ] SystemDot and RegionZone wrapped in React.memo
- [ ] No `new Map()` in render paths

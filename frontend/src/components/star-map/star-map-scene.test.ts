import { describe, expect, it } from 'vitest'

import { computeCentroid } from './StarMapScene'

// ─── computeCentroid ────────────────────────────────────────────────────────
// Returns the geometric center (X, Z) of a set of scene-space positions.
// Used to orient the camera toward active intel on first load.

describe('computeCentroid', () => {
  it('returns null for an empty array', () => {
    expect(computeCentroid([])).toBeNull()
  })

  it('returns the exact position for a single system', () => {
    expect(computeCentroid([{ x: 10, z: -5 }])).toEqual({ cx: 10, cz: -5 })
  })

  it('returns (0, 0) for two opposite systems', () => {
    const result = computeCentroid([
      { x: -10, z: 0 },
      { x: 10, z: 0 },
    ])
    expect(result!.cx).toBeCloseTo(0)
    expect(result!.cz).toBeCloseTo(0)
  })

  it('returns the average x and z independently', () => {
    const result = computeCentroid([
      { x: 0, z: 0 },
      { x: 30, z: -30 },
    ])
    expect(result!.cx).toBeCloseTo(15)
    expect(result!.cz).toBeCloseTo(-15)
  })

  it('handles systems at the origin', () => {
    expect(computeCentroid([{ x: 0, z: 0 }])).toEqual({ cx: 0, cz: 0 })
  })

  it('computes centroid symmetrically for a square arrangement', () => {
    const result = computeCentroid([
      { x: -20, z: -20 },
      { x: 20, z: -20 },
      { x: -20, z: 20 },
      { x: 20, z: 20 },
    ])
    expect(result!.cx).toBeCloseTo(0)
    expect(result!.cz).toBeCloseTo(0)
  })

  it('handles negative-only coordinates', () => {
    const result = computeCentroid([
      { x: -40, z: -10 },
      { x: -20, z: -30 },
    ])
    expect(result!.cx).toBeCloseTo(-30)
    expect(result!.cz).toBeCloseTo(-20)
  })

  it('returns non-null for any non-empty array', () => {
    for (let n = 1; n <= 5; n++) {
      const systems = Array.from({ length: n }, (_, i) => ({ x: i * 5, z: -i * 3 }))
      expect(computeCentroid(systems)).not.toBeNull()
    }
  })
})

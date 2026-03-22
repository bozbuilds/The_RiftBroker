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

import { describe, expect, test } from 'vitest'

import type { GalaxySystem } from './galaxy-data'
import type { SystemHeatData } from './heat-map-data'
import { aggregateByRegion, convexHull2D, TYPE_COLORS } from './region-data'

function makeSystem(overrides: Partial<GalaxySystem> = {}): GalaxySystem {
  return {
    id: 30004759n,
    name: 'G-M4GK',
    x: 0,
    y: 0,
    z: 0,
    rawX: 0,
    rawY: 0,
    rawZ: 0,
    region: 'Core',
    regionId: null,
    ...overrides,
  }
}

function makeHeat(overrides: Partial<SystemHeatData> = {}): SystemHeatData {
  return {
    systemId: 30004759n,
    listingCount: 1,
    dominantType: 0,
    freshness: 0.8,
    avgPrice: 1_000_000n,
    listings: [],
    ...overrides,
  }
}

describe('TYPE_COLORS', () => {
  test('has a color for each intel type', () => {
    expect(TYPE_COLORS[0]).toBeDefined()
    expect(TYPE_COLORS[1]).toBeDefined()
    expect(TYPE_COLORS[2]).toBeDefined()
    expect(TYPE_COLORS[3]).toBeDefined()
  })

  test('colors are valid hex strings', () => {
    for (const color of Object.values(TYPE_COLORS))
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
})

describe('convexHull2D', () => {
  test('returns empty for empty input', () => {
    expect(convexHull2D([])).toEqual([])
  })

  test('returns single point for one input', () => {
    expect(convexHull2D([[5, 3]])).toEqual([[5, 3]])
  })

  test('returns both points for two inputs', () => {
    const result = convexHull2D([[0, 0], [1, 1]])
    expect(result).toHaveLength(2)
  })

  test('returns triangle for three non-collinear points', () => {
    const result = convexHull2D([[0, 0], [4, 0], [2, 3]])
    expect(result).toHaveLength(3)
  })

  test('excludes interior points', () => {
    // Square with a center point
    const points: [number, number][] = [
      [0, 0], [10, 0], [10, 10], [0, 10], [5, 5],
    ]
    const hull = convexHull2D(points)
    expect(hull).toHaveLength(4)
    // Center point should not be in the hull
    expect(hull.some(([x, y]) => x === 5 && y === 5)).toBe(false)
  })

  test('handles collinear points', () => {
    const result = convexHull2D([[0, 0], [1, 1], [2, 2]])
    expect(result.length).toBeLessThanOrEqual(3)
    expect(result.length).toBeGreaterThanOrEqual(2)
  })
})

describe('aggregateByRegion', () => {
  test('returns empty array for no data', () => {
    const result = aggregateByRegion([], [])
    expect(result).toEqual([])
  })

  test('groups systems by region name', () => {
    const systems = [
      makeSystem({ id: 1n, region: 'Core', x: 0, z: 0 }),
      makeSystem({ id: 2n, region: 'Core', x: 5, z: 5 }),
      makeSystem({ id: 3n, region: 'North Frontier', x: 20, z: 20 }),
    ]
    const heats = [
      makeHeat({ systemId: 1n, listingCount: 2 }),
      makeHeat({ systemId: 2n, listingCount: 1 }),
      makeHeat({ systemId: 3n, listingCount: 3 }),
    ]
    const result = aggregateByRegion(heats, systems)
    expect(result).toHaveLength(2)

    const core = result.find((r) => r.regionName === 'Core')
    const north = result.find((r) => r.regionName === 'North Frontier')
    expect(core?.listingCount).toBe(3)
    expect(north?.listingCount).toBe(3)
  })

  test('computes dominant type across region', () => {
    const systems = [
      makeSystem({ id: 1n, region: 'Core' }),
      makeSystem({ id: 2n, region: 'Core' }),
    ]
    const heats = [
      makeHeat({ systemId: 1n, dominantType: 0, listingCount: 1 }),
      makeHeat({ systemId: 2n, dominantType: 1, listingCount: 3 }),
    ]
    const result = aggregateByRegion(heats, systems)
    // Type 1 has more listings, so it dominates
    expect(result[0]!.dominantType).toBe(1)
  })

  test('computes regional freshness as max of system freshnesses', () => {
    const systems = [
      makeSystem({ id: 1n, region: 'Core' }),
      makeSystem({ id: 2n, region: 'Core' }),
    ]
    const heats = [
      makeHeat({ systemId: 1n, freshness: 0.3 }),
      makeHeat({ systemId: 2n, freshness: 0.9 }),
    ]
    const result = aggregateByRegion(heats, systems)
    expect(result[0]!.freshness).toBe(0.9)
  })

  test('computes convex hull from system x/z scene-space positions', () => {
    // Three non-collinear points in XZ plane
    const systems = [
      makeSystem({ id: 1n, region: 'Core', x: 0, z: -10 }),
      makeSystem({ id: 2n, region: 'Core', x: 10, z: 0 }),
      makeSystem({ id: 3n, region: 'Core', x: -10, z: 0 }),
    ]
    const heats = [
      makeHeat({ systemId: 1n }),
      makeHeat({ systemId: 2n }),
      makeHeat({ systemId: 3n }),
    ]
    const result = aggregateByRegion(heats, systems)
    // Three non-collinear points → triangle hull
    expect(result[0]!.hull).toHaveLength(3)
  })

  test('handles region with single system (hull is a point)', () => {
    const systems = [
      makeSystem({ id: 1n, region: 'Solo', x: 5, y: 0, z: 5 }),
    ]
    const heats = [makeHeat({ systemId: 1n })]
    const result = aggregateByRegion(heats, systems)
    expect(result[0]!.hull).toHaveLength(1)
  })

  test('skips systems with no heat data', () => {
    const systems = [
      makeSystem({ id: 1n, region: 'Core' }),
      makeSystem({ id: 2n, region: 'Core' }),
    ]
    // Only one system has heat data
    const heats = [makeHeat({ systemId: 1n })]
    const result = aggregateByRegion(heats, systems)
    expect(result).toHaveLength(1)
    expect(result[0]!.systemIds).toEqual([1n])
  })

  test('sorts by listing count descending', () => {
    const systems = [
      makeSystem({ id: 1n, region: 'Alpha' }),
      makeSystem({ id: 2n, region: 'Beta' }),
    ]
    const heats = [
      makeHeat({ systemId: 1n, listingCount: 1 }),
      makeHeat({ systemId: 2n, listingCount: 5 }),
    ]
    const result = aggregateByRegion(heats, systems)
    expect(result[0]!.regionName).toBe('Beta')
    expect(result[1]!.regionName).toBe('Alpha')
  })
})

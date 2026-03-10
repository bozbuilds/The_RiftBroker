import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GalaxyData, RawGalaxySystem, loadGalaxyData, normalizeCoordinates, obfuscatedLocation, parseGalaxyData } from './galaxy-data'

// Minimal fixture — 3 systems across 2 regions
const RAW_FIXTURE: RawGalaxySystem[] = [
  { id: 30004759, name: 'UK4-GH8',  x: -5.335e18, y: -4.625e17, z:  2.159e18, regionId: 10000040, region: 'N.6K1.K5D' },
  { id: 30004760, name: 'E-VKJV',   x: -5.300e18, y: -4.500e17, z:  2.100e18, regionId: 10000040, region: 'N.6K1.K5D' },
  { id: 34000120, name: 'V-120',     x: -5.533e18, y:  3.053e18, z: -5.941e18, regionId: 14000003, region: 'VR-03' },
]

// --- normalizeCoordinates ---

describe('normalizeCoordinates', () => {
  it('maps the widest axis to exactly [-50, +50]', () => {
    const normalized = normalizeCoordinates(RAW_FIXTURE)
    const xs = normalized.map(s => s.x)
    const ys = normalized.map(s => s.y)
    const zs = normalized.map(s => s.z)
    const allCoords = [...xs, ...ys, ...zs]
    expect(Math.max(...allCoords)).toBeCloseTo(50, 0)
    expect(Math.min(...allCoords)).toBeCloseTo(-50, 0)
  })

  it('preserves aspect ratio across axes (single scale factor)', () => {
    const normalized = normalizeCoordinates(RAW_FIXTURE)
    // The scale factor is uniform — ratios between distances should be preserved
    const raw_dx = RAW_FIXTURE[0].x - RAW_FIXTURE[1].x
    const raw_dz = RAW_FIXTURE[0].z - RAW_FIXTURE[1].z
    const norm_dx = normalized[0].x - normalized[1].x
    const norm_dz = normalized[0].z - normalized[1].z
    // ratio of dx/dz should be the same in raw and normalized
    expect(norm_dx / norm_dz).toBeCloseTo(raw_dx / raw_dz, 5)
  })

  it('centers the galaxy at origin', () => {
    const normalized = normalizeCoordinates(RAW_FIXTURE)
    const cx = normalized.reduce((s, p) => s + p.x, 0) / normalized.length
    const cy = normalized.reduce((s, p) => s + p.y, 0) / normalized.length
    const cz = normalized.reduce((s, p) => s + p.z, 0) / normalized.length
    // Center should be near zero (not exact because fixture is asymmetric, but bounding-box center is zero)
    const xs = normalized.map(s => s.x)
    const ys = normalized.map(s => s.y)
    const zs = normalized.map(s => s.z)
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(0, 5)
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(0, 5)
    expect((Math.min(...zs) + Math.max(...zs)) / 2).toBeCloseTo(0, 5)
  })

  it('handles a single-system input without crashing', () => {
    const result = normalizeCoordinates([RAW_FIXTURE[0]])
    expect(result).toHaveLength(1)
    expect(result[0].x).toBe(0)
    expect(result[0].y).toBe(0)
    expect(result[0].z).toBe(0)
  })
})

// --- parseGalaxyData ---

describe('parseGalaxyData', () => {
  it('returns the correct system count', () => {
    const data = parseGalaxyData(RAW_FIXTURE)
    expect(data.systems).toHaveLength(3)
  })

  it('builds systemMap keyed by bigint id', () => {
    const { systemMap } = parseGalaxyData(RAW_FIXTURE)
    expect(systemMap.has(30004759n)).toBe(true)
    expect(systemMap.get(30004759n)?.name).toBe('UK4-GH8')
  })

  it('builds regionMap grouping systems by region name', () => {
    const { regionMap } = parseGalaxyData(RAW_FIXTURE)
    expect(regionMap.get('N.6K1.K5D')).toHaveLength(2)
    expect(regionMap.get('VR-03')).toHaveLength(1)
  })

  it('builds regionSystemCounts correctly', () => {
    const { regionSystemCounts } = parseGalaxyData(RAW_FIXTURE)
    expect(regionSystemCounts.get('N.6K1.K5D')).toBe(2)
    expect(regionSystemCounts.get('VR-03')).toBe(1)
  })

  it('normalized coordinates are within [-50, 50]', () => {
    const { systems } = parseGalaxyData(RAW_FIXTURE)
    for (const s of systems) {
      expect(s.x).toBeGreaterThanOrEqual(-50)
      expect(s.x).toBeLessThanOrEqual(50)
      expect(s.y).toBeGreaterThanOrEqual(-50)
      expect(s.y).toBeLessThanOrEqual(50)
      expect(s.z).toBeGreaterThanOrEqual(-50)
      expect(s.z).toBeLessThanOrEqual(50)
    }
  })

  it('system id is stored as bigint', () => {
    const { systems } = parseGalaxyData(RAW_FIXTURE)
    for (const s of systems)
      expect(typeof s.id).toBe('bigint')
  })

  it('preserves region and name strings', () => {
    const { systems } = parseGalaxyData(RAW_FIXTURE)
    const s = systems.find(s => s.id === 34000120n)
    expect(s?.name).toBe('V-120')
    expect(s?.region).toBe('VR-03')
    expect(s?.regionId).toBe(14000003)
  })
})

// --- obfuscatedLocation ---

describe('obfuscatedLocation', () => {
  let galaxyData: GalaxyData

  beforeEach(() => {
    galaxyData = parseGalaxyData(RAW_FIXTURE)
  })

  it('returns region name and total system count for a known system', () => {
    const result = obfuscatedLocation(30004759n, galaxyData.systemMap, galaxyData.regionSystemCounts)
    expect(result).toBe('N.6K1.K5D (2 systems)')
  })

  it('handles a region with a single system', () => {
    const result = obfuscatedLocation(34000120n, galaxyData.systemMap, galaxyData.regionSystemCounts)
    expect(result).toBe('VR-03 (1 systems)')
  })

  it('returns Unknown Region for unrecognized system ID', () => {
    const result = obfuscatedLocation(99999999n, galaxyData.systemMap, galaxyData.regionSystemCounts)
    expect(result).toBe('Unknown Region')
  })
})

// --- loadGalaxyData ---

describe('loadGalaxyData', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches, parses, and returns galaxy data on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => RAW_FIXTURE,
    } as Response)

    const data = await loadGalaxyData('https://example.com/galaxy.json')
    expect(data.systems).toHaveLength(3)
    expect(data.systemMap.has(30004759n)).toBe(true)
  })

  it('throws a descriptive error when fetch returns non-ok status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response)

    await expect(loadGalaxyData('https://example.com/galaxy.json'))
      .rejects.toThrow('404')
  })

  it('throws when response JSON is not an array', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ not: 'an array' }),
    } as Response)

    await expect(loadGalaxyData('https://example.com/galaxy.json'))
      .rejects.toThrow()
  })

  it('throws when fetch itself fails (network error)', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

    await expect(loadGalaxyData('https://example.com/galaxy.json'))
      .rejects.toThrow('Network error')
  })
})

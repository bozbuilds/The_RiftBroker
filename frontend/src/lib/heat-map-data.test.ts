import { describe, expect, test } from 'vitest'

import type { IntelListingFields } from './types'
import { DEFAULT_FILTERS, aggregateBySystem, filterHeatMapData, type SystemHeatData } from './heat-map-data'

function makeListing(overrides: Partial<IntelListingFields> = {}): IntelListingFields {
  return {
    id: '0x1',
    scout: '0xscout1',
    intelType: 0,
    systemId: 30004759n,
    createdAt: BigInt(Date.now() - 3_600_000), // 1 hour ago
    decayHours: 24n,
    walrusBlobId: new Uint8Array([1, 2, 3]),
    individualPrice: 1_000_000n,
    stakeValue: 0n,
    delisted: false,
    locationProofHash: new Uint8Array([]),
    isVerified: false,
    distanceProofHash: new Uint8Array([]),
    hasDistanceProof: false,
    distanceMeters: null,
    ...overrides,
  }
}

describe('aggregateBySystem', () => {
  test('returns empty array for no listings', () => {
    const result = aggregateBySystem([], Date.now())
    expect(result).toEqual([])
  })

  test('groups listings by systemId', () => {
    const listings = [
      makeListing({ id: '0x1', systemId: 100n }),
      makeListing({ id: '0x2', systemId: 200n }),
      makeListing({ id: '0x3', systemId: 100n }),
    ]
    const result = aggregateBySystem(listings, Date.now())
    expect(result).toHaveLength(2)

    const sys100 = result.find((s) => s.systemId === 100n)
    const sys200 = result.find((s) => s.systemId === 200n)
    expect(sys100?.listingCount).toBe(2)
    expect(sys200?.listingCount).toBe(1)
  })

  test('computes dominant intel type by frequency', () => {
    const listings = [
      makeListing({ id: '0x1', systemId: 100n, intelType: 0 }),
      makeListing({ id: '0x2', systemId: 100n, intelType: 1 }),
      makeListing({ id: '0x3', systemId: 100n, intelType: 1 }),
    ]
    const result = aggregateBySystem(listings, Date.now())
    expect(result[0]!.dominantType).toBe(1)
  })

  test('computes freshness (recent listing = high, old listing = low)', () => {
    const now = Date.now()
    // Listing created just now, 24h decay → very fresh
    const fresh = makeListing({ systemId: 1n, createdAt: BigInt(now), decayHours: 24n })
    // Listing created 23h ago, 24h decay → almost expired
    const old = makeListing({ systemId: 2n, createdAt: BigInt(now - 23 * 3_600_000), decayHours: 24n })

    const result = aggregateBySystem([fresh, old], now)
    const sys1 = result.find((s) => s.systemId === 1n)!
    const sys2 = result.find((s) => s.systemId === 2n)!

    expect(sys1.freshness).toBeGreaterThan(0.9)
    expect(sys2.freshness).toBeLessThan(0.15)
  })

  test('excludes delisted listings', () => {
    const listings = [
      makeListing({ id: '0x1', systemId: 100n, delisted: false }),
      makeListing({ id: '0x2', systemId: 100n, delisted: true }),
    ]
    const result = aggregateBySystem(listings, Date.now())
    expect(result[0]!.listingCount).toBe(1)
    expect(result[0]!.listings).toHaveLength(1)
  })

  test('excludes expired listings', () => {
    const now = Date.now()
    const listings = [
      makeListing({ id: '0x1', systemId: 100n, createdAt: BigInt(now), decayHours: 24n }),
      makeListing({ id: '0x2', systemId: 100n, createdAt: BigInt(now - 25 * 3_600_000), decayHours: 24n }),
    ]
    const result = aggregateBySystem(listings, now)
    expect(result[0]!.listingCount).toBe(1)
  })

  test('computes average price', () => {
    const listings = [
      makeListing({ id: '0x1', systemId: 100n, individualPrice: 1_000n }),
      makeListing({ id: '0x2', systemId: 100n, individualPrice: 3_000n }),
    ]
    const result = aggregateBySystem(listings, Date.now())
    expect(result[0]!.avgPrice).toBe(2_000n)
  })

  test('sorts by listing count descending', () => {
    const listings = [
      makeListing({ id: '0x1', systemId: 1n }),
      makeListing({ id: '0x2', systemId: 2n }),
      makeListing({ id: '0x3', systemId: 2n }),
      makeListing({ id: '0x4', systemId: 3n }),
      makeListing({ id: '0x5', systemId: 3n }),
      makeListing({ id: '0x6', systemId: 3n }),
    ]
    const result = aggregateBySystem(listings, Date.now())
    expect(result[0]!.systemId).toBe(3n)
    expect(result[1]!.systemId).toBe(2n)
    expect(result[2]!.systemId).toBe(1n)
  })
})

describe('filterHeatMapData', () => {
  const baseData: SystemHeatData[] = [
    {
      systemId: 1n,
      listingCount: 2,
      dominantType: 0,
      freshness: 0.8,
      avgPrice: 1_000n,
      listings: [
        makeListing({ systemId: 1n, intelType: 0, individualPrice: 500n }),
        makeListing({ systemId: 1n, intelType: 1, individualPrice: 1_500n }),
      ],
    },
    {
      systemId: 2n,
      listingCount: 1,
      dominantType: 2,
      freshness: 0.5,
      avgPrice: 5_000n,
      listings: [
        makeListing({ systemId: 2n, intelType: 2, individualPrice: 5_000n }),
      ],
    },
  ]

  test('returns all data when no filters applied', () => {
    const result = filterHeatMapData(baseData, {})
    expect(result).toHaveLength(2)
  })

  test('filters by intel type', () => {
    const result = filterHeatMapData(baseData, { intelType: 0 })
    expect(result).toHaveLength(1)
    expect(result[0]!.systemId).toBe(1n)
  })

  test('filters by max price', () => {
    const result = filterHeatMapData(baseData, { maxPrice: 2_000n })
    expect(result).toHaveLength(1)
    expect(result[0]!.systemId).toBe(1n)
  })

  test('applies both filters together', () => {
    const result = filterHeatMapData(baseData, { intelType: 2, maxPrice: 10_000n })
    expect(result).toHaveLength(1)
    expect(result[0]!.systemId).toBe(2n)
  })

  test('verifiedOnly: false shows all listings (unchanged behavior)', () => {
    const result = filterHeatMapData(baseData, { verifiedOnly: false })
    expect(result).toHaveLength(2)
  })

  test('verifiedOnly: true shows only systems with at least one verified listing', () => {
    const verifiedListing = makeListing({
      systemId: 3n,
      locationProofHash: new Uint8Array([1, 2, 3]),
      isVerified: true,
    })
    const unverifiedListing = makeListing({ systemId: 4n })
    const mixedData: SystemHeatData[] = [
      {
        systemId: 3n,
        listingCount: 1,
        dominantType: 0,
        freshness: 0.9,
        avgPrice: 1_000n,
        listings: [verifiedListing],
      },
      {
        systemId: 4n,
        listingCount: 1,
        dominantType: 0,
        freshness: 0.9,
        avgPrice: 1_000n,
        listings: [unverifiedListing],
      },
    ]
    const result = filterHeatMapData(mixedData, { verifiedOnly: true })
    expect(result).toHaveLength(1)
    expect(result[0]!.systemId).toBe(3n)
  })
})

describe('DEFAULT_FILTERS', () => {
  test('has verifiedOnly set to false', () => {
    expect(DEFAULT_FILTERS.verifiedOnly).toBe(false)
  })
})

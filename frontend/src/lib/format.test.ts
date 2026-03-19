import { describe, expect, it, vi } from 'vitest'

import { isExpired, mistToSui, observedAgo, timeRemaining } from './format'
import type { IntelListingFields } from './types'

function makeListing(overrides: Partial<IntelListingFields> = {}): IntelListingFields {
  const createdAt = overrides.createdAt ?? BigInt(Date.now() - 3_600_000)
  return {
    id: '0xabc',
    scout: '0x1',
    intelType: 0,
    systemId: 42n,
    createdAt,
    observedAt: overrides.observedAt ?? createdAt,
    decayHours: 24n,
    walrusBlobId: new Uint8Array([1, 2, 3]),
    individualPrice: 500_000n,
    stakeValue: 100_000n,
    delisted: false,
    locationProofHash: new Uint8Array([]),
    isVerified: false,
    distanceProofHash: new Uint8Array([]),
    hasDistanceProof: false,
    distanceMeters: null,
    ...overrides,
  }
}

describe('isExpired', () => {
  it('returns false for a fresh listing', () => {
    expect(isExpired(makeListing())).toBe(false)
  })

  it('returns true when decay period has passed', () => {
    const listing = makeListing({
      createdAt: BigInt(Date.now() - 48 * 3_600_000), // 48 hours ago
      decayHours: 24n,
    })
    expect(isExpired(listing)).toBe(true)
  })

  it('returns true exactly at expiry boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000_000)
    const listing = makeListing({
      createdAt: BigInt(1_000_000_000 - 24 * 3_600_000),
      decayHours: 24n,
    })
    expect(isExpired(listing)).toBe(true)
    vi.useRealTimers()
  })

  it('returns false just before expiry', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000_000)
    const listing = makeListing({
      createdAt: BigInt(1_000_000_000 - 24 * 3_600_000 + 1),
      decayHours: 24n,
    })
    expect(isExpired(listing)).toBe(false)
    vi.useRealTimers()
  })
})

describe('observedAgo', () => {
  it('returns null for unverified listings', () => {
    expect(observedAgo(makeListing({ isVerified: false }))).toBeNull()
  })

  it('returns formatted string for verified listings observed 4h ago', () => {
    const listing = makeListing({
      isVerified: true,
      locationProofHash: new Uint8Array([1]),
      observedAt: BigInt(Date.now() - 4 * 3_600_000),
    })
    expect(observedAgo(listing)).toMatch(/Observed 4h/)
  })

  it('returns minutes-only for recent observations (15m)', () => {
    const listing = makeListing({
      isVerified: true,
      locationProofHash: new Uint8Array([1]),
      observedAt: BigInt(Date.now() - 15 * 60_000),
    })
    expect(observedAgo(listing)).toMatch(/Observed 15m ago/)
  })

  it('returns "Observed just now" for sub-minute observations', () => {
    const listing = makeListing({
      isVerified: true,
      locationProofHash: new Uint8Array([1]),
      observedAt: BigInt(Date.now() - 30_000), // 30 seconds ago
    })
    expect(observedAgo(listing)).toBe('Observed just now')
  })
})

describe('mistToSui', () => {
  it('converts 1 SUI worth of MIST', () => {
    expect(mistToSui('1000000000')).toBe('1')
  })

  it('converts fractional SUI', () => {
    expect(mistToSui('500000000')).toBe('0.5')
  })

  it('converts small amounts', () => {
    expect(mistToSui('1000000')).toBe('0.001')
  })

  it('strips trailing zeros', () => {
    expect(mistToSui('100000000')).toBe('0.1')
  })

  it('returns null for empty string', () => {
    expect(mistToSui('')).toBeNull()
  })

  it('returns null for non-numeric input', () => {
    expect(mistToSui('abc')).toBeNull()
  })

  it('handles zero', () => {
    expect(mistToSui('0')).toBe('0')
  })
})

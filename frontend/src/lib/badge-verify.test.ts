import { describe, expect, it } from 'vitest'

import { getBadges, BADGE_TRUST_ORDER } from './badge-verify'
import type { IntelListingFields } from './types'

function makeListing(overrides: Partial<IntelListingFields> = {}): IntelListingFields {
  return {
    id: '0x1',
    scout: '0x1',
    intelType: 0,
    systemId: 42n,
    createdAt: BigInt(Date.now()),
    observedAt: BigInt(Date.now()),
    decayHours: 24n,
    walrusBlobId: new Uint8Array([]),
    individualPrice: 500_000n,
    stakeValue: 100_000n,
    delisted: false,
    locationProofHash: new Uint8Array([]),
    isVerified: false,
    distanceProofHash: new Uint8Array([]),
    hasDistanceProof: false,
    distanceMeters: null,
    jumpTxDigest: new Uint8Array([]),
    killmailTxDigest: new Uint8Array([]),
    depositTxDigest: new Uint8Array([]),
    revealTxDigest: new Uint8Array([]),
    ...overrides,
  }
}

describe('getBadges', () => {
  it('returns empty array for unverified listing', () => {
    expect(getBadges(makeListing())).toEqual([])
  })

  it('returns ZK-Verified when only locationProofHash is set', () => {
    const badges = getBadges(makeListing({ isVerified: true, locationProofHash: new Uint8Array([1]) }))
    expect(badges).toEqual([{ type: 'zk-verified', label: 'ZK-Verified', className: 'listing-verified-badge' }])
  })

  it('returns Combat Verified for killmail digest', () => {
    const badges = getBadges(makeListing({ killmailTxDigest: new Uint8Array([1, 2]) }))
    expect(badges[0].type).toBe('combat')
  })

  it('returns multiple badges when stacked', () => {
    const badges = getBadges(makeListing({
      jumpTxDigest: new Uint8Array([1]),
      killmailTxDigest: new Uint8Array([2]),
      depositTxDigest: new Uint8Array([3]),
    }))
    expect(badges.length).toBe(3)
  })

  it('does not include ZK-Verified when event badges are present', () => {
    const badges = getBadges(makeListing({
      isVerified: true,
      locationProofHash: new Uint8Array([1]),
      killmailTxDigest: new Uint8Array([2]),
    }))
    expect(badges.find(b => b.type === 'zk-verified')).toBeUndefined()
  })

  it('returns badges in trust order (combat first)', () => {
    const badges = getBadges(makeListing({
      revealTxDigest: new Uint8Array([1]),
      killmailTxDigest: new Uint8Array([2]),
      depositTxDigest: new Uint8Array([3]),
    }))
    expect(badges[0].type).toBe('combat')
    expect(badges[1].type).toBe('activity')
    expect(badges[2].type).toBe('discovery')
  })
})

describe('BADGE_TRUST_ORDER', () => {
  it('has combat as highest trust', () => {
    expect(BADGE_TRUST_ORDER[0]).toBe('combat')
  })
})

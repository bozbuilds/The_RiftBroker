import { describe, expect, it } from 'vitest'

import type { ScoutProfileFields } from './types'
import {
  parseScoutProfile,
  totalVerified,
  verificationRate,
  reputationTier,
  reputationSummary,
  getVerifiedClaims,
} from './scout-profile'

function makeProfile(overrides: Partial<ScoutProfileFields> = {}): ScoutProfileFields {
  return {
    scout: '0xabc',
    totalZkVerified: 0n,
    totalPresenceVerified: 0n,
    totalCombatVerified: 0n,
    totalActivityVerified: 0n,
    totalStructureVerified: 0n,
    totalUnverified: 0n,
    firstVerifiedAt: 1000n,
    lastVerifiedAt: 1000n,
    merkleRoot: '0',
    leafCount: 0n,
    reputationClaimTypes: [],
    reputationClaimCounts: [],
    ...overrides,
  }
}

describe('parseScoutProfile', () => {
  it('parses snake_case dynamic field value', () => {
    const fields = {
      total_zk_verified: '5',
      total_presence_verified: '3',
      total_combat_verified: '2',
      total_activity_verified: '1',
      total_structure_verified: '0',
      total_unverified: '10',
      first_verified_at: '1709000000000',
      last_verified_at: '1709100000000',
      merkle_root: '12413880268183407374852357075976609371175688755676981206018884971008854919922',
      leaf_count: '7',
      reputation_claim_types: [0, 254],
      reputation_claim_counts: ['3', '5'],
    }
    const result = parseScoutProfile('0xscout', fields)
    expect(result.scout).toBe('0xscout')
    expect(result.totalZkVerified).toBe(5n)
    expect(result.totalCombatVerified).toBe(2n)
    expect(result.totalUnverified).toBe(10n)
    expect(result.merkleRoot).toBe(
      '12413880268183407374852357075976609371175688755676981206018884971008854919922',
    )
    expect(result.leafCount).toBe(7n)
    expect(result.reputationClaimTypes).toEqual([0, 254])
    expect(result.reputationClaimCounts).toEqual([3n, 5n])
  })

  it('defaults merkle_root and leaf_count when absent (pre–Phase-4a+ objects)', () => {
    const fields = {
      total_zk_verified: '0',
      total_presence_verified: '0',
      total_combat_verified: '0',
      total_activity_verified: '0',
      total_structure_verified: '0',
      total_unverified: '0',
      first_verified_at: '0',
      last_verified_at: '0',
    }
    const result = parseScoutProfile('0xscout', fields)
    expect(result.merkleRoot).toBe('0')
    expect(result.leafCount).toBe(0n)
    expect(result.reputationClaimTypes).toEqual([])
    expect(result.reputationClaimCounts).toEqual([])
  })
})

describe('totalVerified', () => {
  it('sums all verified counters', () => {
    const p = makeProfile({
      totalZkVerified: 5n,
      totalPresenceVerified: 3n,
      totalCombatVerified: 2n,
    })
    expect(totalVerified(p)).toBe(10n)
  })

  it('returns 0n for empty profile', () => {
    expect(totalVerified(makeProfile())).toBe(0n)
  })
})

describe('verificationRate', () => {
  it('returns ratio of verified to total', () => {
    const p = makeProfile({ totalZkVerified: 3n, totalUnverified: 7n })
    expect(verificationRate(p)).toBeCloseTo(0.3)
  })

  it('returns 0 for empty profile', () => {
    expect(verificationRate(makeProfile())).toBe(0)
  })
})

describe('reputationTier', () => {
  it('returns null for < 10 verified', () => {
    expect(reputationTier(makeProfile({ totalCombatVerified: 5n }))).toBeNull()
  })

  it('returns bronze for 10+', () => {
    expect(reputationTier(makeProfile({ totalCombatVerified: 10n }))).toBe('bronze')
  })

  it('returns silver for 50+', () => {
    expect(reputationTier(makeProfile({ totalZkVerified: 50n }))).toBe('silver')
  })

  it('returns gold for 100+', () => {
    expect(reputationTier(makeProfile({ totalPresenceVerified: 100n }))).toBe('gold')
  })
})

describe('getVerifiedClaims', () => {
  it('maps types to labels and filters zero counts', () => {
    const p = makeProfile({
      reputationClaimTypes: [0, 1, 254],
      reputationClaimCounts: [2n, 0n, 4n],
    })
    expect(getVerifiedClaims(p)).toEqual([
      { label: 'Combat', count: 2n },
      { label: 'ZK-Verified', count: 4n },
    ])
  })
})

describe('reputationSummary', () => {
  it('returns highest badge type label', () => {
    const p = makeProfile({ totalCombatVerified: 5n, totalStructureVerified: 3n })
    expect(reputationSummary(p)).toBe('5× Combat')
  })

  it('falls back to next tier if no combat', () => {
    const p = makeProfile({ totalPresenceVerified: 3n })
    expect(reputationSummary(p)).toBe('3× Presence')
  })

  it('returns null for unverified-only profile', () => {
    const p = makeProfile({ totalUnverified: 5n })
    expect(reputationSummary(p)).toBeNull()
  })
})

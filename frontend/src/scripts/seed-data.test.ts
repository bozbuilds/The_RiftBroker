import { describe, expect, test } from 'vitest'

import { intelPayloadSchema } from '../lib/intel-schemas'
import { SEED_LISTINGS } from './seed-data'

// Known real system IDs referenced by seed listings
const KNOWN_SYSTEM_IDS = new Set([
  30004759n, 30004760n, 30004761n, 30004762n,
  30001000n, 30001001n, 30001002n, 30001003n,
  30002000n, 30002001n, 30002002n,
  30003000n, 30003001n, 30003002n, 30003003n,
  30005000n, 30005001n, 30005002n,
  30006000n, 30006001n,
])

describe('SEED_LISTINGS', () => {
  test('all payloads pass Zod validation', () => {
    for (const listing of SEED_LISTINGS) {
      const result = intelPayloadSchema.safeParse(listing.payload)
      expect(result.success, `Listing for system ${listing.systemId} failed: ${JSON.stringify(result.error?.issues)}`).toBe(true)
    }
  })

  test('all system IDs exist in KNOWN_SYSTEM_IDS', () => {
    for (const listing of SEED_LISTINGS) {
      expect(KNOWN_SYSTEM_IDS.has(listing.systemId), `System ${listing.systemId} not in KNOWN_SYSTEM_IDS`).toBe(true)
    }
  })

  test('all 4 intel types are represented', () => {
    const types = new Set(SEED_LISTINGS.map((l) => l.intelType))
    expect(types).toEqual(new Set([0, 1, 2, 3]))
  })

  test('at least 10 distinct systems are used', () => {
    const systems = new Set(SEED_LISTINGS.map((l) => l.systemId))
    expect(systems.size).toBeGreaterThanOrEqual(10)
  })

  test('all prices and stakes are positive', () => {
    for (const listing of SEED_LISTINGS) {
      expect(listing.price > 0n, `price for system ${listing.systemId}`).toBe(true)
      expect(listing.stakeAmount > 0n, `stake for system ${listing.systemId}`).toBe(true)
    }
  })

  test('payload.type matches intelType for each listing', () => {
    for (const listing of SEED_LISTINGS) {
      expect(listing.payload.type).toBe(listing.intelType)
    }
  })

  test('all decayHours are within contract limits', () => {
    for (const listing of SEED_LISTINGS) {
      expect(listing.decayHours <= 8760n, `decay ${listing.decayHours} exceeds MAX_DECAY_HOURS`).toBe(true)
    }
  })
})

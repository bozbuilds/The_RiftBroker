import { describe, expect, test } from 'vitest'

import { intelPayloadSchema } from '../lib/intel-schemas'
import { SEED_LISTINGS } from './seed-data'

// Known real system IDs referenced by seed listings (verified in galaxy.json)
const KNOWN_SYSTEM_IDS = new Set([
  // Dense cluster — 869-Y-51
  30006118n, 30006094n, 30006070n, 30006045n, 30006021n, 30005997n,
  // Scattered singles
  30021737n, 30018133n, 30017833n, 30009437n, 30001167n, 30014670n,
  // Route origins (same region as a scattered single, different system)
  30021734n, 30017830n, 30014667n,
  // Route destinations
  30018130n, 30001164n, 30009434n,
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

import { describe, expect, it } from 'vitest'

import { REGION_SYSTEM_COUNTS, obfuscatedLocation } from './systems'

describe('REGION_SYSTEM_COUNTS', () => {
  it('has correct count for Core region', () => {
    expect(REGION_SYSTEM_COUNTS['Core']).toBe(4)
  })

  it('has correct count for Eastern Rim region', () => {
    expect(REGION_SYSTEM_COUNTS['Eastern Rim']).toBe(3)
  })

  it('has correct count for Outer Reaches region', () => {
    expect(REGION_SYSTEM_COUNTS['Outer Reaches']).toBe(2)
  })

  it('covers all 6 regions', () => {
    expect(Object.keys(REGION_SYSTEM_COUNTS)).toHaveLength(6)
  })
})

describe('obfuscatedLocation', () => {
  it('returns region with system count for known system', () => {
    expect(obfuscatedLocation(30004759n)).toBe('Core (4 systems)')
  })

  it('returns different region for system in another region', () => {
    expect(obfuscatedLocation(30002000n)).toBe('Eastern Rim (3 systems)')
  })

  it('returns Unknown Region for unrecognized system ID', () => {
    expect(obfuscatedLocation(99999999n)).toBe('Unknown Region')
  })
})

import { describe, expect, it } from 'vitest'

import { parseListingFields, parseReceiptFields } from './parse'

describe('parseListingFields', () => {
  const fields = {
    scout: '0xabc123',
    intel_type: 2,
    system_id: '30040322',
    created_at: '1709000000000',
    decay_hours: '48',
    walrus_blob_id: [72, 101, 108, 108, 111],
    individual_price: '5000000',
    stake: { value: '50000000' },
    delisted: false,
    location_proof_hash: [],
  }
  const objectId = '0xdead01'

  it('maps snake_case fields to camelCase', () => {
    const result = parseListingFields(objectId, fields)
    expect(result.scout).toBe('0xabc123')
    expect(result.intelType).toBe(2)
    expect(result.delisted).toBe(false)
  })

  it('uses objectId param for id field', () => {
    const result = parseListingFields(objectId, fields)
    expect(result.id).toBe(objectId)
  })

  it('converts string fields to BigInt', () => {
    const result = parseListingFields(objectId, fields)
    expect(result.systemId).toBe(30040322n)
    expect(result.createdAt).toBe(1709000000000n)
    expect(result.decayHours).toBe(48n)
    expect(result.individualPrice).toBe(5000000n)
  })

  it('converts number[] to Uint8Array', () => {
    const result = parseListingFields(objectId, fields)
    expect(result.walrusBlobId).toBeInstanceOf(Uint8Array)
    expect(Array.from(result.walrusBlobId)).toEqual([72, 101, 108, 108, 111])
  })

  it('extracts stakeValue from Balance<SUI> object shape', () => {
    const result = parseListingFields(objectId, fields)
    expect(result.stakeValue).toBe(50000000n)
  })

  it('extracts stakeValue from bare string shape', () => {
    const result = parseListingFields(objectId, { ...fields, stake: '30000000' })
    expect(result.stakeValue).toBe(30000000n)
  })

  it('isVerified is false when location_proof_hash is empty', () => {
    const result = parseListingFields(objectId, { ...fields, location_proof_hash: [] })
    expect(result.isVerified).toBe(false)
    expect(result.locationProofHash.length).toBe(0)
  })

  it('isVerified is true when location_proof_hash is non-empty', () => {
    const result = parseListingFields(objectId, { ...fields, location_proof_hash: [1, 2, 3] })
    expect(result.isVerified).toBe(true)
    expect(result.locationProofHash.length).toBe(3)
  })

  it('isVerified is false when location_proof_hash is absent', () => {
    const { location_proof_hash: _, ...fieldsWithout } = fields
    const result = parseListingFields(objectId, fieldsWithout)
    expect(result.isVerified).toBe(false)
    expect(result.locationProofHash.length).toBe(0)
  })
})

describe('parseListingFields — distance proof', () => {
  const baseFields = {
    scout: '0xABC',
    intel_type: 1,
    system_id: '42',
    created_at: '1000',
    decay_hours: '24',
    walrus_blob_id: [],
    individual_price: '500000',
    stake: { value: '1000000' },
    delisted: false,
    location_proof_hash: [1, 2, 3],
  }

  it('no distance_proof_hash field → empty, null distance', () => {
    const result = parseListingFields('0x1', { ...baseFields })
    expect(result.hasDistanceProof).toBe(false)
    expect(result.distanceProofHash.length).toBe(0)
    expect(result.distanceMeters).toBeNull()
  })

  it('empty distance_proof_hash → hasDistanceProof false', () => {
    const result = parseListingFields('0x1', { ...baseFields, distance_proof_hash: [] })
    expect(result.hasDistanceProof).toBe(false)
    expect(result.distanceMeters).toBeNull()
  })

  it('non-empty distance_proof_hash → hasDistanceProof true + parsed distance', () => {
    // Encode distanceSquared = 1000000 (= 1000m Manhattan distance) as 32-byte LE
    // 1000000 = 0xF4240
    const distanceBytes = new Array(96).fill(0)
    distanceBytes[0] = 0x40
    distanceBytes[1] = 0x42
    distanceBytes[2] = 0x0F
    const result = parseListingFields('0x1', { ...baseFields, distance_proof_hash: distanceBytes })
    expect(result.hasDistanceProof).toBe(true)
    expect(result.distanceMeters).toBeCloseTo(1000, 0)
  })
})

describe('parseListingFields — observed_at', () => {
  const baseFields = {
    scout: '0xABC',
    intel_type: 1,
    system_id: '42',
    created_at: '1000',
    decay_hours: '24',
    walrus_blob_id: [],
    individual_price: '500000',
    stake: { value: '1000000' },
    delisted: false,
    location_proof_hash: [],
  }

  it('parses observed_at when present', () => {
    const result = parseListingFields('0x1', { ...baseFields, observed_at: '900' })
    expect(result.observedAt).toBe(900n)
  })

  it('falls back to created_at when observed_at is missing', () => {
    const result = parseListingFields('0x1', { ...baseFields })
    expect(result.observedAt).toBe(1000n)
  })
})

describe('parseListingFields — jump_tx_digest', () => {
  const baseFields = {
    scout: '0xABC',
    intel_type: 1,
    system_id: '42',
    created_at: '1000',
    observed_at: '900',
    decay_hours: '24',
    walrus_blob_id: [],
    individual_price: '500000',
    stake: { value: '1000000' },
    delisted: false,
    location_proof_hash: [],
  }

  it('parses jump_tx_digest when present', () => {
    const result = parseListingFields('0x1', { ...baseFields, jump_tx_digest: [65, 66, 67] })
    expect(result.jumpTxDigest).toEqual(new Uint8Array([65, 66, 67]))
  })

  it('returns empty Uint8Array when jump_tx_digest is missing', () => {
    const result = parseListingFields('0x1', { ...baseFields })
    expect(result.jumpTxDigest).toEqual(new Uint8Array([]))
  })
})

describe('parseListingFields — presence listing distance', () => {
  it('extracts distance from location_proof_hash when jumpTxDigest is non-empty', () => {
    // A presence listing has 160 bytes in location_proof_hash: [0..31] = distanceSquared
    // Build a fake distanceSquared: manhattan=100, so distanceSquared=10000 in LE
    const distSq = 10000n
    const locationProofHash = new Uint8Array(160)
    for (let i = 0; i < 32; i++) {
      locationProofHash[i] = Number((distSq >> BigInt(i * 8)) & 0xffn)
    }
    const result = parseListingFields('0x1', {
      scout: '0xABC',
      intel_type: 1,
      system_id: '42',
      created_at: '1000',
      observed_at: '900',
      decay_hours: '24',
      walrus_blob_id: [],
      individual_price: '500000',
      stake: { value: '1000000' },
      delisted: false,
      location_proof_hash: Array.from(locationProofHash),
      jump_tx_digest: [65, 66, 67],
    })
    expect(result.hasDistanceProof).toBe(true)
    expect(result.distanceMeters).toBe(100) // sqrt(10000) = 100
  })
})

describe('parseListingFields — event badge digests', () => {
  const baseFields = {
    scout: '0xABC',
    intel_type: 1,
    system_id: '42',
    created_at: '1000',
    observed_at: '900',
    decay_hours: '24',
    walrus_blob_id: [],
    individual_price: '500000',
    stake: { value: '1000000' },
    delisted: false,
    location_proof_hash: [],
  }

  it('parses killmail_tx_digest when present', () => {
    const result = parseListingFields('0x1', { ...baseFields, killmail_tx_digest: [65, 66] })
    expect(result.killmailTxDigest).toEqual(new Uint8Array([65, 66]))
  })

  it('parses deposit_tx_digest when present', () => {
    const result = parseListingFields('0x1', { ...baseFields, deposit_tx_digest: [67, 68] })
    expect(result.depositTxDigest).toEqual(new Uint8Array([67, 68]))
  })

  it('parses reveal_tx_digest when present', () => {
    const result = parseListingFields('0x1', { ...baseFields, reveal_tx_digest: [69, 70] })
    expect(result.revealTxDigest).toEqual(new Uint8Array([69, 70]))
  })

  it('returns empty Uint8Arrays when badge digests missing', () => {
    const result = parseListingFields('0x1', { ...baseFields })
    expect(result.killmailTxDigest).toEqual(new Uint8Array([]))
    expect(result.depositTxDigest).toEqual(new Uint8Array([]))
    expect(result.revealTxDigest).toEqual(new Uint8Array([]))
  })
})

describe('parseReceiptFields', () => {
  const objectId = '0xreceipt01'

  it('maps snake_case fields to camelCase', () => {
    const result = parseReceiptFields(objectId, {
      listing_id: '0xlisting01',
      buyer: '0xbuyer01',
      paid_at: '1709000000000',
    })
    expect(result.id).toBe(objectId)
    expect(result.buyer).toBe('0xbuyer01')
  })

  it('converts paid_at to BigInt', () => {
    const result = parseReceiptFields(objectId, {
      listing_id: '0xlisting01',
      buyer: '0xbuyer01',
      paid_at: '1709000000000',
    })
    expect(result.paidAt).toBe(1709000000000n)
  })

  it('handles listing_id as bare string', () => {
    const result = parseReceiptFields(objectId, {
      listing_id: '0xlisting01',
      buyer: '0xbuyer01',
      paid_at: '1709000000000',
    })
    expect(result.listingId).toBe('0xlisting01')
  })

  it('handles listing_id as { id: "0x..." } object', () => {
    const result = parseReceiptFields(objectId, {
      listing_id: { id: '0xlisting02' },
      buyer: '0xbuyer01',
      paid_at: '1709000000000',
    })
    expect(result.listingId).toBe('0xlisting02')
  })
})

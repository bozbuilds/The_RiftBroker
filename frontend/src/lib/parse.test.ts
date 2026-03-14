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

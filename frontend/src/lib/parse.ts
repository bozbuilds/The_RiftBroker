import type { IntelListingFields, PurchaseReceiptFields } from './types'

export function parseListingFields(
  objectId: string,
  fields: Record<string, unknown>,
): IntelListingFields {
  const locationProofHash = new Uint8Array((fields.location_proof_hash as number[] | undefined) ?? [])
  return {
    id: objectId,
    scout: fields.scout as string,
    intelType: fields.intel_type as IntelListingFields['intelType'],
    systemId: BigInt(fields.system_id as string),
    createdAt: BigInt(fields.created_at as string),
    decayHours: BigInt(fields.decay_hours as string),
    walrusBlobId: new Uint8Array(fields.walrus_blob_id as number[]),
    individualPrice: BigInt(fields.individual_price as string),
    stakeValue: BigInt(
      typeof fields.stake === 'string'
        ? fields.stake
        : (fields.stake as { value: string }).value,
    ),
    delisted: fields.delisted as boolean,
    locationProofHash,
    isVerified: locationProofHash.length > 0,
  }
}

function extractId(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value)
    return (value as { id: string }).id
  throw new Error('Invalid listing_id shape')
}

export function parseReceiptFields(
  objectId: string,
  fields: Record<string, unknown>,
): PurchaseReceiptFields {
  return {
    id: objectId,
    listingId: extractId(fields.listing_id),
    buyer: fields.buyer as string,
    paidAt: BigInt(fields.paid_at as string),
  }
}

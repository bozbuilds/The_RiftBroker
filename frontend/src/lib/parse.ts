import type { IntelListingFields, PurchaseReceiptFields } from './types'

/**
 * Extract the Manhattan distance from distance proof public inputs.
 *
 * snarkjs public signals order: outputs first, then inputs.
 * Distance circuit layout:
 *   [0]: distanceSquared (output) — 32 bytes LE
 *   [1]: coordinatesHash1 — 32 bytes LE
 *   [2]: coordinatesHash2 — 32 bytes LE
 *
 * Returns: sqrt(distanceSquared) in meters, or null if proofHash is empty.
 */
function parseDistanceMeters(proofHash: Uint8Array): number | null {
  if (proofHash.length < 32) return null
  let val = 0n
  for (let i = 31; i >= 0; i--)
    val = (val << 8n) | BigInt(proofHash[i] ?? 0)
  // val is distanceSquared = manhattan^2, so sqrt gives manhattan distance.
  // For large values, convert via BigInt isqrt to avoid Number precision loss.
  if (val > BigInt(Number.MAX_SAFE_INTEGER)) {
    let lo = 0n, hi = val
    while (lo <= hi) {
      const mid = (lo + hi) >> 1n
      if (mid * mid <= val) lo = mid + 1n
      else hi = mid - 1n
    }
    return Number(hi)
  }
  return Math.sqrt(Number(val))
}

export function parseListingFields(
  objectId: string,
  fields: Record<string, unknown>,
): IntelListingFields {
  const locationProofHash = new Uint8Array((fields.location_proof_hash as number[] | undefined) ?? [])
  const distanceProofHash = new Uint8Array((fields.distance_proof_hash as number[] | undefined) ?? [])
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
    distanceProofHash,
    hasDistanceProof: distanceProofHash.length > 0,
    distanceMeters: parseDistanceMeters(distanceProofHash),
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

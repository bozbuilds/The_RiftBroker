export const INTEL_TYPES = {
  RESOURCE: 0,
  FLEET: 1,
  BASE: 2,
  ROUTE: 3,
} as const

export type IntelType = typeof INTEL_TYPES[keyof typeof INTEL_TYPES]

export interface IntelListingFields {
  readonly id: string
  readonly scout: string
  readonly intelType: IntelType
  readonly systemId: bigint
  readonly createdAt: bigint
  readonly observedAt: bigint
  readonly decayHours: bigint
  readonly walrusBlobId: Uint8Array
  readonly individualPrice: bigint
  readonly stakeValue: bigint
  readonly delisted: boolean
  readonly locationProofHash: Uint8Array
  /** Derived: true when locationProofHash is non-empty. */
  readonly isVerified: boolean
  readonly distanceProofHash: Uint8Array
  /** Derived: true when distanceProofHash is non-empty. */
  readonly hasDistanceProof: boolean
  /** Manhattan distance in meters, derived from distanceProofHash. null if no distance proof. */
  readonly distanceMeters: number | null
}

export interface PurchaseReceiptFields {
  readonly id: string
  readonly listingId: string
  readonly buyer: string
  readonly paidAt: bigint
}

export interface EnrichedReceipt {
  readonly receipt: PurchaseReceiptFields
  readonly listing: IntelListingFields
}

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
  readonly decayHours: bigint
  readonly walrusBlobId: Uint8Array
  readonly individualPrice: bigint
  readonly delisted: boolean
}

export interface PurchaseReceiptFields {
  readonly id: string
  readonly listingId: string
  readonly buyer: string
  readonly paidAt: bigint
}

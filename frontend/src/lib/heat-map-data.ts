import { getBadges } from './badge-verify'
import type { IntelListingFields, IntelType } from './types'

export interface SystemHeatData {
  readonly systemId: bigint
  readonly listingCount: number
  readonly dominantType: IntelType
  readonly freshness: number
  readonly avgPrice: bigint
  readonly listings: readonly IntelListingFields[]
}

export interface HeatMapFilters {
  readonly intelType?: IntelType
  readonly maxPrice?: bigint
  readonly verifiedOnly?: boolean
}

export const DEFAULT_FILTERS: HeatMapFilters = {
  verifiedOnly: false,
}

function isActive(listing: IntelListingFields, now: number): boolean {
  if (listing.delisted) return false
  const expiryMs = Number(listing.observedAt) + Number(listing.decayHours) * 3_600_000
  return now < expiryMs
}

function computeFreshness(listings: IntelListingFields[], now: number): number {
  if (listings.length === 0) return 0
  // Use the freshest listing's remaining time ratio.
  // If decayHours is 0, lifetimeMs = 0, giving Infinity ratio → clamped to 0 (immediately stale).
  let maxFreshness = 0
  for (const l of listings) {
    const lifetimeMs = Number(l.decayHours) * 3_600_000
    if (lifetimeMs === 0) continue
    const elapsed = now - Number(l.observedAt)
    const remaining = Math.max(0, 1 - elapsed / lifetimeMs)
    if (remaining > maxFreshness) maxFreshness = remaining
  }
  return maxFreshness
}

function computeDominantType(listings: IntelListingFields[]): IntelType {
  const counts = new Map<IntelType, number>()
  for (const l of listings) {
    counts.set(l.intelType, (counts.get(l.intelType) ?? 0) + 1)
  }
  let maxCount = 0
  let dominant: IntelType = 0 as IntelType
  for (const [type, count] of counts) {
    if (count > maxCount) {
      maxCount = count
      dominant = type
    }
  }
  return dominant
}

export function aggregateBySystem(
  listings: IntelListingFields[],
  now: number,
): SystemHeatData[] {
  const active = listings.filter((l) => isActive(l, now))
  if (active.length === 0) return []

  const grouped = new Map<bigint, IntelListingFields[]>()
  for (const l of active) {
    const group = grouped.get(l.systemId)
    if (group) group.push(l)
    else grouped.set(l.systemId, [l])
  }

  const result: SystemHeatData[] = []
  for (const [systemId, systemListings] of grouped) {
    const totalPrice = systemListings.reduce((sum, l) => sum + l.individualPrice, 0n)
    result.push({
      systemId,
      listingCount: systemListings.length,
      dominantType: computeDominantType(systemListings),
      freshness: computeFreshness(systemListings, now),
      avgPrice: totalPrice / BigInt(systemListings.length),
      listings: systemListings,
    })
  }

  result.sort((a, b) => b.listingCount - a.listingCount)
  return result
}

export function filterHeatMapData(
  data: SystemHeatData[],
  filters: HeatMapFilters,
): SystemHeatData[] {
  return data.filter((system) => {
    if (filters.intelType !== undefined) {
      const hasType = system.listings.some((l) => l.intelType === filters.intelType)
      if (!hasType) return false
    }
    if (filters.maxPrice !== undefined && system.avgPrice > filters.maxPrice)
      return false
    if (filters.verifiedOnly) {
      const hasVerified = system.listings.some((l) => l.isVerified || getBadges(l).length > 0)
      if (!hasVerified) return false
    }
    return true
  })
}

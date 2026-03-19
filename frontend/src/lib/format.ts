import type { IntelListingFields } from './types'

function expiryMs(listing: IntelListingFields): number {
  return Number(listing.createdAt) + Number(listing.decayHours) * 3_600_000
}

export function isExpired(listing: IntelListingFields): boolean {
  return expiryMs(listing) <= Date.now()
}

export function timeRemaining(listing: IntelListingFields): string {
  const remaining = expiryMs(listing) - Date.now()
  if (remaining <= 0) return 'Expired'
  const hours = Math.floor(remaining / 3_600_000)
  const minutes = Math.floor((remaining % 3_600_000) / 60_000)
  return `${hours}h ${minutes}m`
}

export function truncateAddress(addr: string): string {
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

// Distance formatting: km → ls → ly
const KM_PER_LIGHT_SECOND = 299_792.458
const KM_PER_LIGHT_YEAR = 9_460_730_472_580.8

/** Format a distance in km to human-readable units (km, ls, or ly). */
export function formatDistance(km: number): string {
  if (km < KM_PER_LIGHT_SECOND)
    return `${km.toFixed(0)} km`
  const ly = km / KM_PER_LIGHT_YEAR
  if (ly >= 1)
    return `${ly.toFixed(2)} ly`
  const ls = km / KM_PER_LIGHT_SECOND
  return `${ls.toFixed(1)} ls`
}

const MIST_PER_SUI = 1_000_000_000

export function mistToSui(mist: string): string | null {
  if (!mist || !/^\d+$/.test(mist)) return null
  const n = Number(mist)
  if (n === 0) return '0'
  const sui = n / MIST_PER_SUI
  return parseFloat(sui.toFixed(9)).toString()
}

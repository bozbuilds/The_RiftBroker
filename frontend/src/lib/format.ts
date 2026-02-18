import type { IntelListingFields } from './types'

export function timeRemaining(listing: IntelListingFields): string {
  const expiryMs = Number(listing.createdAt) + Number(listing.decayHours) * 3_600_000
  const remaining = expiryMs - Date.now()
  if (remaining <= 0) return 'Expired'
  const hours = Math.floor(remaining / 3_600_000)
  const minutes = Math.floor((remaining % 3_600_000) / 60_000)
  return `${hours}h ${minutes}m`
}

export function truncateAddress(addr: string): string {
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

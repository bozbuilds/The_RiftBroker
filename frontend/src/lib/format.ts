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

const MIST_PER_SUI = 1_000_000_000

export function mistToSui(mist: string): string | null {
  if (!mist || !/^\d+$/.test(mist)) return null
  const n = Number(mist)
  if (n === 0) return '0'
  const sui = n / MIST_PER_SUI
  return parseFloat(sui.toFixed(9)).toString()
}

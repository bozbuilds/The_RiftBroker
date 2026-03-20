import { useMemo, useState } from 'react'

import { INTEL_TYPE_LABELS, INTEL_TYPE_LABEL_MAP } from '../lib/constants'
import { EMPTY_SYSTEM_MAP, EMPTY_REGION_COUNTS } from '../lib/empty-maps'
import { formatDistance, isExpired, mistToSui, observedAgo, timeRemaining, truncateAddress } from '../lib/format'
import { obfuscatedLocation } from '../lib/galaxy-data'
import type { IntelListingFields } from '../lib/types'
import { useListings } from '../hooks/useListings'
import { useReceipts } from '../hooks/useReceipts'
import { useGalaxyData } from '../providers/GalaxyDataProvider'

type PriceSort = 'asc' | 'desc' | null

function nextPriceSort(current: PriceSort): PriceSort {
  if (current === null) return 'asc'
  if (current === 'asc') return 'desc'
  return null
}

function priceSortLabel(sort: PriceSort): string {
  if (sort === 'asc') return 'Price \u25B2'
  if (sort === 'desc') return 'Price \u25BC'
  return 'Price'
}

export function ListingBrowser({
  onSelect,
}: {
  onSelect: (listing: IntelListingFields) => void
}) {
  const { data: listings, isLoading, error } = useListings()
  const { data: receiptData } = useReceipts()
  const galaxy = useGalaxyData()
  const [typeFilter, setTypeFilter] = useState<number | null>(null)
  const [regionFilter, setRegionFilter] = useState<string | null>(null)
  const [priceSort, setPriceSort] = useState<PriceSort>(null)
  const [verifiedOnly, setVerifiedOnly] = useState(false)

  const systemMap = galaxy?.systemMap ?? EMPTY_SYSTEM_MAP
  const regionCounts = galaxy?.regionSystemCounts ?? EMPTY_REGION_COUNTS

  // Active (non-expired, non-delisted) listings filtered by type
  const typeFiltered = useMemo(() => {
    if (!listings) return []
    return listings.filter((l) => {
      if (l.delisted) return false
      if (isExpired(l)) return false
      if (typeFilter !== null && l.intelType !== typeFilter) return false
      return true
    })
  }, [listings, typeFilter])

  // Unique regions present in the type-filtered listings
  const availableRegions = useMemo(() => {
    const regions = new Set<string>()
    for (const l of typeFiltered) {
      const system = systemMap.get(l.systemId)
      if (system) regions.add(system.region)
    }
    return [...regions].sort()
  }, [typeFiltered, systemMap])

  // Apply region filter + verified filter + price sort
  const filtered = useMemo(() => {
    let result = typeFiltered
    if (regionFilter) {
      result = result.filter((l) => {
        const system = systemMap.get(l.systemId)
        return system?.region === regionFilter
      })
    }
    if (verifiedOnly) {
      result = result.filter((l) => l.isVerified)
    }
    if (priceSort) {
      result = [...result].sort((a, b) => {
        const [x, y] = priceSort === 'asc'
          ? [a.individualPrice, b.individualPrice]
          : [b.individualPrice, a.individualPrice]
        return x < y ? -1 : x > y ? 1 : 0
      })
    }
    return result
  }, [typeFiltered, regionFilter, verifiedOnly, priceSort, systemMap])

  // Reset region filter when it no longer applies
  if (regionFilter && !availableRegions.includes(regionFilter)) {
    setRegionFilter(null)
  }

  if (isLoading) return <p className="loading-text"><span className="loading-spinner" />Loading listings...</p>
  if (error) return <div className="status-message status-error">Error: {error.message}</div>
  if (!listings?.length) return <p className="empty-state">No listings found.</p>

  return (
    <section>
      <h2>Intel Marketplace</h2>

      <div className="listing-filters">
        <button
          className={`filter-btn${typeFilter === null ? ' active' : ''}`}
          onClick={() => setTypeFilter(null)}
        >
          All
        </button>
        {INTEL_TYPE_LABELS.map(({ value, label }) => (
          <button
            key={value}
            className={`filter-btn${typeFilter === value ? ' active' : ''}`}
            onClick={() => setTypeFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="listing-filters">
        <select
          className="filter-select"
          value={regionFilter ?? ''}
          onChange={(e) => setRegionFilter(e.target.value || null)}
        >
          <option value="">All Regions</option>
          {availableRegions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <button
          className={`filter-btn${priceSort ? ' active' : ''}`}
          onClick={() => setPriceSort(nextPriceSort(priceSort))}
        >
          {priceSortLabel(priceSort)}
        </button>

        <button
          className={`filter-btn${verifiedOnly ? ' active' : ''}`}
          onClick={() => setVerifiedOnly(!verifiedOnly)}
        >
          Verified
        </button>
      </div>

      <ul className="listing-list">
        {filtered.map((listing) => {
          const owned = receiptData?.byListingId.has(listing.id)
          const ago = observedAgo(listing)
          return (
            <li
              key={listing.id}
              className={`listing-item${owned ? ' listing-item-owned' : ''}`}
              onClick={() => onSelect(listing)}
            >
              <div className="listing-item-badges">
                <span className="listing-item-type">
                  {INTEL_TYPE_LABEL_MAP[listing.intelType] ?? 'Unknown'}
                </span>
                {owned && <span className="listing-owned-badge">Owned</span>}
                {listing.jumpTxDigest.length > 0 ? (
                  <span className="listing-presence-badge">Presence Verified</span>
                ) : listing.isVerified ? (
                  <span className="listing-verified-badge">ZK-Verified</span>
                ) : null}
                {listing.hasDistanceProof && listing.distanceMeters !== null && (
                  <span className="listing-proximity-badge">
                    Proximity: {formatDistance(listing.distanceMeters / 1000)}
                  </span>
                )}
                {ago && (
                  <span className="listing-observed-badge">{ago}</span>
                )}
                <span className="listing-item-meta">
                  {' '}&mdash; {obfuscatedLocation(listing.systemId, systemMap, regionCounts)} | {truncateAddress(listing.scout)}
                </span>
              </div>
              <div>
                <div className="listing-item-price">
                  {listing.individualPrice.toString()} MIST
                  {mistToSui(listing.individualPrice.toString()) && (
                    <span className="deposit-badge"> ({mistToSui(listing.individualPrice.toString())} SUI)</span>
                  )}
                </div>
                {listing.stakeValue > 0n && (
                  <div className="deposit-badge">Deposit: {mistToSui(listing.stakeValue.toString()) ?? listing.stakeValue.toString()} SUI</div>
                )}
                <div className="listing-item-time">{timeRemaining(listing)}</div>
              </div>
            </li>
          )
        })}
        {filtered.length === 0 && (
          <li className="empty-state">No listings match the current filters.</li>
        )}
      </ul>
    </section>
  )
}

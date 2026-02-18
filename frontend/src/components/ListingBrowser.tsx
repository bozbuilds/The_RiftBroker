import { useState } from 'react'

import { INTEL_TYPE_LABELS, INTEL_TYPE_LABEL_MAP } from '../lib/constants'
import { timeRemaining, truncateAddress } from '../lib/format'
import type { IntelListingFields } from '../lib/types'
import { useListings } from '../hooks/useListings'

function isExpired(listing: IntelListingFields): boolean {
  const expiryMs = Number(listing.createdAt) + Number(listing.decayHours) * 3_600_000
  return Date.now() >= expiryMs
}

export function ListingBrowser({
  onSelect,
}: {
  onSelect: (listing: IntelListingFields) => void
}) {
  const { data: listings, isLoading, error } = useListings()
  const [typeFilter, setTypeFilter] = useState<number | null>(null)

  if (isLoading) return <p className="loading-text"><span className="loading-spinner" />Loading listings...</p>
  if (error) return <div className="status-message status-error">Error: {error.message}</div>
  if (!listings?.length) return <p className="empty-state">No listings found.</p>

  const filtered = listings.filter((l) => {
    if (l.delisted) return false
    if (isExpired(l)) return false
    if (typeFilter !== null && l.intelType !== typeFilter) return false
    return true
  })

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

      <ul className="listing-list">
        {filtered.map((listing) => (
          <li
            key={listing.id}
            className="listing-item"
            onClick={() => onSelect(listing)}
          >
            <div>
              <span className="listing-item-type">
                {INTEL_TYPE_LABEL_MAP[listing.intelType] ?? 'Unknown'}
              </span>
              <span className="listing-item-meta">
                {' '}— System {listing.systemId.toString()} | {truncateAddress(listing.scout)}
              </span>
            </div>
            <div>
              <div className="listing-item-price">{listing.individualPrice.toString()} MIST</div>
              <div className="listing-item-time">{timeRemaining(listing)}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

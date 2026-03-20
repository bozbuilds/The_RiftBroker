import type { ReactNode } from 'react'

import { INTEL_TYPE_LABEL_MAP } from '../lib/constants'
import { EMPTY_SYSTEM_MAP, EMPTY_REGION_COUNTS } from '../lib/empty-maps'
import { formatDistance, mistToSui, observedAgo, timeRemaining, truncateAddress } from '../lib/format'
import { obfuscatedLocation } from '../lib/galaxy-data'
import { TYPE_COLORS } from '../lib/region-data'
import type { RegionHeatData } from '../lib/region-data'
import type { IntelListingFields } from '../lib/types'
import type { SystemHeatData } from '../lib/heat-map-data'
import { useGalaxyData } from '../providers/GalaxyDataProvider'

interface RegionPanelProps {
  readonly region: RegionHeatData
  readonly footer?: ReactNode
  readonly onSelectListing: (listing: IntelListingFields) => void
  readonly onClose: () => void
}

/**
 * Slide-in drawer showing all listings in a clicked region.
 * Reuses listing item UI from ListingBrowser.
 */
export function RegionPanel({ region, footer, onSelectListing, onClose }: RegionPanelProps) {
  const galaxy = useGalaxyData()
  const color = TYPE_COLORS[region.dominantType]

  // Flatten all listings from system heat data
  const allListings = region.listings.flatMap((heat: SystemHeatData) => heat.listings)

  return (
    <div className="region-panel">
      <div className="region-panel-header" style={{ borderColor: color }}>
        <div>
          <h2 className="region-panel-title">{region.regionName}</h2>
          <span className="region-panel-meta">
            {region.listingCount} listing{region.listingCount !== 1 ? 's' : ''} &middot;{' '}
            {region.systemIds.length} system{region.systemIds.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button className="floating-panel-close" onClick={onClose} aria-label="Close panel">
          &times;
        </button>
      </div>

      <ul className="listing-list">
        {allListings.map((listing) => (
          <li
            key={listing.id}
            className="listing-item"
            onClick={() => onSelectListing(listing)}
          >
            <div className="listing-item-badges">
              <span className="listing-item-type">
                {INTEL_TYPE_LABEL_MAP[listing.intelType] ?? 'Unknown'}
              </span>
              {listing.isVerified && <span className="listing-verified-badge">ZK-Verified</span>}
              {listing.hasDistanceProof && listing.distanceMeters !== null && (
                <span className="listing-proximity-badge">
                  Proximity: {formatDistance(listing.distanceMeters / 1000)}
                </span>
              )}
              {(() => { const ago = observedAgo(listing); return ago && <span className="listing-observed-badge">{ago}</span> })()}
              <span className="listing-item-meta">
                — {obfuscatedLocation(listing.systemId, galaxy?.systemMap ?? EMPTY_SYSTEM_MAP, galaxy?.regionSystemCounts ?? EMPTY_REGION_COUNTS)} | {truncateAddress(listing.scout)}
              </span>
            </div>
            <div>
              <div className="listing-item-price">
                {listing.individualPrice.toString()} MIST
                {mistToSui(listing.individualPrice.toString()) && (
                  <span className="deposit-badge"> ({mistToSui(listing.individualPrice.toString())} SUI)</span>
                )}
              </div>
              <div className="listing-item-time">{timeRemaining(listing)}</div>
            </div>
          </li>
        ))}
        {allListings.length === 0 && (
          <li className="empty-state">No active listings in this region.</li>
        )}
      </ul>

      {footer && (
        <div className="floating-panel-footer">
          {footer}
        </div>
      )}
    </div>
  )
}

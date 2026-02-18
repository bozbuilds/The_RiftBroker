import { useCallback, useMemo, useState } from 'react'

import { INTEL_TYPE_LABEL_MAP } from '../../lib/constants'
import { timeRemaining, truncateAddress } from '../../lib/format'
import type { SystemHeatData } from '../../lib/heat-map-data'
import { DEMO_SYSTEMS, SYSTEM_MAP } from '../../lib/systems'
import type { IntelListingFields } from '../../lib/types'
import { SystemNode } from './SystemNode'

const VIEWBOX_SIZE = 1000

const REGION_LABELS = (() => {
  const regions = ['Core', 'North Frontier', 'Eastern Rim', 'Southern Expanse', 'Western Passage', 'Outer Reaches']
  return regions.map((region) => {
    const systems = DEMO_SYSTEMS.filter((s) => s.region === region)
    if (systems.length === 0) return null
    return {
      region,
      x: systems.reduce((sum, s) => sum + s.x, 0) / systems.length,
      y: systems.reduce((sum, s) => sum + s.y, 0) / systems.length,
    }
  }).filter(Boolean) as { region: string; x: number; y: number }[]
})()

export function HeatMap({
  systems,
  onSelectListing,
}: {
  systems: SystemHeatData[]
  onSelectListing?: (listing: IntelListingFields) => void
}) {
  const [selectedSystem, setSelectedSystem] = useState<bigint | null>(null)

  const systemMap = useMemo(
    () => new Map(systems.map((s) => [s.systemId, s])),
    [systems],
  )

  const selectedData = selectedSystem ? systemMap.get(selectedSystem) : undefined
  const selectedStar = selectedSystem ? SYSTEM_MAP.get(selectedSystem) : undefined

  const handleSystemClick = useCallback((systemId: bigint) => {
    setSelectedSystem((prev) => (prev === systemId ? null : systemId))
  }, [])

  return (
    <div className="heatmap-container">
      <svg
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        className="heatmap-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Background grid lines */}
        <defs>
          <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#1a2332" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={VIEWBOX_SIZE} height={VIEWBOX_SIZE} fill="url(#grid)" />

        {/* Region labels (precomputed at module level) */}
        {REGION_LABELS.map(({ region, x, y }) => (
          <text key={region} x={x} y={y - 40} textAnchor="middle" className="region-label">
            {region}
          </text>
        ))}

        {/* System nodes */}
        {DEMO_SYSTEMS.map((system) => (
          <SystemNode
            key={system.id.toString()}
            system={system}
            heatData={systemMap.get(system.id)}
            isSelected={selectedSystem === system.id}
            onClick={handleSystemClick}
          />
        ))}
      </svg>

      {/* Selected system detail panel */}
      {selectedData && selectedStar && (
        <div className="system-detail-panel">
          <h3>{selectedStar.name}</h3>
          <p className="system-detail-region">{selectedStar.region}</p>
          <p className="system-detail-stat">
            {selectedData.listingCount} listing{selectedData.listingCount !== 1 ? 's' : ''} |
            Avg: {selectedData.avgPrice.toString()} MIST
          </p>
          <ul className="system-listing-list">
            {selectedData.listings.map((listing) => (
              <li
                key={listing.id}
                className="system-listing-item"
                onClick={() => onSelectListing?.(listing)}
              >
                <span className="listing-type">{INTEL_TYPE_LABEL_MAP[listing.intelType] ?? 'Unknown'}</span>
                <span className="listing-price">{listing.individualPrice.toString()} MIST</span>
                <span className="listing-time">{timeRemaining(listing)}</span>
                <span className="listing-scout">{truncateAddress(listing.scout)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

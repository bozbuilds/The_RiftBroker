import { useCallback, useMemo, useState } from 'react'

import { INTEL_TYPE_LABEL_MAP } from '../../lib/constants'
import { timeRemaining, truncateAddress } from '../../lib/format'
import type { SystemHeatData } from '../../lib/heat-map-data'
import type { IntelListingFields } from '../../lib/types'
import { useGalaxyData } from '../../providers/GalaxyDataProvider'
import { SystemNode } from './SystemNode'

const VIEWBOX_SIZE = 1000
const SCENE_RANGE = 50
const PADDING = 60

// ─── Pure utilities (exported for testing) ───────────────────────────────────

/**
 * Project galaxy scene-space [x, z] coordinates onto an SVG viewport.
 * Scene range is [-sceneRange, +sceneRange] on the widest axis.
 * Adds padding so nodes are not clipped at the edges.
 */
export function sceneToSvg(
  sceneX: number,
  sceneZ: number,
  viewboxSize: number,
  sceneRange: number = SCENE_RANGE,
  padding: number = PADDING,
): { svgX: number; svgY: number } {
  const usable = viewboxSize - 2 * padding
  const svgX = padding + ((sceneX + sceneRange) / (2 * sceneRange)) * usable
  const svgY = padding + ((sceneZ + sceneRange) / (2 * sceneRange)) * usable
  return { svgX, svgY }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HeatMap({
  systems,
  onSelectListing,
}: {
  systems: SystemHeatData[]
  onSelectListing?: (listing: IntelListingFields) => void
}) {
  const galaxy = useGalaxyData()
  const [selectedSystem, setSelectedSystem] = useState<bigint | null>(null)

  const heatMap = useMemo(
    () => new Map(systems.map((s) => [s.systemId, s])),
    [systems],
  )

  // Join heat data with galaxy system metadata — only intel-active systems
  const activeSystems = useMemo(() => {
    if (!galaxy) return []
    return systems.flatMap((heat) => {
      const sys = galaxy.systemMap.get(heat.systemId)
      if (!sys) return []
      const { svgX, svgY } = sceneToSvg(sys.x, sys.z, VIEWBOX_SIZE)
      return [{ system: sys, heat, svgX, svgY }]
    })
  }, [systems, galaxy])

  // Region label positions: centroid of active systems per region
  const regionLabels = useMemo(() => {
    const byRegion = new Map<string, { xs: number[]; ys: number[] }>()
    for (const { system, svgX, svgY } of activeSystems) {
      let r = byRegion.get(system.region)
      if (!r) { r = { xs: [], ys: [] }; byRegion.set(system.region, r) }
      r.xs.push(svgX)
      r.ys.push(svgY)
    }
    return Array.from(byRegion.entries()).map(([region, { xs, ys }]) => ({
      region,
      x: xs.reduce((a, b) => a + b, 0) / xs.length,
      y: ys.reduce((a, b) => a + b, 0) / ys.length,
    }))
  }, [activeSystems])

  const selectedData = selectedSystem ? heatMap.get(selectedSystem) : undefined
  const selectedStar = selectedSystem ? galaxy?.systemMap.get(selectedSystem) : undefined

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

        {/* Region labels (computed from active systems) */}
        {regionLabels.map(({ region, x, y }) => (
          <text key={region} x={x} y={y - 40} textAnchor="middle" className="region-label">
            {region}
          </text>
        ))}

        {/* Intel-active system nodes only */}
        {activeSystems.map(({ system, heat, svgX, svgY }) => (
          <SystemNode
            key={system.id.toString()}
            system={system}
            svgX={svgX}
            svgY={svgY}
            heatData={heat}
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

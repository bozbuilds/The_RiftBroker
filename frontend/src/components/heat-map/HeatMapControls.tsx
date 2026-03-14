import { INTEL_TYPE_LABELS } from '../../lib/constants'
import type { HeatMapFilters } from '../../lib/heat-map-data'
import type { IntelType } from '../../lib/types'

export function HeatMapControls({
  filters,
  onFilterChange,
  totalSystems,
  activeSystems,
}: {
  filters: HeatMapFilters
  onFilterChange: (filters: HeatMapFilters) => void
  totalSystems: number
  activeSystems: number
}) {
  return (
    <div className="heatmap-controls">
      <div className="heatmap-controls-row">
        <div className="heatmap-type-filters">
          <button
            className={`filter-btn${filters.intelType === undefined ? ' active' : ''}`}
            onClick={() => onFilterChange({ ...filters, intelType: undefined })}
          >
            All
          </button>
          {INTEL_TYPE_LABELS.map(({ value, label, color }) => (
            <button
              key={value}
              className={`filter-btn${filters.intelType === value ? ' active' : ''}`}
              style={{ '--filter-color': color } as React.CSSProperties}
              onClick={() => onFilterChange({ ...filters, intelType: value as IntelType })}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="heatmap-stat">
          {activeSystems}/{totalSystems} systems active
        </span>
      </div>
      <div className="heatmap-controls-row">
        <button
          className={`filter-btn${filters.verifiedOnly ? ' active' : ''}`}
          onClick={() => onFilterChange({ ...filters, verifiedOnly: !filters.verifiedOnly })}
        >
          Verified Only
        </button>
      </div>
    </div>
  )
}

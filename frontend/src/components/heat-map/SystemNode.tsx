import type { GalaxySystem } from '../../lib/galaxy-data'
import type { SystemHeatData } from '../../lib/heat-map-data'

const TYPE_COLORS: Record<number, string> = {
  0: '#10b981', // resource — green
  1: '#ef4444', // fleet — red
  2: '#f59e0b', // base — amber
  3: '#3b82f6', // route — blue
}

export function SystemNode({
  system,
  svgX,
  svgY,
  heatData,
  isSelected,
  onClick,
}: {
  system: GalaxySystem
  svgX: number
  svgY: number
  heatData: SystemHeatData | undefined
  isSelected: boolean
  onClick: (systemId: bigint) => void
}) {
  const count = heatData?.listingCount ?? 0
  const freshness = heatData?.freshness ?? 0
  const color = heatData ? (TYPE_COLORS[heatData.dominantType] ?? '#6b7280') : '#374151'
  const radius = count > 0 ? Math.min(8 + count * 3, 24) : 5
  const opacity = count > 0 ? 0.3 + freshness * 0.7 : 0.25
  const isPulsing = count > 0 && freshness > 0.95

  return (
    <g
      className={`system-node${isSelected ? ' selected' : ''}${isPulsing ? ' pulsing' : ''}`}
      onClick={() => onClick(system.id)}
      style={{ cursor: 'pointer' }}
    >
      {/* Glow ring */}
      {count > 0 && (
        <circle
          cx={svgX}
          cy={svgY}
          r={radius + 6}
          fill={color}
          opacity={opacity * 0.2}
          className="glow-ring"
        />
      )}

      {/* Main dot */}
      <circle
        cx={svgX}
        cy={svgY}
        r={radius}
        fill={color}
        opacity={opacity}
        stroke={isSelected ? '#fff' : 'none'}
        strokeWidth={isSelected ? 2 : 0}
      />

      {/* Label */}
      <text
        x={svgX}
        y={svgY - radius - 6}
        textAnchor="middle"
        className="system-label"
        fill={count > 0 ? '#e5e7eb' : '#6b7280'}
        fontSize={count > 0 ? 11 : 9}
      >
        {system.name}
      </text>

      {/* Listing count badge */}
      {count > 0 && (
        <text
          x={svgX}
          y={svgY + 4}
          textAnchor="middle"
          fill="#fff"
          fontSize={10}
          fontWeight="bold"
        >
          {count}
        </text>
      )}
    </g>
  )
}

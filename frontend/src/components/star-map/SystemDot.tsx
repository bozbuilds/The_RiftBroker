import { Billboard, Text } from '@react-three/drei'
import { memo, useState } from 'react'

import type { GalaxySystem } from '../../lib/galaxy-data'
import { INTEL_TYPE_LABEL_MAP } from '../../lib/constants'
import { TYPE_COLORS } from '../../lib/region-data'
import type { IntelType } from '../../lib/types'

interface SystemDotProps {
  readonly system: GalaxySystem
  readonly listingCount?: number
  readonly dominantType?: IntelType
  readonly freshness?: number
  readonly onRegionClick?: (regionName: string) => void
}

/**
 * An intel-active system marker: small core dot + targeting ring(s), hover-only label.
 * Flattened to Y=0.3 (galactic plane) so dots sit inside their RegionZone wireframes.
 * Hover shows obfuscated intel summary — type + count, not the system name.
 */
function _SystemDot({
  system,
  listingCount = 0,
  dominantType = 0,
  freshness = 0,
  onRegionClick,
}: SystemDotProps) {
  const [hovered, setHovered] = useState(false)
  const color = listingCount > 0 ? TYPE_COLORS[dominantType] : '#4a5568'
  const emissiveIntensity = 0.3 + freshness * 0.5
  const typeName = INTEL_TYPE_LABEL_MAP[dominantType] ?? 'Intel'
  const hoverLabel = `${typeName} · ${listingCount} listing${listingCount !== 1 ? 's' : ''}`

  return (
    <group
      // Flatten to galactic plane so dots sit inside their region wireframes
      position={[system.x, 0.3, system.z]}
      onPointerEnter={(e) => {
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'crosshair'
      }}
      onPointerLeave={() => {
        setHovered(false)
        document.body.style.cursor = 'auto'
      }}
      onClick={(e) => {
        e.stopPropagation()
        onRegionClick?.(system.region)
      }}
    >
      {/* Small core anchor dot */}
      <mesh>
        <sphereGeometry args={[0.12, 8, 6]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          toneMapped={false}
        />
      </mesh>

      {/* Primary targeting ring — horizontal disc, main heat indicator */}
      {listingCount > 0 && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.28, 0.42, 32]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={hovered ? 0.9 : 0.6}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* Outer ring for high-density systems (3+ listings) */}
      {listingCount > 2 && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.65, 32]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={hovered ? 0.5 : 0.22}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* Obfuscated hover label — type + count only, never the system name */}
      {hovered && (
        <Billboard follow lockX={false} lockY={false} lockZ={false}>
          <Text
            position={[0, 0.8, 0]}
            fontSize={0.45}
            color="#e2f4ff"
            anchorX="center"
            anchorY="bottom"
          >
            {hoverLabel}
          </Text>
        </Billboard>
      )}
    </group>
  )
}

export const SystemDot = memo(_SystemDot)

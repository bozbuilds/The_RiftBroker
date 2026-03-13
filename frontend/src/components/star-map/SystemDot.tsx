import { Billboard, Text } from '@react-three/drei'
import { memo, useState } from 'react'

import type { GalaxySystem } from '../../lib/galaxy-data'
import { TYPE_COLORS } from '../../lib/region-data'
import type { IntelType } from '../../lib/types'

interface SystemDotProps {
  readonly system: GalaxySystem
  readonly listingCount?: number
  readonly dominantType?: IntelType
  readonly freshness?: number
}

/**
 * An intel-active star system: small core dot + targeting ring(s), hover-only label.
 * Coordinates are already in scene space [-50,+50] — no mapping needed.
 */
function _SystemDot({ system, listingCount = 0, dominantType = 0, freshness = 0 }: SystemDotProps) {
  const [hovered, setHovered] = useState(false)
  const color = listingCount > 0 ? TYPE_COLORS[dominantType] : '#4a5568'
  // Reduced emissive so Bloom doesn't overwhelm the scene
  const emissiveIntensity = 0.3 + freshness * 0.5

  return (
    <group
      position={[system.x, system.y, system.z]}
      onPointerEnter={(e) => {
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'crosshair'
      }}
      onPointerLeave={() => {
        setHovered(false)
        document.body.style.cursor = 'auto'
      }}
    >
      {/* Small core anchor dot — just enough to locate the system */}
      <mesh>
        <sphereGeometry args={[0.12, 8, 6]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          toneMapped={false}
        />
      </mesh>

      {/* Primary targeting ring — horizontal, main visual indicator */}
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

      {/* Label — only visible on hover */}
      {hovered && (
        <Billboard follow lockX={false} lockY={false} lockZ={false}>
          <Text
            position={[0, 0.8, 0]}
            fontSize={0.45}
            color="#e2f4ff"
            anchorX="center"
            anchorY="bottom"
          >
            {system.name}
          </Text>
        </Billboard>
      )}
    </group>
  )
}

export const SystemDot = memo(_SystemDot)

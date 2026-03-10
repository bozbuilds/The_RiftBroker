import { Billboard, Text } from '@react-three/drei'
import { useMemo } from 'react'

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
 * An intel-active star system: emissive sphere, billboard label, targeting ring.
 * Coordinates are already in scene space [-50,+50] — no mapping needed.
 */
export function SystemDot({ system, listingCount = 0, dominantType = 0, freshness = 0 }: SystemDotProps) {
  const radius = useMemo(() => Math.max(0.3, Math.min(0.8, 0.3 + listingCount * 0.1)), [listingCount])
  const color = listingCount > 0 ? TYPE_COLORS[dominantType] : '#4a5568'
  // Emissive floor raised to 0.8 so inactive-but-real systems still glow
  const emissiveIntensity = 0.8 + freshness * 1.2

  return (
    <group position={[system.x, system.y, system.z]}>
      <mesh>
        <sphereGeometry args={[radius, 16, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          toneMapped={false}
        />
      </mesh>

      {/* Targeting ring for systems with active intel listings */}
      {listingCount > 0 && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius + 0.3, radius + 0.5, 32]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.5}
            transparent
            opacity={0.6}
            toneMapped={false}
          />
        </mesh>
      )}

      <Billboard follow lockX={false} lockY={false} lockZ={false}>
        <Text
          position={[0, radius + 0.6, 0]}
          fontSize={0.6}
          color="#8ecae6"
          anchorX="center"
          anchorY="bottom"
        >
          {system.name}
        </Text>
      </Billboard>
    </group>
  )
}

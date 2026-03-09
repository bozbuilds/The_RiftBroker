import { Billboard, Text } from '@react-three/drei'
import { useMemo } from 'react'

import type { StarSystem } from '../../lib/systems'
import { svgTo3D, TYPE_COLORS } from '../../lib/region-data'
import type { IntelType } from '../../lib/types'

interface SystemDotProps {
  readonly system: StarSystem
  readonly listingCount?: number
  readonly dominantType?: IntelType
  readonly freshness?: number
}

/**
 * A single star system rendered as an emissive sphere with a billboard label.
 * Size scales with listing count, color from dominant intel type.
 */
export function SystemDot({ system, listingCount = 0, dominantType = 0, freshness = 0 }: SystemDotProps) {
  const [x, z] = useMemo(() => svgTo3D(system.x, system.y), [system.x, system.y])
  const y = system.z / 10 // Map z (-100..100) to Y axis (-10..10)

  const radius = Math.max(0.3, Math.min(0.8, 0.3 + listingCount * 0.1))
  const color = listingCount > 0 ? TYPE_COLORS[dominantType] : '#4a5568'
  const emissiveIntensity = 0.5 + freshness * 1.5

  return (
    <group position={[x, y, z]}>
      <mesh>
        <sphereGeometry args={[radius, 16, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          toneMapped={false}
        />
      </mesh>
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

import { memo, useMemo } from 'react'
import * as THREE from 'three'

import type { RegionHeatData } from '../../lib/region-data'

interface RegionZoneProps {
  readonly data: RegionHeatData
  readonly onClick: (regionName: string) => void
}

/**
 * Invisible click target for a region.
 * No visual, no hover — RegionClouds handles the diffuse fog overlay.
 * This provides a catch-all click area so the user can click
 * anywhere inside the region hull to open the region panel.
 */
function _RegionZone({ data, onClick }: RegionZoneProps) {
  // Extruded hull prism for polygon click target (3+ systems)
  const fillGeometry = useMemo(() => {
    if (data.hull.length < 3) return null
    const shape = new THREE.Shape()
    shape.moveTo(data.hull[0]![0], data.hull[0]![1])
    for (let i = 1; i < data.hull.length; i++)
      shape.lineTo(data.hull[i]![0], data.hull[i]![1])
    shape.closePath()
    return new THREE.ExtrudeGeometry(shape, { depth: 6, bevelEnabled: false })
  }, [data.hull])

  // Box for 2-point hulls
  const lineHit = useMemo(() => {
    if (data.hull.length !== 2) return null
    const [p1, p2] = data.hull as [[number, number], [number, number]]
    const dx = p2[0] - p1[0]
    const dz = p2[1] - p1[1]
    const len = Math.sqrt(dx * dx + dz * dz)
    return {
      len,
      angle: Math.atan2(dz, dx),
      mx: (p1[0] + p2[0]) / 2,
      mz: (p1[1] + p2[1]) / 2,
    }
  }, [data.hull])

  if (data.hull.length < 2) return null

  return (
    <group>
      {/* Invisible extruded polygon click target (3+ systems) */}
      {fillGeometry && (
        <mesh
          geometry={fillGeometry}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 3, 0]}
          onClick={() => onClick(data.regionName)}
        >
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Invisible box click target (2 systems) */}
      {lineHit && (
        <mesh
          position={[lineHit.mx, 1, lineHit.mz]}
          rotation={[-Math.PI / 2, 0, -lineHit.angle]}
          onClick={() => onClick(data.regionName)}
        >
          <boxGeometry args={[lineHit.len + 4, 6, 6]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}

export const RegionZone = memo(_RegionZone)

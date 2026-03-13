import { Html } from '@react-three/drei'
import { memo, useState, useMemo } from 'react'
import * as THREE from 'three'

import type { RegionHeatData } from '../../lib/region-data'

interface RegionZoneProps {
  readonly data: RegionHeatData
  readonly filteredData?: RegionHeatData
  readonly onClick: (regionName: string) => void
}

/**
 * Invisible interaction zone for a region.
 * No visual — the IntelNebula component handles all glow rendering.
 * Provides hover tooltip + click-to-open-region-panel.
 */
function _RegionZone({ data, filteredData, onClick }: RegionZoneProps) {
  const [hovered, setHovered] = useState(false)

  // Filled shape for polygon hull click hit-testing
  const fillGeometry = useMemo(() => {
    if (data.hull.length < 3) return null
    const shape = new THREE.Shape()
    shape.moveTo(data.hull[0]![0], data.hull[0]![1])
    for (let i = 1; i < data.hull.length; i++)
      shape.lineTo(data.hull[i]![0], data.hull[i]![1])
    shape.closePath()
    return new THREE.ShapeGeometry(shape)
  }, [data.hull])

  // Wide invisible hit plane for 2-point (line) hulls — gives a generous click target
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

  // Tooltip anchor at hull centroid
  const center = useMemo(() => {
    if (data.hull.length === 0) return new THREE.Vector3()
    const cx = data.hull.reduce((s, [x]) => s + x, 0) / data.hull.length
    const cz = data.hull.reduce((s, [, z]) => s + z, 0) / data.hull.length
    return new THREE.Vector3(cx, 2, cz)
  }, [data.hull])

  if (data.hull.length < 2) return null

  return (
    <group>
      {/* Invisible polygon hit area (3+ systems) */}
      {fillGeometry && (
        <mesh
          geometry={fillGeometry}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0.05, 0]}
          onClick={() => onClick(data.regionName)}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
        >
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Invisible line hit plane (2 systems) */}
      {lineHit && (
        <mesh
          position={[lineHit.mx, 0.3, lineHit.mz]}
          rotation={[-Math.PI / 2, 0, -lineHit.angle]}
          onClick={() => onClick(data.regionName)}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
        >
          <planeGeometry args={[lineHit.len + 2, 4]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Hover tooltip */}
      {hovered && (
        <Html position={center} center distanceFactor={40}>
          <div className="region-tooltip">
            <strong>{data.regionName}</strong>
            <span>
              {filteredData?.listingCount ?? data.listingCount} listing
              {(filteredData?.listingCount ?? data.listingCount) !== 1 ? 's' : ''}
            </span>
          </div>
        </Html>
      )}
    </group>
  )
}

export const RegionZone = memo(_RegionZone)

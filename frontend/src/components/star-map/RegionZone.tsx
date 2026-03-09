import { Line, Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useState, useMemo, useRef } from 'react'
import * as THREE from 'three'

import type { RegionHeatData } from '../../lib/region-data'
import { TYPE_COLORS } from '../../lib/region-data'

interface RegionZoneProps {
  readonly data: RegionHeatData
  readonly onClick: (regionName: string) => void
}

/**
 * Neon wireframe boundary zone for a region.
 * Renders the convex hull as a glowing line loop with a transparent fill for hit-testing.
 * Hover shows region name + listing count. Click opens region panel.
 * Fresh regions (freshness > 0.5) pulse with a sine-wave glow.
 */
export function RegionZone({ data, onClick }: RegionZoneProps) {
  const [hovered, setHovered] = useState(false)
  const fillRef = useRef<THREE.Mesh>(null)
  const color = TYPE_COLORS[data.dominantType]
  const isFresh = data.freshness > 0.5

  // Animate fill opacity for fresh regions
  useFrame(({ clock }) => {
    if (!fillRef.current || !isFresh) return
    const mat = fillRef.current.material as THREE.MeshBasicMaterial
    const pulse = 0.04 + Math.sin(clock.elapsedTime * 2) * 0.04
    mat.opacity = hovered ? 0.12 : pulse
  })

  // Convert 2D hull points to 3D positions on the grid plane (Y=0.1 to sit above grid)
  const hullPoints3D = useMemo(() => {
    if (data.hull.length < 2) return []
    // Close the loop
    const pts = [...data.hull, data.hull[0]!]
    return pts.map(([x, z]) => new THREE.Vector3(x, 0.1, z))
  }, [data.hull])

  // Create a filled shape for click hit-testing
  const fillGeometry = useMemo(() => {
    if (data.hull.length < 3) return null
    const shape = new THREE.Shape()
    shape.moveTo(data.hull[0]![0], data.hull[0]![1])
    for (let i = 1; i < data.hull.length; i++)
      shape.lineTo(data.hull[i]![0], data.hull[i]![1])
    shape.closePath()
    return new THREE.ShapeGeometry(shape)
  }, [data.hull])

  // Compute center for tooltip placement
  const center = useMemo(() => {
    if (data.hull.length === 0) return new THREE.Vector3()
    const cx = data.hull.reduce((s, [x]) => s + x, 0) / data.hull.length
    const cz = data.hull.reduce((s, [, z]) => s + z, 0) / data.hull.length
    return new THREE.Vector3(cx, 2, cz)
  }, [data.hull])

  if (data.hull.length < 2) return null

  return (
    <group>
      {/* Wireframe boundary */}
      <Line
        points={hullPoints3D}
        color={color}
        lineWidth={hovered ? 3 : 1.5}
        toneMapped={false}
      />

      {/* Transparent fill for mouse interaction + pulse animation */}
      {fillGeometry && (
        <mesh
          ref={fillRef}
          geometry={fillGeometry}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.05, 0]}
          onClick={() => onClick(data.regionName)}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
        >
          <meshBasicMaterial
            color={color}
            transparent
            opacity={hovered ? 0.12 : 0.04}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Hover tooltip */}
      {hovered && (
        <Html position={center} center distanceFactor={40}>
          <div className="region-tooltip">
            <strong>{data.regionName}</strong>
            <span>{data.listingCount} listing{data.listingCount !== 1 ? 's' : ''}</span>
          </div>
        </Html>
      )}
    </group>
  )
}

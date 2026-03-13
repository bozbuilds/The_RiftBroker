import { Line, Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { memo, useState, useMemo, useRef } from 'react'
import * as THREE from 'three'

import type { RegionHeatData } from '../../lib/region-data'
import { TYPE_COLORS } from '../../lib/region-data'

const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface RegionZoneProps {
  readonly data: RegionHeatData
  readonly onClick: (regionName: string) => void
}

/**
 * Neon wireframe boundary zone for a region.
 * Polygon hulls (3+ systems): filled shape + dual-pass wireframe.
 * Line hulls (2 systems): wide invisible hit plane + line segment.
 * Hover shows region name + listing count. Click opens region panel.
 * Fresh regions (freshness > 0.5) pulse with a sine-wave glow.
 */
function _RegionZone({ data, onClick }: RegionZoneProps) {
  const [hovered, setHovered] = useState(false)
  const fillRef = useRef<THREE.Mesh>(null)
  const color = TYPE_COLORS[data.dominantType]
  const isFresh = data.freshness > 0.5

  // Animate fill opacity for fresh polygon regions — respects prefers-reduced-motion
  useFrame(({ clock }) => {
    if (!fillRef.current || !isFresh) return
    const mat = fillRef.current.material as THREE.MeshBasicMaterial
    const pulse = PREFERS_REDUCED_MOTION
      ? 0.06
      : 0.06 + Math.sin(clock.elapsedTime * 2) * 0.03
    mat.opacity = hovered ? 0.12 : pulse
  })

  // Convert 2D hull points to 3D — raised to Y=0.5 to clear HoloGrid lines
  const hullPoints3D = useMemo(() => {
    if (data.hull.length < 2) return []
    const pts = [...data.hull, data.hull[0]!]
    return pts.map(([x, z]) => new THREE.Vector3(x, 0.5, z))
  }, [data.hull])

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
      {/* Wireframe boundary — outer glow pass + crisp inner line */}
      <Line
        points={hullPoints3D}
        color={color}
        lineWidth={hovered ? 6 : 4}
        transparent
        opacity={hovered ? 0.35 : 0.18}
        toneMapped={false}
      />
      <Line
        points={hullPoints3D}
        color={color}
        lineWidth={hovered ? 2 : 1.5}
        toneMapped={false}
      />

      {/* Polygon fill: hit-testing + pulse animation (3+ systems) */}
      {fillGeometry && (
        <mesh
          ref={fillRef}
          geometry={fillGeometry}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0.05, 0]}
          onClick={() => onClick(data.regionName)}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
        >
          <meshBasicMaterial
            color={color}
            transparent
            opacity={hovered ? 0.12 : 0.06}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Line hit plane: wide invisible target along the 2-point line segment */}
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
            <span>{data.listingCount} listing{data.listingCount !== 1 ? 's' : ''}</span>
          </div>
        </Html>
      )}
    </group>
  )
}

export const RegionZone = memo(_RegionZone)

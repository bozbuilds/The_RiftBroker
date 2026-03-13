import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import type { GalaxySystem } from '../../lib/galaxy-data'
import type { SystemHeatData } from '../../lib/heat-map-data'
import { INTEL_TYPE_COLORS_NEON } from '../../lib/constants'
import { renderNebulaTexture } from '../../lib/nebula-texture'
import type { NebulaPoint } from '../../lib/nebula-texture'

interface IntelNebulaProps {
  readonly systems: readonly { heat: SystemHeatData; system: GalaxySystem }[]
}

const CANVAS_SIZE = 512
const PLANE_SIZE = 100  // covers full -50..+50 scene in both axes

/**
 * Canvas-textured nebula cloud on the XZ galactic plane.
 * Each active intel system contributes a radial gradient blob via screen compositing.
 * Blob brightness and radius scale with listing count — denser regions glow more intensely.
 * Filtered via props: only systems passed in are drawn, so filter bar changes are automatic.
 */
export function IntelNebula({ systems }: IntelNebulaProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const textureRef = useRef<THREE.CanvasTexture | null>(null)

  // Create canvas + texture once on mount
  if (!canvasRef.current) {
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_SIZE
    canvas.height = CANVAS_SIZE
    canvasRef.current = canvas
    textureRef.current = new THREE.CanvasTexture(canvas)
  }

  // Re-draw whenever systems (or filter) changes
  useEffect(() => {
    const canvas = canvasRef.current
    const texture = textureRef.current
    if (!canvas || !texture) return

    const points: NebulaPoint[] = systems.map(({ heat, system }) => ({
      x: system.x,
      z: system.z,
      listingCount: heat.listingCount,
      color: INTEL_TYPE_COLORS_NEON[heat.dominantType] ?? '#00e5ff',
    }))

    renderNebulaTexture(canvas, points)
    texture.needsUpdate = true
  }, [systems])

  if (!textureRef.current) return null

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.2, 0]}
    >
      <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
      <meshBasicMaterial
        map={textureRef.current}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  )
}

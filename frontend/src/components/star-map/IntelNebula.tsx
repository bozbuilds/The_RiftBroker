import { Html } from '@react-three/drei'
import { useCallback, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import type { GalaxySystem } from '../../lib/galaxy-data'
import type { SystemHeatData } from '../../lib/heat-map-data'
import { INTEL_TYPE_COLORS_NEON } from '../../lib/constants'

interface IntelNebulaProps {
  readonly systems: readonly { heat: SystemHeatData; system: GalaxySystem }[]
  readonly onRegionClick: (regionName: string) => void
}

const SPRITE_TEX_SIZE = 128
const BASE_SCALE = 4
const SCALE_PER_LISTING = 1.5
/** Brief delay before clearing hover — prevents flicker when moving between sprites in the same region. */
const LEAVE_DEBOUNCE_MS = 50

/** Soft radial gradient texture for glow sprites (white — tinted by material color). */
function createGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = SPRITE_TEX_SIZE
  canvas.height = SPRITE_TEX_SIZE
  const ctx = canvas.getContext('2d')!
  const half = SPRITE_TEX_SIZE / 2
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half)
  gradient.addColorStop(0, 'rgba(255,255,255,0.6)')
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.2)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, SPRITE_TEX_SIZE, SPRITE_TEX_SIZE)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

interface RegionInfo {
  readonly listingCount: number
  readonly center: THREE.Vector3
}

/**
 * 3D additive-blended glow sprites for intel-active systems.
 * Each system becomes a camera-facing billboard at its real 3D position.
 * Overlapping sprites in dense clusters accumulate brightness naturally.
 * Handles hover tooltip + click to open region panel.
 */
export function IntelNebula({ systems, onRegionClick }: IntelNebulaProps) {
  const glowTexture = useMemo(createGlowTexture, [])
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null)
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>()

  // Aggregate listing counts + centroids per region for tooltips
  const regionInfo = useMemo(() => {
    const sums = new Map<string, { count: number; sx: number; sy: number; sz: number; n: number }>()
    for (const { heat, system } of systems) {
      const r = system.region
      const s = sums.get(r)
      if (s) {
        s.count += heat.listingCount
        s.sx += system.x
        s.sy += system.y
        s.sz += system.z
        s.n++
      } else {
        sums.set(r, { count: heat.listingCount, sx: system.x, sy: system.y, sz: system.z, n: 1 })
      }
    }

    const result = new Map<string, RegionInfo>()
    for (const [region, s] of sums) {
      result.set(region, {
        listingCount: s.count,
        center: new THREE.Vector3(s.sx / s.n, s.sy / s.n + 4, s.sz / s.n),
      })
    }
    return result
  }, [systems])

  const handleEnter = useCallback((region: string) => {
    clearTimeout(leaveTimer.current)
    setHoveredRegion(region)
  }, [])

  const handleLeave = useCallback(() => {
    leaveTimer.current = setTimeout(() => setHoveredRegion(null), LEAVE_DEBOUNCE_MS)
  }, [])

  const info = hoveredRegion ? regionInfo.get(hoveredRegion) : null

  return (
    <group>
      {systems.map(({ heat, system }) => {
        const color = INTEL_TYPE_COLORS_NEON[heat.dominantType] ?? '#00e5ff'
        const scale = BASE_SCALE + heat.listingCount * SCALE_PER_LISTING
        return (
          <sprite
            key={system.id.toString()}
            position={[system.x, system.y, system.z]}
            scale={[scale, scale, 1]}
            onPointerEnter={() => handleEnter(system.region)}
            onPointerLeave={handleLeave}
            onClick={() => onRegionClick(system.region)}
          >
            <spriteMaterial
              map={glowTexture}
              color={color}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </sprite>
        )
      })}

      {/* Region tooltip — anchored at region centroid above the glow */}
      {info && hoveredRegion && (
        <Html position={info.center} center distanceFactor={40} style={{ pointerEvents: 'none' }}>
          <div className="region-tooltip">
            <strong>{hoveredRegion}</strong>
            <span>
              {info.listingCount} listing{info.listingCount !== 1 ? 's' : ''}
            </span>
          </div>
        </Html>
      )}
    </group>
  )
}

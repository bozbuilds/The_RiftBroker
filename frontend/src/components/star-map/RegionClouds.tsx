import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

import { noise2D } from '../../lib/noise'
import { INTEL_TYPE_COLORS_NEON } from '../../lib/constants'
import type { GalaxySystem } from '../../lib/galaxy-data'
import type { RegionHeatData } from '../../lib/region-data'
import type { IntelType } from '../../lib/types'

const NOISE_TEX_SIZE = 256
const BASE_OPACITY = 0.15
const OPACITY_RANGE = 0.22
const MIN_FLOOR = 10
const NOISE_AMPLITUDE = 1.6
const NOISE2_AMPLITUDE = 0.6
const NOISE2_SCALE = 6.0
const MIN_CLOUD_RADIUS = 3 // minimum radius for single-system clouds

/** Simple string hash for deterministic noise seed per region. */
function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Generate a noise-distorted radial gradient texture for a cloud. */
function createCloudTexture(seed: number, opacity: number, color: THREE.Color): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = NOISE_TEX_SIZE
  canvas.height = NOISE_TEX_SIZE
  const ctx = canvas.getContext('2d')!
  const imgData = ctx.createImageData(NOISE_TEX_SIZE, NOISE_TEX_SIZE)
  const half = NOISE_TEX_SIZE / 2

  const r = Math.round(color.r * 255)
  const g = Math.round(color.g * 255)
  const b = Math.round(color.b * 255)
  const seedOffset = seed * 13.37

  for (let y = 0; y < NOISE_TEX_SIZE; y++) {
    for (let x = 0; x < NOISE_TEX_SIZE; x++) {
      const dx = (x - half) / half
      const dy = (y - half) / half
      const dist = Math.sqrt(dx * dx + dy * dy)

      // Radial gradient falloff
      const radial = 1 - Math.min(dist, 1)
      const gradientAlpha = radial * radial * opacity

      // Two-octave Perlin noise — first octave shapes the cloud boundary,
      // second adds fine-grained detail. Different offsets per octave.
      const nx = (x / NOISE_TEX_SIZE) * 3 + seedOffset
      const ny = (y / NOISE_TEX_SIZE) * 3 + seedOffset
      const n1 = noise2D(nx, ny)
      const n2 = noise2D(nx * NOISE2_SCALE / 3 + seedOffset * 1.7, ny * NOISE2_SCALE / 3 + seedOffset * 0.9)
      const n = n1 * NOISE_AMPLITUDE + n2 * NOISE2_AMPLITUDE
      const finalAlpha = gradientAlpha * (0.45 + n)

      const idx = (y * NOISE_TEX_SIZE + x) * 4
      imgData.data[idx] = r
      imgData.data[idx + 1] = g
      imgData.data[idx + 2] = b
      imgData.data[idx + 3] = Math.max(0, Math.min(255, finalAlpha * 255))
    }
  }

  ctx.putImageData(imgData, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

interface CloudEntry {
  key: string
  cx: number
  cy: number
  cz: number
  radius: number
  texture: THREE.CanvasTexture
}

interface RegionCloudsProps {
  readonly regions: RegionHeatData[]
  readonly systems: readonly GalaxySystem[]
}

/**
 * Diffuse fog clouds over intel-active regions.
 * Each (region, intelType) pair gets its own cloud so different types
 * within a region render at the correct positions with the correct color
 * rather than merging into a single off-center blob.
 */
export function RegionClouds({ regions, systems }: RegionCloudsProps) {
  const clouds = useMemo(() => {
    const systemMap = new Map(systems.map(s => [s.id, s]))

    // Pre-compute region centroids from ALL systems in each region
    const regionCentroids = new Map<string, { cx: number; cy: number; cz: number }>()
    const byRegion = new Map<string, GalaxySystem[]>()
    for (const s of systems) {
      const bucket = byRegion.get(s.region)
      if (bucket) bucket.push(s)
      else byRegion.set(s.region, [s])
    }
    for (const [name, bucket] of byRegion) {
      regionCentroids.set(name, {
        cx: bucket.reduce((s, c) => s + c.x, 0) / bucket.length,
        cy: bucket.reduce((s, c) => s + c.y, 0) / bucket.length,
        cz: bucket.reduce((s, c) => s + c.z, 0) / bucket.length,
      })
    }

    const result: CloudEntry[] = []

    for (const region of regions) {
      // Use the full region centroid so clouds are centered on the visual
      // bulk of the region, not just the 1-2 systems with listings
      const regionCenter = regionCentroids.get(region.regionName)
      if (!regionCenter) continue
      const { cx, cy, cz } = regionCenter

      // Group systems by their dominant intel type
      const typeGroups = new Map<IntelType, { systemIds: bigint[], listingCount: number }>()
      for (const heat of region.listings) {
        let group = typeGroups.get(heat.dominantType)
        if (!group) {
          group = { systemIds: [], listingCount: 0 }
          typeGroups.set(heat.dominantType, group)
        }
        group.systemIds.push(heat.systemId)
        group.listingCount += heat.listingCount
      }

      for (const [type, group] of typeGroups) {
        // Look up listing systems to compute radius from region centroid
        const listingCoords: { x: number; z: number }[] = []
        for (const sid of group.systemIds) {
          const sys = systemMap.get(sid)
          if (sys) listingCoords.push({ x: sys.x, z: sys.z })
        }
        if (listingCoords.length === 0) continue

        // Radius must reach from region centroid to the farthest listing system
        let maxDist = 0
        for (const c of listingCoords) {
          const d = Math.sqrt((c.x - cx) ** 2 + (c.z - cz) ** 2)
          if (d > maxDist) maxDist = d
        }
        const radius = Math.max(maxDist + 1, MIN_CLOUD_RADIUS)

        const opacity = BASE_OPACITY + Math.min(group.listingCount / MIN_FLOOR, 1) * OPACITY_RANGE
        const colorHex = INTEL_TYPE_COLORS_NEON[type] ?? '#00e5ff'
        const color = new THREE.Color(colorHex)
        // Seed includes type so same-region different-type clouds look distinct
        const seed = hashString(region.regionName + ':' + type)
        const texture = createCloudTexture(seed, opacity, color)

        result.push({ key: `${region.regionName}:${type}`, cx, cy, cz, radius, texture })
      }
    }

    return result
  }, [regions, systems])

  useEffect(() => {
    return () => { clouds.forEach(c => c.texture.dispose()) }
  }, [clouds])

  return (
    <group>
      {clouds.map(({ key, cx, cy, cz, radius, texture }) => (
        <sprite
          key={key}
          position={[cx, cy, cz]}
          scale={[radius * 2, radius * 2, 1]}
          renderOrder={-2}
        >
          <spriteMaterial
            map={texture}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
      ))}
    </group>
  )
}

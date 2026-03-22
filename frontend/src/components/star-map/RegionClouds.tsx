import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

import { noise2D } from '../../lib/noise'
import { hullCentroid, hullRadius } from '../../lib/hull'
import { INTEL_TYPE_COLORS_NEON } from '../../lib/constants'
import type { RegionHeatData } from '../../lib/region-data'

const NOISE_TEX_SIZE = 256
const BASE_OPACITY = 0.18
const OPACITY_RANGE = 0.27
const MIN_FLOOR = 10
const NOISE_AMPLITUDE = 0.8

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

      // Perlin noise distortion
      const nx = (x / NOISE_TEX_SIZE) * 3 + seedOffset
      const ny = (y / NOISE_TEX_SIZE) * 3 + seedOffset
      const n = noise2D(nx, ny)
      const finalAlpha = gradientAlpha * (0.5 + n * NOISE_AMPLITUDE)

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

interface RegionCloudsProps {
  readonly regions: RegionHeatData[]
}

/**
 * Diffuse fog clouds over intel-active regions.
 * Each region gets a noise-distorted radial gradient sprite.
 * Color = dominant intel type. Opacity scales with listing density.
 */
export function RegionClouds({ regions }: RegionCloudsProps) {
  const clouds = useMemo(() => {
    return regions.map(region => {
      const center = hullCentroid(region.hull)
      if (!center) return null
      const { cx, cz } = center
      const radius = hullRadius(region.hull, cx, cz) + 3 // padding
      const opacity = BASE_OPACITY + Math.min(region.listingCount / MIN_FLOOR, 1) * OPACITY_RANGE
      const colorHex = INTEL_TYPE_COLORS_NEON[region.dominantType] ?? '#00e5ff'
      const color = new THREE.Color(colorHex)
      const seed = hashString(region.regionName)
      const texture = createCloudTexture(seed, opacity, color)
      return { key: region.regionName, cx, cz, radius, texture }
    }).filter(Boolean) as { key: string; cx: number; cz: number; radius: number; texture: THREE.CanvasTexture }[]
  }, [regions])

  useEffect(() => {
    return () => { clouds.forEach(c => c.texture.dispose()) }
  }, [clouds])

  return (
    <group>
      {clouds.map(({ key, cx, cz, radius, texture }) => (
        <sprite
          key={key}
          position={[cx, 0.5, cz]}
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

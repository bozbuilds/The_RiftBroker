import { useMemo } from 'react'
import * as THREE from 'three'

import type { GalaxySystem } from '../../lib/galaxy-data'

// Scene units — galaxy spans -50..+50 on the widest axis
const CORE_RADIUS = 25

// Core cluster: brighter blue-navy
const CORE_R = 0.165, CORE_G = 0.322, CORE_B = 0.596   // #2a5298
// Frontier: dim deep-blue
const FRONT_R = 0.051, FRONT_G = 0.106, FRONT_B = 0.204  // #0d1b33

const DOT_TEX_SIZE = 32

/** Soft circular dot texture — smooth falloff from center to edge. */
function createDotTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = DOT_TEX_SIZE
  canvas.height = DOT_TEX_SIZE
  const ctx = canvas.getContext('2d')!
  const half = DOT_TEX_SIZE / 2
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.6)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, DOT_TEX_SIZE, DOT_TEX_SIZE)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

let _dotTexture: THREE.CanvasTexture | null = null
function getDotTexture() {
  if (!_dotTexture) _dotTexture = createDotTexture()
  return _dotTexture
}

interface GalaxyParticlesProps {
  readonly systems: readonly GalaxySystem[]
}

/**
 * Instanced background star field from real EVE Frontier coordinates.
 * All ~24K systems rendered as soft circular points — no interactivity.
 * Two-tier brightness: core cluster vs outer frontier.
 * Additive blending so dense regions glow instead of forming solid blocks.
 */
export function GalaxyParticles({ systems }: GalaxyParticlesProps) {
  const dotTexture = useMemo(getDotTexture, [])

  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(systems.length * 3)
    const col = new Float32Array(systems.length * 3)

    for (let i = 0; i < systems.length; i++) {
      const s = systems[i]!
      pos[i * 3]     = s.x
      pos[i * 3 + 1] = s.y
      pos[i * 3 + 2] = s.z

      // Horizontal distance from galactic centre (disc is flat in XZ)
      const dist = Math.sqrt(s.x * s.x + s.z * s.z)
      const core = dist < CORE_RADIUS
      col[i * 3]     = core ? CORE_R : FRONT_R
      col[i * 3 + 1] = core ? CORE_G : FRONT_G
      col[i * 3 + 2] = core ? CORE_B : FRONT_B
    }

    return [pos, col]
  }, [systems])

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={dotTexture}
        size={0.03}
        vertexColors
        transparent
        opacity={0.5}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  )
}

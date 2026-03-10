import { useMemo } from 'react'

import type { GalaxySystem } from '../../lib/galaxy-data'

// Scene units — galaxy spans -50..+50 on the widest axis
const CORE_RADIUS = 25

// Core cluster: brighter blue-navy
const CORE_R = 0.165, CORE_G = 0.322, CORE_B = 0.596   // #2a5298
// Frontier: dim deep-blue
const FRONT_R = 0.051, FRONT_G = 0.106, FRONT_B = 0.204  // #0d1b33

interface GalaxyParticlesProps {
  readonly systems: readonly GalaxySystem[]
}

/**
 * Instanced background star field from real EVE Frontier coordinates.
 * All ~24K systems rendered as tiny colored points — no interactivity.
 * Two-tier brightness: core cluster vs outer frontier.
 */
export function GalaxyParticles({ systems }: GalaxyParticlesProps) {
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
        size={0.06}
        vertexColors
        transparent
        opacity={0.85}
        sizeAttenuation
      />
    </points>
  )
}

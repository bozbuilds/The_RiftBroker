import { Stars } from '@react-three/drei'

/**
 * Ambient star particles providing parallax depth as camera rotates.
 * Uses drei's instanced Stars helper for performance.
 */
export function StarField() {
  return (
    <Stars
      radius={200}
      depth={100}
      count={1500}
      factor={3}
      saturation={0}
      fade
      speed={0.5}
    />
  )
}

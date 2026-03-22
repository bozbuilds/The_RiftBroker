import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

const GLOW_TEX_SIZE = 64

function createGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = GLOW_TEX_SIZE
  canvas.height = GLOW_TEX_SIZE
  const ctx = canvas.getContext('2d')!
  const half = GLOW_TEX_SIZE / 2
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half)
  gradient.addColorStop(0, 'rgba(255,255,255,0.7)')
  gradient.addColorStop(0.15, 'rgba(255,255,255,0.35)')
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.08)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, GLOW_TEX_SIZE, GLOW_TEX_SIZE)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

let _glowTex: THREE.CanvasTexture | null = null
function getGlowTexture() {
  if (!_glowTex) _glowTex = createGlowTexture()
  return _glowTex
}

interface SystemBloomProps {
  readonly position: [number, number, number]
  readonly mode: 'hover' | 'selected'
}

/**
 * Two-layer cinematic bloom for system hover/selection.
 *
 * Hover mode:
 *   - Inner glow: sharp, fades in fast (~100ms via opacity spring)
 *   - Outer halo: soft, fades in delayed (~150ms after inner)
 *
 * Selected mode:
 *   - Both layers persistent
 *   - Breathing pulse: opacity oscillates 0.6–1.0 at 1.5s period
 */
export function SystemBloom({ position, mode }: SystemBloomProps) {
  const glowTexture = useMemo(getGlowTexture, [])
  const innerRef = useRef<THREE.Sprite>(null)
  const outerRef = useRef<THREE.Sprite>(null)
  const startTime = useRef(performance.now())

  // Reset animation timer when position or mode changes
  useEffect(() => { startTime.current = performance.now() }, [position, mode])

  useFrame(({ clock }) => {
    const elapsed = (performance.now() - startTime.current) / 1000

    if (mode === 'hover') {
      // Inner: fade in over 0.1s
      const innerAlpha = Math.min(elapsed / 0.1, 1) * 0.8
      // Outer: delayed 0.15s, fade in over 0.15s
      const outerAlpha = Math.max(0, Math.min((elapsed - 0.15) / 0.15, 1)) * 0.3
      if (innerRef.current) innerRef.current.material.opacity = innerAlpha
      if (outerRef.current) outerRef.current.material.opacity = outerAlpha
    } else {
      // Selected: breathing pulse
      const pulse = 0.7 + Math.sin(clock.elapsedTime * (Math.PI * 2 / 1.5)) * 0.3
      if (innerRef.current) innerRef.current.material.opacity = pulse * 0.6
      if (outerRef.current) outerRef.current.material.opacity = pulse * 0.2
    }
  })

  // Inner glow: ~3x system dot size, sharp
  // Outer halo: ~8x system dot size, soft
  return (
    <group>
      <sprite ref={innerRef} position={position} scale={[0.8, 0.8, 1]}>
        <spriteMaterial
          map={glowTexture}
          color="#ffcc66"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={outerRef} position={position} scale={[2.2, 2.2, 1]}>
        <spriteMaterial
          map={glowTexture}
          color="#ff8800"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
    </group>
  )
}

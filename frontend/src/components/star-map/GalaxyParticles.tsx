import { useFrame, useThree, ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import type { GalaxySystem } from '../../lib/galaxy-data'

// Warm amber palette
const AMBER_R = 1.0, AMBER_G = 0.702, AMBER_B = 0.278  // #ffb347

const DOT_TEX_SIZE = 32

const VERT = `
uniform float uTime;
attribute float aPhase;
attribute float aHighlight;
varying float vBrightness;
varying float vHighlight;

void main() {
  vHighlight = aHighlight;
  float flicker = 1.0 + sin(uTime * 0.8 + aPhase) * 0.02;
  vBrightness = flicker * (1.0 + aHighlight * 0.6);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = (50.0 + aHighlight * 30.0) * (1.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`

const FRAG = `
uniform sampler2D uDotTex;
uniform vec3 uColor;
varying float vBrightness;
varying float vHighlight;

void main() {
  vec4 tex = texture2D(uDotTex, gl_PointCoord);
  float alpha = tex.a * (0.5 + vHighlight * 0.3);
  gl_FragColor = vec4(uColor * vBrightness, alpha);
}
`

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

/** Throttle helper — returns true if enough time has passed. */
function useThrottle(ms: number) {
  const lastRef = useRef(0)
  return useCallback(() => {
    const now = performance.now()
    if (now - lastRef.current < ms) return false
    lastRef.current = now
    return true
  }, [ms])
}

interface GalaxyParticlesProps {
  readonly systems: readonly GalaxySystem[]
  readonly highlightRegion: string | null
  readonly onSystemHover: (system: GalaxySystem | null) => void
  readonly onSystemClick: (system: GalaxySystem) => void
}

/**
 * All ~24K systems as warm amber dots with ambient flicker.
 * Custom ShaderMaterial for per-vertex brightness variation.
 * Hover/click raycasting with 50ms throttle.
 * Systems in the highlighted region render brighter and slightly larger.
 */
export function GalaxyParticles({ systems, highlightRegion, onSystemHover, onSystemClick }: GalaxyParticlesProps) {
  const dotTexture = useMemo(getDotTexture, [])
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const { raycaster } = useThree()
  const shouldFire = useThrottle(50)

  // Set raycaster threshold for points
  useEffect(() => {
    raycaster.params.Points = { threshold: 0.5 }
  }, [raycaster])

  const [positions, phases] = useMemo(() => {
    const pos = new Float32Array(systems.length * 3)
    const ph = new Float32Array(systems.length)
    for (let i = 0; i < systems.length; i++) {
      const s = systems[i]!
      pos[i * 3] = s.x
      pos[i * 3 + 1] = s.y
      pos[i * 3 + 2] = s.z
      ph[i] = i * 0.37  // deterministic phase offset
    }
    return [pos, ph]
  }, [systems])

  // Per-vertex highlight flag — 1.0 for systems in the selected region, 0.0 otherwise
  const highlights = useMemo(() => {
    const hl = new Float32Array(systems.length)
    if (highlightRegion)
      for (let i = 0; i < systems.length; i++)
        hl[i] = systems[i]!.region === highlightRegion ? 1.0 : 0.0
    return hl
  }, [systems, highlightRegion])
  const highlightAttrRef = useRef<THREE.BufferAttribute>(null)

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uDotTex: { value: dotTexture },
    uColor: { value: new THREE.Color(AMBER_R, AMBER_G, AMBER_B) },
  }), [dotTexture])

  // Push highlight changes to the GPU
  useEffect(() => {
    if (highlightAttrRef.current) {
      highlightAttrRef.current.array = highlights
      highlightAttrRef.current.needsUpdate = true
    }
  }, [highlights])

  useFrame(({ clock }) => {
    if (materialRef.current) materialRef.current.uniforms.uTime!.value = clock.elapsedTime
  })

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    // Suppress hover while panning (right or middle button held)
    if (e.nativeEvent.buttons & 6) { onSystemHover(null); return }
    if (!shouldFire()) return
    const idx = e.index
    if (idx !== undefined && idx >= 0 && idx < systems.length)
      onSystemHover(systems[idx]!)
    else
      onSystemHover(null)
  }, [systems, onSystemHover, shouldFire])

  const handlePointerLeave = useCallback(() => {
    onSystemHover(null)
  }, [onSystemHover])

  // Track pointer-down position to distinguish clicks from drag-orbits
  const downPos = useRef<{ x: number; y: number } | null>(null)
  const DRAG_THRESHOLD_SQ = 9 // 3px — anything beyond is a drag

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    downPos.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
  }, [])

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    // Suppress click if the pointer moved (user was orbiting)
    if (downPos.current) {
      const dx = e.nativeEvent.clientX - downPos.current.x
      const dy = e.nativeEvent.clientY - downPos.current.y
      if (dx * dx + dy * dy > DRAG_THRESHOLD_SQ) return
    }
    const idx = e.index
    if (idx !== undefined && idx >= 0 && idx < systems.length) {
      e.stopPropagation()
      onSystemClick(systems[idx]!)
    }
  }, [systems, onSystemClick])

  return (
    <points
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
    >
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
        <bufferAttribute ref={highlightAttrRef} attach="attributes-aHighlight" args={[highlights, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

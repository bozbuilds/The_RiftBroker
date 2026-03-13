import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import type { GalaxySystem } from '../../lib/galaxy-data'
import type { RegionHeatData } from '../../lib/region-data'
import type { SystemHeatData } from '../../lib/heat-map-data'
import { GalaxyParticles } from './GalaxyParticles'
import { StarField } from './StarField'
import { HoloGrid } from './HoloGrid'
import { IntelNebula } from './IntelNebula'
import { RegionZone } from './RegionZone'

interface StarMapSceneProps {
  /** All galaxy systems — rendered as background particles. */
  readonly systems: readonly GalaxySystem[]
  readonly filteredRegions: RegionHeatData[]
  readonly systemHeats: SystemHeatData[]
  readonly panelOpen: boolean
  readonly onRegionClick: (regionName: string) => void
}

/** O(1) heat lookup by system ID. */
function useHeatMap(systemHeats: SystemHeatData[]) {
  return useMemo(
    () => new Map(systemHeats.map((h) => [h.systemId, h])),
    [systemHeats],
  )
}

/** Build O(1) system lookup and filter to intel-active systems only. */
function useActiveSystems(systems: readonly GalaxySystem[], heatMap: Map<bigint, SystemHeatData>) {
  return useMemo(() => {
    const sysMap = new Map(systems.map((s) => [s.id, s]))
    return Array.from(heatMap.values())
      .map((heat) => ({ heat, system: sysMap.get(heat.systemId) }))
      .filter((x): x is { heat: SystemHeatData; system: GalaxySystem } => x.system != null)
  }, [systems, heatMap])
}

// ─── Pure utilities (exported for testing) ───────────────────────────────────

/**
 * Compute the XZ centroid of a set of scene-space positions.
 * Returns null for an empty array (no intel activity to orient toward).
 */
export function computeCentroid(
  systems: readonly { x: number; z: number }[],
): { cx: number; cz: number } | null {
  if (systems.length === 0) return null
  const cx = systems.reduce((s, sys) => s + sys.x, 0) / systems.length
  const cz = systems.reduce((s, sys) => s + sys.z, 0) / systems.length
  return { cx, cz }
}

// ─── Camera controllers (inside Canvas) ─────────────────────────────────────

/**
 * Orients the camera toward the centroid of intel-active systems on first load.
 * Runs once after OrbitControls registers as default; does nothing thereafter.
 */
function CameraAutoOrient({ centroid }: { centroid: { cx: number; cz: number } | null }) {
  const { camera, controls } = useThree()
  const oriented = useRef(false)

  useEffect(() => {
    if (oriented.current || !centroid || !controls) return
    camera.position.set(centroid.cx, 60, centroid.cz + 60)
    ;(controls as any).target?.set(centroid.cx, 0, centroid.cz)
    ;(controls as any).update?.()
    oriented.current = true
  }, [centroid, camera, controls])

  return null
}

const LERP_SPEED = 0.07
const ARRIVE_THRESHOLD_SQ = 0.01

/**
 * Smoothly pans the camera + orbit target to a focus point when a region is clicked.
 * Preserves the current viewing angle and distance — only translates the focus.
 */
function CameraFocus({ target }: { target: { cx: number; cz: number } | null }) {
  const { camera, controls } = useThree()
  const focusRef = useRef<{ cx: number; cz: number } | null>(null)

  useEffect(() => {
    focusRef.current = target
  }, [target])

  useFrame(() => {
    const focus = focusRef.current
    const ctrl = controls as any
    if (!focus || !ctrl?.target) return

    // Current offset from orbit target to camera (preserves viewing angle)
    const offX = camera.position.x - ctrl.target.x
    const offY = camera.position.y - ctrl.target.y
    const offZ = camera.position.z - ctrl.target.z

    // Lerp orbit target toward focus centroid
    ctrl.target.x += (focus.cx - ctrl.target.x) * LERP_SPEED
    ctrl.target.z += (focus.cz - ctrl.target.z) * LERP_SPEED

    // Move camera to maintain same offset
    camera.position.set(ctrl.target.x + offX, ctrl.target.y + offY, ctrl.target.z + offZ)
    ctrl.update()

    // Stop when close enough
    const dx = focus.cx - ctrl.target.x
    const dz = focus.cz - ctrl.target.z
    if (dx * dx + dz * dz < ARRIVE_THRESHOLD_SQ) {
      ctrl.target.x = focus.cx
      ctrl.target.z = focus.cz
      camera.position.set(focus.cx + offX, ctrl.target.y + offY, focus.cz + offZ)
      ctrl.update()
      focusRef.current = null
    }
  })

  return null
}

const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth < 768

/**
 * Full 3D star map scene.
 * Background: instanced GalaxyParticles (all ~24K systems, blue-navy).
 * Foreground: IntelNebula glow clouds for intel-active systems.
 */
export function StarMapScene({
  systems,
  filteredRegions,
  systemHeats,
  panelOpen,
  onRegionClick,
}: StarMapSceneProps) {
  const heatMap = useHeatMap(systemHeats)
  const activeSystems = useActiveSystems(systems, heatMap)
  const [focusTarget, setFocusTarget] = useState<{ cx: number; cz: number } | null>(null)

  const centroid = useMemo(
    () => computeCentroid(activeSystems.map(({ system }) => system)),
    [activeSystems],
  )

  // Region centroids for camera focus on click
  const regionCentroids = useMemo(() => {
    const sums = new Map<string, { sx: number; sz: number; n: number }>()
    for (const { system } of activeSystems) {
      const s = sums.get(system.region)
      if (s) {
        s.sx += system.x
        s.sz += system.z
        s.n++
      } else {
        sums.set(system.region, { sx: system.x, sz: system.z, n: 1 })
      }
    }
    const result = new Map<string, { cx: number; cz: number }>()
    for (const [region, s] of sums)
      result.set(region, { cx: s.sx / s.n, cz: s.sz / s.n })
    return result
  }, [activeSystems])

  const handleRegionClick = useCallback((regionName: string) => {
    const c = regionCentroids.get(regionName)
    if (c) setFocusTarget(c)
    onRegionClick(regionName)
  }, [regionCentroids, onRegionClick])

  return (
    <Canvas
      camera={{ position: [0, 60, 60], fov: 50 }}
      dpr={[1, 1.5]}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      flat
    >
      <ambientLight intensity={0.15} />
      <pointLight position={[0, 80, 0]} intensity={0.3} />

      <CameraAutoOrient centroid={centroid} />
      <CameraFocus target={focusTarget} />

      <StarField />
      <HoloGrid />

      {/* Background star field — all real systems, no interactivity */}
      {!IS_MOBILE && systems.length > 0 && (
        <GalaxyParticles systems={systems} />
      )}

      {filteredRegions.map((r) => (
        <RegionZone
          key={r.regionName}
          data={r}
          onClick={handleRegionClick}
        />
      ))}

      <IntelNebula systems={activeSystems} onRegionClick={handleRegionClick} />

      <OrbitControls
        makeDefault
        enabled={!panelOpen}
        enablePan
        maxDistance={150}
        minDistance={5}
        enableDamping
        dampingFactor={0.05}
        maxPolarAngle={Math.PI / 2.2}
        mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
      />

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.6}
          intensity={0.4}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  )
}

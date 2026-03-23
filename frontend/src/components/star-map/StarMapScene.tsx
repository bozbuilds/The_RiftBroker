import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import type { GalaxySystem } from '../../lib/galaxy-data'
import type { RegionHeatData } from '../../lib/region-data'
import { hullCentroid } from '../../lib/hull'
import { GalaxyParticles } from './GalaxyParticles'
import { StarField } from './StarField'
import { RegionClouds } from './RegionClouds'
import { RegionZone } from './RegionZone'
import { Vignette } from './Vignette'
import { SystemLabel } from './SystemLabel'
import { SystemBloom } from './SystemBloom'

interface StarMapSceneProps {
  readonly systems: readonly GalaxySystem[]
  readonly filteredRegions: RegionHeatData[]
  readonly panelOpen: boolean
  readonly onRegionClick: (regionName: string) => void
}

// ─── Pure utilities (exported for testing) ───────────────────────────────────

export function computeCentroid(
  systems: readonly { x: number; z: number }[],
): { cx: number; cz: number } | null {
  if (systems.length === 0) return null
  const cx = systems.reduce((s, sys) => s + sys.x, 0) / systems.length
  const cz = systems.reduce((s, sys) => s + sys.z, 0) / systems.length
  return { cx, cz }
}

// ─── Camera controllers (inside Canvas) ─────────────────────────────────────

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

    const offX = camera.position.x - ctrl.target.x
    const offY = camera.position.y - ctrl.target.y
    const offZ = camera.position.z - ctrl.target.z

    ctrl.target.x += (focus.cx - ctrl.target.x) * LERP_SPEED
    ctrl.target.z += (focus.cz - ctrl.target.z) * LERP_SPEED

    camera.position.set(ctrl.target.x + offX, ctrl.target.y + offY, ctrl.target.z + offZ)
    ctrl.update()

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

export function StarMapScene({
  systems,
  filteredRegions,
  panelOpen,
  onRegionClick,
}: StarMapSceneProps) {
  const [focusTarget, setFocusTarget] = useState<{ cx: number; cz: number } | null>(null)
  const [hoveredSystem, setHoveredSystem] = useState<GalaxySystem | null>(null)
  const [selectedSystem, setSelectedSystem] = useState<GalaxySystem | null>(null)

  // Centroid from regions with intel (for initial camera orientation)
  const centroid = useMemo(() => {
    const allHullPoints = filteredRegions.flatMap(r => r.hull.map(([x, z]) => ({ x, z })))
    return computeCentroid(allHullPoints)
  }, [filteredRegions])

  // Region centroids for camera focus on click
  const regionCentroids = useMemo(() => {
    const result = new Map<string, { cx: number; cz: number }>()
    for (const r of filteredRegions) {
      const c = hullCentroid(r.hull)
      if (c) result.set(r.regionName, c)
    }
    return result
  }, [filteredRegions])

  const handleRegionClick = useCallback((regionName: string) => {
    const c = regionCentroids.get(regionName)
    if (c) setFocusTarget(c)
    onRegionClick(regionName)
  }, [regionCentroids, onRegionClick])

  const handleSystemClick = useCallback((system: GalaxySystem) => {
    setSelectedSystem(prev => prev?.id === system.id ? null : system)
    // If region has no intel centroid, use the clicked system's position as fallback focus
    if (!regionCentroids.has(system.region))
      setFocusTarget({ cx: system.x, cz: system.z })
    handleRegionClick(system.region)
  }, [handleRegionClick, regionCentroids])

  const handleSystemHover = useCallback((system: GalaxySystem | null) => {
    setHoveredSystem(system)
  }, [])

  // Escape key deselects
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedSystem(null)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Hover shows region name by default; individual system names only within selected region
  const hoverInSelectedRegion = selectedSystem && hoveredSystem
    && hoveredSystem.region === selectedSystem.region
    && hoveredSystem.id !== selectedSystem.id

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

      <Vignette />
      <StarField />

      <RegionClouds regions={filteredRegions} systems={systems} />

      {filteredRegions.map((r) => (
        <RegionZone
          key={r.regionName}
          data={r}
          onClick={handleRegionClick}
        />
      ))}

      {!IS_MOBILE && systems.length > 0 && (
        <GalaxyParticles
          systems={systems}
          highlightRegion={selectedSystem?.region ?? null}
          onSystemHover={handleSystemHover}
          onSystemClick={handleSystemClick}
        />
      )}

      {/* Selected system — persistent bloom + label */}
      {selectedSystem && (
        <>
          <SystemBloom
            position={[selectedSystem.x, selectedSystem.y, selectedSystem.z]}
            mode="selected"
          />
          <SystemLabel
            name={selectedSystem.name}
            subtitle={selectedSystem.region}
            position={[selectedSystem.x, selectedSystem.y, selectedSystem.z]}
            selected
          />
        </>
      )}

      {/* Hover within selected region — system name + hover bloom */}
      {hoverInSelectedRegion && hoveredSystem && (
        <>
          <SystemBloom
            position={[hoveredSystem.x, hoveredSystem.y, hoveredSystem.z]}
            mode="hover"
          />
          <SystemLabel
            name={hoveredSystem.name}
            subtitle={hoveredSystem.region}
            position={[hoveredSystem.x, hoveredSystem.y, hoveredSystem.z]}
          />
        </>
      )}

      {/* Hover outside selected region — region name, no bloom */}
      {hoveredSystem && !hoverInSelectedRegion && hoveredSystem.id !== selectedSystem?.id && (
        <SystemLabel
          name={hoveredSystem.region}
          position={[hoveredSystem.x, hoveredSystem.y, hoveredSystem.z]}
        />
      )}

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

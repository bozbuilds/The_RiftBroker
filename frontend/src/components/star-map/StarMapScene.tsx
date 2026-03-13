import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef } from 'react'

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
  readonly regions: RegionHeatData[]
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

// ─── Camera auto-orient (inside Canvas) ──────────────────────────────────────

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
    // OrbitControls registers as default controls — exposes target + update()
    ;(controls as any).target?.set(centroid.cx, 0, centroid.cz)
    ;(controls as any).update?.()
    oriented.current = true
  }, [centroid, camera, controls])

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
  regions,
  filteredRegions,
  systemHeats,
  panelOpen,
  onRegionClick,
}: StarMapSceneProps) {
  const heatMap = useHeatMap(systemHeats)
  const activeSystems = useActiveSystems(systems, heatMap)

  const centroid = useMemo(
    () => computeCentroid(activeSystems.map(({ system }) => system)),
    [activeSystems],
  )

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

      <StarField />
      <HoloGrid />

      {/* Background star field — all real systems, no interactivity */}
      {!IS_MOBILE && systems.length > 0 && (
        <GalaxyParticles systems={systems} />
      )}

      {regions.map((r) => (
        <RegionZone
          key={r.regionName}
          data={r}
          filteredData={filteredRegions.find((fr) => fr.regionName === r.regionName)}
          onClick={onRegionClick}
        />
      ))}

      <IntelNebula systems={activeSystems} />

      <OrbitControls
        makeDefault
        enabled={!panelOpen}
        enablePan={false}
        maxDistance={150}
        minDistance={5}
        enableDamping
        dampingFactor={0.05}
        maxPolarAngle={Math.PI / 2.2}
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

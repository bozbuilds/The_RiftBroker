import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { useMemo } from 'react'

import type { GalaxySystem } from '../../lib/galaxy-data'
import type { RegionHeatData } from '../../lib/region-data'
import type { SystemHeatData } from '../../lib/heat-map-data'
import { GalaxyParticles } from './GalaxyParticles'
import { StarField } from './StarField'
import { HoloGrid } from './HoloGrid'
import { SystemDot } from './SystemDot'
import { RegionZone } from './RegionZone'

interface StarMapSceneProps {
  /** All galaxy systems — rendered as background particles. */
  readonly systems: readonly GalaxySystem[]
  readonly regions: RegionHeatData[]
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

const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth < 768

/**
 * Full 3D star map scene.
 * Background: instanced GalaxyParticles (all ~24K systems, blue-navy).
 * Foreground: SystemDots only for intel-active systems with targeting rings.
 */
export function StarMapScene({
  systems,
  regions,
  systemHeats,
  panelOpen,
  onRegionClick,
}: StarMapSceneProps) {
  const heatMap = useHeatMap(systemHeats)
  const activeSystems = useActiveSystems(systems, heatMap)

  return (
    <Canvas
      camera={{ position: [0, 60, 60], fov: 50 }}
      dpr={[1, 1.5]}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      flat
    >
      <ambientLight intensity={0.15} />
      <pointLight position={[0, 80, 0]} intensity={0.3} />

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
          onClick={onRegionClick}
        />
      ))}

      {/* Interactive dots — only systems with active intel */}
      {activeSystems.map(({ heat, system }) => (
        <SystemDot
          key={system.id.toString()}
          system={system}
          listingCount={heat.listingCount}
          dominantType={heat.dominantType}
          freshness={heat.freshness}
        />
      ))}

      <OrbitControls
        enabled={!panelOpen}
        enablePan={false}
        maxDistance={120}
        minDistance={20}
        enableDamping
        dampingFactor={0.05}
        maxPolarAngle={Math.PI / 2.2}
      />

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.6}
          intensity={0.8}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  )
}

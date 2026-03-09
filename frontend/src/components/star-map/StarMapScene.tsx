import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { useMemo } from 'react'

import type { StarSystem } from '../../lib/systems'
import type { RegionHeatData } from '../../lib/region-data'
import type { SystemHeatData } from '../../lib/heat-map-data'
import { StarField } from './StarField'
import { HoloGrid } from './HoloGrid'
import { SystemDot } from './SystemDot'
import { RegionZone } from './RegionZone'

interface StarMapSceneProps {
  readonly systems: readonly StarSystem[]
  readonly regions: RegionHeatData[]
  readonly systemHeats: SystemHeatData[]
  readonly panelOpen: boolean
  readonly onRegionClick: (regionName: string) => void
}

/** Look up per-system heat data for the SystemDot props. */
function useSystemHeatMap(systemHeats: SystemHeatData[]) {
  return useMemo(
    () => new Map(systemHeats.map((h) => [h.systemId, h])),
    [systemHeats],
  )
}

/**
 * Full 3D star map scene with holographic grid, star field,
 * system dots, and region wireframe zones.
 */
export function StarMapScene({
  systems,
  regions,
  systemHeats,
  panelOpen,
  onRegionClick,
}: StarMapSceneProps) {
  const heatMap = useSystemHeatMap(systemHeats)

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

      {regions.map((r) => (
        <RegionZone
          key={r.regionName}
          data={r}
          onClick={onRegionClick}
        />
      ))}

      {systems.map((s) => {
        const heat = heatMap.get(s.id)
        return (
          <SystemDot
            key={s.id.toString()}
            system={s}
            listingCount={heat?.listingCount}
            dominantType={heat?.dominantType}
            freshness={heat?.freshness}
          />
        )
      })}

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

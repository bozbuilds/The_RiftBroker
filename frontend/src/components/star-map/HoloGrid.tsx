import { Grid } from '@react-three/drei'
import { DoubleSide } from 'three'

/**
 * Holographic perspective grid on the XZ plane at Y=0.
 * Provides spatial reference and scale feedback during orbit.
 */
export function HoloGrid() {
  return (
    <Grid
      position={[0, 0, 0]}
      args={[200, 200]}
      cellSize={5}
      cellThickness={0.4}
      cellColor="#0a3d5c"
      sectionSize={25}
      sectionThickness={1}
      sectionColor="#0e7490"
      fadeDistance={80}
      fadeStrength={1.5}
      infiniteGrid
      side={DoubleSide}
    />
  )
}

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.999, 1.0);
}
`

const FRAG = `
varying vec2 vUv;
void main() {
  vec2 center = vUv - 0.5;
  float dist = length(center) * 2.0;
  float vignette = smoothstep(0.4, 1.4, dist);
  gl_FragColor = vec4(0.0, 0.0, 0.0, vignette * 0.35);
}
`

/**
 * Fullscreen radial vignette — darkens corners to frame the galaxy.
 * Rendered as a screen-space quad (NDC coordinates, no camera transform).
 */
export function Vignette() {
  const material = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    }),
    [],
  )

  useEffect(() => {
    return () => material.dispose()
  }, [material])

  return (
    <mesh renderOrder={-1} frustumCulled={false} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}

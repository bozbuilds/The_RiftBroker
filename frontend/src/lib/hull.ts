/** Compute centroid from convex hull vertices. */
export function hullCentroid(
  hull: readonly [number, number][],
): { cx: number; cz: number } | null {
  if (hull.length === 0) return null
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length
  const cz = hull.reduce((s, p) => s + p[1], 0) / hull.length
  return { cx, cz }
}

/** Compute bounding radius of hull from a center point. */
export function hullRadius(
  hull: readonly [number, number][],
  cx: number,
  cz: number,
): number {
  let maxR = 0
  for (const [x, z] of hull) {
    const dx = x - cx, dz = z - cz
    maxR = Math.max(maxR, Math.sqrt(dx * dx + dz * dz))
  }
  return Math.max(maxR, 2) // minimum radius to avoid zero-size clouds
}

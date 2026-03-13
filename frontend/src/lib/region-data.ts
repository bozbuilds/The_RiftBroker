import { INTEL_TYPE_COLORS_NEON } from './constants'
import type { IntelType } from './types'
import type { SystemHeatData } from './heat-map-data'
import type { GalaxySystem } from './galaxy-data'

/** Neon colors keyed by intel type for region wireframes and system dots. */
export const TYPE_COLORS = INTEL_TYPE_COLORS_NEON

export interface RegionHeatData {
  readonly regionName: string
  readonly systemIds: readonly bigint[]
  readonly listingCount: number
  readonly dominantType: IntelType
  readonly freshness: number
  readonly avgPrice: bigint
  readonly listings: readonly SystemHeatData[]
  readonly hull: readonly [number, number][]
}

/**
 * Map SVG coordinates to 3D scene coordinates.
 * x (0-1000) → Three.js X (-50 to +50)
 * y (0-1000) → Three.js Z (-50 to +50)
 */
export function svgTo3D(x: number, y: number): [number, number] {
  return [(x - 500) / 10, (y - 500) / 10]
}

/**
 * Compute the 2D convex hull using the monotone chain algorithm.
 * Returns points in counter-clockwise order.
 */
export function convexHull2D(points: [number, number][]): [number, number][] {
  const n = points.length
  if (n <= 1) return [...points]
  if (n === 2) return [...points]

  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])

  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

  // Build lower hull
  const lower: [number, number][] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
      lower.pop()
    lower.push(p)
  }

  // Build upper hull
  const upper: [number, number][] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
      upper.pop()
    upper.push(p)
  }

  // Remove last point of each half because it's repeated
  lower.pop()
  upper.pop()

  return [...lower, ...upper]
}

/**
 * Group system heat data by region, computing aggregate stats and convex hulls.
 */
export function aggregateByRegion(
  systemHeats: SystemHeatData[],
  allSystems: readonly GalaxySystem[],
): RegionHeatData[] {
  if (systemHeats.length === 0) return []

  const systemMap = new Map(allSystems.map((s) => [s.id, s]))

  // Group heats by region
  const regionGroups = new Map<string, { heats: SystemHeatData[], systems: GalaxySystem[] }>()

  for (const heat of systemHeats) {
    const system = systemMap.get(heat.systemId)
    if (!system) continue

    let group = regionGroups.get(system.region)
    if (!group) {
      group = { heats: [], systems: [] }
      regionGroups.set(system.region, group)
    }
    group.heats.push(heat)
    group.systems.push(system)
  }

  const result: RegionHeatData[] = []

  for (const [regionName, { heats, systems }] of regionGroups) {
    const totalListings = heats.reduce((sum, h) => sum + h.listingCount, 0)
    const maxFreshness = Math.max(...heats.map((h) => h.freshness))

    // Dominant type: count listings by type across all systems
    const typeCounts = new Map<IntelType, number>()
    for (const heat of heats) {
      typeCounts.set(
        heat.dominantType,
        (typeCounts.get(heat.dominantType) ?? 0) + heat.listingCount,
      )
    }
    let dominant: IntelType = 0 as IntelType
    let maxCount = 0
    for (const [type, count] of typeCounts) {
      if (count > maxCount) {
        maxCount = count
        dominant = type
      }
    }

    // Average price across all system averages weighted by listing count
    const totalPrice = heats.reduce((sum, h) => sum + h.avgPrice * BigInt(h.listingCount), 0n)
    const avgPrice = totalListings > 0 ? totalPrice / BigInt(totalListings) : 0n

    // Convex hull in XZ plane using real scene-space coordinates
    const points: [number, number][] = systems.map((s) => [s.x, s.z])
    const hull = convexHull2D(points)

    result.push({
      regionName,
      systemIds: heats.map((h) => h.systemId),
      listingCount: totalListings,
      dominantType: dominant,
      freshness: maxFreshness,
      avgPrice,
      listings: heats,
      hull,
    })
  }

  result.sort((a, b) => b.listingCount - a.listingCount)
  return result
}

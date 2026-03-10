/** Raw system record from the hosted galaxy JSON (produced by scripts/extract_starmap.py). */
export interface RawGalaxySystem {
  readonly id: number
  readonly name: string
  readonly x: number
  readonly y: number
  readonly z: number
  readonly regionId: number | null
  readonly region: string
}

/** A solar system normalized to Three.js scene coordinates (-50..+50 on the widest axis). */
export interface GalaxySystem {
  readonly id: bigint
  readonly name: string
  /** Scene-space X coordinate (normalized from EVE meters). */
  readonly x: number
  /** Scene-space Y coordinate (normalized from EVE meters). */
  readonly y: number
  /** Scene-space Z coordinate (normalized from EVE meters). */
  readonly z: number
  readonly region: string
  readonly regionId: number | null
}

export interface GalaxyData {
  readonly systems: GalaxySystem[]
  /** O(1) lookup: system bigint ID → GalaxySystem */
  readonly systemMap: Map<bigint, GalaxySystem>
  /** O(1) lookup: region name → systems in that region */
  readonly regionMap: Map<string, GalaxySystem[]>
  /** O(1) lookup: region name → total system count */
  readonly regionSystemCounts: Map<string, number>
}

/**
 * Normalize raw EVE meter-scale coordinates to scene space [-50, +50] on the widest axis.
 * Uses a single uniform scale factor to preserve the galaxy's natural disc shape.
 */
export function normalizeCoordinates(
  raw: readonly RawGalaxySystem[],
): { x: number; y: number; z: number }[] {
  if (raw.length === 0) return []
  if (raw.length === 1) return [{ x: 0, y: 0, z: 0 }]

  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity

  for (const s of raw) {
    if (s.x < minX) minX = s.x
    if (s.x > maxX) maxX = s.x
    if (s.y < minY) minY = s.y
    if (s.y > maxY) maxY = s.y
    if (s.z < minZ) minZ = s.z
    if (s.z > maxZ) maxZ = s.z
  }

  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const cz = (minZ + maxZ) / 2

  // Use the widest axis span to compute the scale factor so output fits [-50, +50]
  const halfSpan = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2
  const scale = halfSpan === 0 ? 1 : 50 / halfSpan

  return raw.map(s => ({
    x: (s.x - cx) * scale,
    y: (s.y - cy) * scale,
    z: (s.z - cz) * scale,
  }))
}

/**
 * Parse a raw galaxy JSON array into the structured GalaxyData used by the app.
 * Normalizes coordinates and builds all lookup maps.
 */
export function parseGalaxyData(raw: readonly RawGalaxySystem[]): GalaxyData {
  const normalized = normalizeCoordinates(raw)

  const systems: GalaxySystem[] = raw.map((r, i) => {
    // normalized and raw are co-indexed — normalized[i] always exists
    const norm = normalized[i]!
    return {
      id: BigInt(r.id),
      name: r.name,
      x: norm.x,
      y: norm.y,
      z: norm.z,
      region: r.region,
      regionId: r.regionId,
    }
  })

  const systemMap = new Map<bigint, GalaxySystem>()
  const regionMap = new Map<string, GalaxySystem[]>()

  for (const s of systems) {
    systemMap.set(s.id, s)
    if (s.region) {
      const bucket = regionMap.get(s.region)
      if (bucket) bucket.push(s)
      else regionMap.set(s.region, [s])
    }
  }

  const regionSystemCounts = new Map<string, number>()
  for (const [region, bucket] of regionMap)
    regionSystemCounts.set(region, bucket.length)

  return { systems, systemMap, regionMap, regionSystemCounts }
}

/**
 * Obfuscate a system location: returns "RegionName (N systems)" for known systems.
 * Pure function — receives maps explicitly so it works with async-loaded galaxy data.
 */
export function obfuscatedLocation(
  systemId: bigint,
  systemMap: Map<bigint, GalaxySystem>,
  regionSystemCounts: Map<string, number>,
): string {
  const system = systemMap.get(systemId)
  if (!system) return 'Unknown Region'
  const count = regionSystemCounts.get(system.region) ?? 0
  return `${system.region} (${count} systems)`
}

/**
 * Fetch and parse the galaxy JSON from a CDN URL.
 * Throws on network error, non-ok HTTP status, or invalid JSON shape.
 */
export async function loadGalaxyData(url: string): Promise<GalaxyData> {
  const res = await fetch(url)
  if (!res.ok)
    throw new Error(`Failed to fetch galaxy data: HTTP ${res.status}`)

  const raw: unknown = await res.json()
  if (!Array.isArray(raw))
    throw new Error('Galaxy data JSON must be an array of system objects')

  return parseGalaxyData(raw as RawGalaxySystem[])
}

/**
 * Demo star system data for the intel heat map.
 * x/y are normalized to 0-1000 for legacy SVG rendering.
 * z adds vertical depth for the 3D star map (-100 to +100 range).
 * In production, these would come from the EVE Frontier API or Atlas.
 */

export interface StarSystem {
  readonly id: bigint
  readonly name: string
  readonly x: number
  readonly y: number
  readonly z: number
  readonly region: string
}

export const DEMO_SYSTEMS: readonly StarSystem[] = [
  // Core cluster — high traffic hub
  { id: 30004759n, name: 'G-M4GK', x: 500, y: 480, z: 10, region: 'Core' },
  { id: 30004760n, name: 'E-VKJV', x: 540, y: 440, z: -15, region: 'Core' },
  { id: 30004761n, name: 'YHN-3K', x: 460, y: 520, z: 25, region: 'Core' },
  { id: 30004762n, name: 'KBP7-G', x: 520, y: 530, z: -5, region: 'Core' },

  // Northern frontier — resource-rich
  { id: 30001000n, name: 'VNX-P0', x: 380, y: 200, z: 40, region: 'North Frontier' },
  { id: 30001001n, name: 'CR-AQH', x: 450, y: 150, z: -30, region: 'North Frontier' },
  { id: 30001002n, name: 'H-PA29', x: 520, y: 180, z: 55, region: 'North Frontier' },
  { id: 30001003n, name: 'B-DBYQ', x: 600, y: 220, z: -20, region: 'North Frontier' },

  // Eastern rim — fleet activity
  { id: 30002000n, name: 'QYZM-W', x: 750, y: 350, z: -45, region: 'Eastern Rim' },
  { id: 30002001n, name: 'RNF-YH', x: 800, y: 420, z: 35, region: 'Eastern Rim' },
  { id: 30002002n, name: 'U-HVIX', x: 770, y: 500, z: -10, region: 'Eastern Rim' },

  // Southern expanse — bases and structures
  { id: 30003000n, name: 'Z-UZZN', x: 420, y: 750, z: -55, region: 'Southern Expanse' },
  { id: 30003001n, name: 'C-N4OD', x: 500, y: 800, z: 20, region: 'Southern Expanse' },
  { id: 30003002n, name: 'A-ELE2', x: 580, y: 770, z: -35, region: 'Southern Expanse' },
  { id: 30003003n, name: 'F-TE1T', x: 350, y: 820, z: 45, region: 'Southern Expanse' },

  // Western passage — trade routes
  { id: 30005000n, name: 'D-GTMI', x: 200, y: 380, z: 60, region: 'Western Passage' },
  { id: 30005001n, name: 'T-IPZB', x: 150, y: 450, z: -25, region: 'Western Passage' },
  { id: 30005002n, name: 'J-GAMP', x: 230, y: 530, z: 30, region: 'Western Passage' },

  // Outer reaches — sparse, dangerous
  { id: 30006000n, name: 'X-7OMU', x: 120, y: 180, z: -70, region: 'Outer Reaches' },
  { id: 30006001n, name: 'K-6K16', x: 850, y: 750, z: 50, region: 'Outer Reaches' },
]

export const SYSTEM_MAP = new Map(DEMO_SYSTEMS.map((s) => [s.id, s]))

export const REGION_SYSTEM_COUNTS: Record<string, number> = DEMO_SYSTEMS.reduce(
  (acc, s) => { acc[s.region] = (acc[s.region] ?? 0) + 1; return acc },
  {} as Record<string, number>,
)

export function obfuscatedLocation(systemId: bigint): string {
  const system = SYSTEM_MAP.get(systemId)
  if (!system) return 'Unknown Region'
  const count = REGION_SYSTEM_COUNTS[system.region]
  return `${system.region} (${count} systems)`
}

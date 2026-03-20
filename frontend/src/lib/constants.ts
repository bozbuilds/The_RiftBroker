// Galaxy data JSON (served from /public — relative URL works in dev and production)
export const GALAXY_JSON_URL = '/galaxy.json'

// Deployed on SUI testnet (2026-03-20) — Phase 5 deploy with presence proofs
export const PACKAGE_ID = '0x361aeb5a22f71441800364cd976941e7de302dc0eaad55fbf4de18cf378fbf01'

// SUI shared Clock object
export const CLOCK_ID = '0x6'

// Seal testnet key servers (open mode)
// Source: https://seal-docs.wal.app/Pricing/
export const SEAL_KEY_SERVERS = [
  { objectId: '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75', weight: 1 },
  { objectId: '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8', weight: 1 },
  { objectId: '0x6068c0acb197dddbacd4746a9de7f025b2ed5a5b6c1b1ab44dade4426d141da2', weight: 1 },
]

// Canonical intel type labels and colors
export const INTEL_TYPE_LABELS: readonly { value: number; label: string; color: string }[] = [
  { value: 0, label: 'Resource', color: '#10b981' },
  { value: 1, label: 'Fleet', color: '#ef4444' },
  { value: 2, label: 'Base', color: '#f59e0b' },
  { value: 3, label: 'Route', color: '#3b82f6' },
]

export const INTEL_TYPE_LABEL_MAP: Record<number, string> = Object.fromEntries(
  INTEL_TYPE_LABELS.map(({ value, label }) => [value, label]),
)

/** Standard intel-type colors (SVG heat map, UI badges). Derived from INTEL_TYPE_LABELS. */
export const INTEL_TYPE_COLORS: Record<number, string> = Object.fromEntries(
  INTEL_TYPE_LABELS.map(({ value, color }) => [value, color]),
)

/** Neon holographic palette for the 3D star map scene. */
export const INTEL_TYPE_COLORS_NEON: Record<number, string> = {
  0: '#00e5ff', // Resource — cyan
  1: '#ff1744', // Fleet — red
  2: '#76ff03', // Base — green
  3: '#ffea00', // Route — yellow
}

/** LocationVKey shared object ID — created by marketplace init() on Phase 5 deploy. */
export const LOCATION_VKEY_ID = '0xd4bddf80818eb19fb57c7fbea6e69998e96adbfa6210ceaa60e0b33a86720913'

/** DistanceVKey shared object ID — created by marketplace init() on Phase 5 deploy. */
export const DISTANCE_VKEY_ID = '0xfaf9a8fc17e18253b06d943b00cb7c0f3970dca61007b27690e8c9738d1ebc24'

/** EVE Frontier world-contracts package ID on Utopia testnet. */
export const WORLD_PACKAGE_ID = '0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75'

/** PresenceVKey shared object ID — created by marketplace init() on Phase 5 deploy. */
export const PRESENCE_VKEY_ID = '0x39bebf31fd6923be13d3662c687f3c07823da059fba0e6f249a70f4121f68c02'

export const DECRYPT_STATUS_LABELS: Record<string, string> = {
  signing: 'Sign session key in wallet...',
  downloading: 'Downloading encrypted intel...',
  decrypting: 'Decrypting payload...',
}

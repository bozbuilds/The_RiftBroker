// Galaxy data JSON (served from /public — relative URL works in dev and production)
export const GALAXY_JSON_URL = '/galaxy.json'

// Deployed on SUI testnet (2026-03-21) — Stackable event badges deploy
export const PACKAGE_ID = '0x6d102eec5614b00e508394bf3fc593658056e2914e450ab00ea1ee2637cd3f74'

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

/** LocationVKey shared object ID — created by marketplace init(). */
export const LOCATION_VKEY_ID = '0xc1c590a05ac9ccccafe71c5b1dc57d893c596fcef25c50e0f4d23bf1ed817534'

/** DistanceVKey shared object ID — created by marketplace init(). */
export const DISTANCE_VKEY_ID = '0xf2618435cf48894b3d73b506c6037246b7121a750197f36bf7725cc7b4c980e7'

/** EVE Frontier world-contracts package ID — Utopia (sandbox). */
export const WORLD_PACKAGE_UTOPIA = '0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75'

/** EVE Frontier world-contracts package ID — Stillness (live production). */
export const WORLD_PACKAGE_STILLNESS = '0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c'

/** Active world package for event queries (Stillness has active data in Cycle 5). */
export const WORLD_PACKAGE_ID = WORLD_PACKAGE_STILLNESS

/** PresenceVKey shared object ID — created by marketplace init(). */
export const PRESENCE_VKEY_ID = '0x2d3cc33f5a0dca41417153ed7a23d7341ce38020c4bb6e895415fa51fd14cb05'

export const DECRYPT_STATUS_LABELS: Record<string, string> = {
  signing: 'Sign session key in wallet...',
  downloading: 'Downloading encrypted intel...',
  decrypting: 'Decrypting payload...',
}

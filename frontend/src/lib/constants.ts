// Galaxy data JSON (served from /public — relative URL works in dev and production)
export const GALAXY_JSON_URL = '/galaxy.json'

// Deployed on SUI testnet (2026-03-19) — Phase 2 v3 deploy with AbsDiff hint-based distance proofs
export const PACKAGE_ID = '0x8ff3a1a4e6f983749026ca40c73e3d6ea6ee75c70f947d80914f56d50278b7d2'

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

/** LocationVKey shared object ID — created by marketplace init() on 2026-03-19 deploy. */
export const LOCATION_VKEY_ID = '0xfee9b6601212ce44715874a99ff3f5ccec304a03b7e3cc2e7a41b81a83b19bb1'

/** DistanceVKey shared object ID — created by marketplace init() on 2026-03-19 deploy. */
export const DISTANCE_VKEY_ID = '0xf728694a51f4e88980d601c45be6e84cdd75e28ff996a3de10560131ca344026'

export const DECRYPT_STATUS_LABELS: Record<string, string> = {
  signing: 'Sign session key in wallet...',
  downloading: 'Downloading encrypted intel...',
  decrypting: 'Decrypting payload...',
}

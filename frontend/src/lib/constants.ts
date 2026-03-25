// Galaxy data JSON (served from /public — relative URL works in dev and production)
export const GALAXY_JSON_URL = '/galaxy.json'

// Deployed on SUI testnet (2026-03-21) — Stackable event badges deploy
export const PACKAGE_ID = '0x01b41b06eb493c65575ac7a504a2923cdde4fb54859b1a8f7a9cfe3e720e2c67'

// SUI shared Clock object
export const CLOCK_ID = '0x6'

// Seed wallet — listings from this address show a "Demo" badge in the UI
export const SEED_SCOUT_ADDRESS = '0x42a0c3adb1991438134869f0df7dbfc81a1b9911091516b8a2684d240083769b'

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
export const LOCATION_VKEY_ID = '0xb4f326a5dd8592e7d6b901d7a5ca38366f951240f94f2ad4e80605892bf6fe2d'

/** DistanceVKey shared object ID — created by marketplace init(). */
export const DISTANCE_VKEY_ID = '0xd1aa6cdd538f3c714ca799500d33a6c1d7f42d42826aa821b0fb7af54465130d'

/** EVE Frontier world-contracts package ID — Utopia (sandbox). */
export const WORLD_PACKAGE_UTOPIA = '0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75'

/** EVE Frontier world-contracts package ID — Stillness (live production). */
export const WORLD_PACKAGE_STILLNESS = '0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c'

/** Active world package for event queries (Stillness has active data in Cycle 5). */
export const WORLD_PACKAGE_ID = WORLD_PACKAGE_STILLNESS

/** PresenceVKey shared object ID — created by marketplace init(). */
export const PRESENCE_VKEY_ID = '0x8f7fc8d6f07fbb9415683f65765a692dcb628f3d983063a0dc21c2452f5cdff0'

/** ReputationVKey shared object ID — created by marketplace init() when Phase 4b package is deployed. */
export const REPUTATION_VKEY_ID = ''

/** ScoutRegistry shared object ID — created by marketplace init(). Set after deploy that includes Phase 4a. */
export const SCOUT_REGISTRY_ID = ''

/** Minimum total verified listings for a scout to pass the "Trusted Scouts" filter. */
export const TRUSTED_SCOUT_MIN_VERIFIED = 5n

export const DECRYPT_STATUS_LABELS: Record<string, string> = {
  signing: 'Sign session key in wallet...',
  downloading: 'Downloading encrypted intel...',
  decrypting: 'Decrypting payload...',
}

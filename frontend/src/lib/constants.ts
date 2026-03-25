// Galaxy data JSON (served from /public — relative URL works in dev and production)
export const GALAXY_JSON_URL = '/galaxy.json'

// Deployed on SUI testnet (2026-03-25) — Phase 4 scout reputation deploy
export const PACKAGE_ID = '0xdb94b50f1dc1652d8a7a4299b6367c33a66ab2005fffd0f3815c325ab84d6f11'

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
export const LOCATION_VKEY_ID = '0x29f32b3394a9550176299f28d5d406cab8129f86524a61a15e0a66c0a60e42e4'

/** DistanceVKey shared object ID — created by marketplace init(). */
export const DISTANCE_VKEY_ID = '0x5087b225470a37ca587a6f73d7d17908500cb43df1e0ac8816eee962f4cdd477'

/** EVE Frontier world-contracts package ID — Utopia (sandbox). */
export const WORLD_PACKAGE_UTOPIA = '0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75'

/** EVE Frontier world-contracts package ID — Stillness (live production). */
export const WORLD_PACKAGE_STILLNESS = '0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c'

/** Active world package for event queries (Stillness has active data in Cycle 5). */
export const WORLD_PACKAGE_ID = WORLD_PACKAGE_STILLNESS

/** PresenceVKey shared object ID — created by marketplace init(). */
export const PRESENCE_VKEY_ID = '0x671d42311c5fa43c690e112e1c41bdd86cd294fb35c8c0198c8a3ed535abed9a'

/** ReputationVKey shared object ID — created by marketplace init(). */
export const REPUTATION_VKEY_ID = '0xcb9a8de361a9d9b795ad4eef975339918c768b5d9dfdcf6efd9f5d3a9693bb41'

/** ScoutRegistry shared object ID — created by marketplace init(). */
export const SCOUT_REGISTRY_ID = '0xfcfdc4d5b07a9173b13f912541b3c50ffb2491058be6345709fae03b0148d778'

/** Minimum total verified listings for a scout to pass the "Trusted Scouts" filter. */
export const TRUSTED_SCOUT_MIN_VERIFIED = 5n

export const DECRYPT_STATUS_LABELS: Record<string, string> = {
  signing: 'Sign session key in wallet...',
  downloading: 'Downloading encrypted intel...',
  decrypting: 'Decrypting payload...',
}

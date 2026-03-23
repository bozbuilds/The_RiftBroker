import type { IntelPayload } from '../lib/intel-schemas'

export interface SeedListing {
  readonly intelType: number
  readonly systemId: bigint
  readonly price: bigint
  readonly decayHours: bigint
  readonly stakeAmount: bigint
  readonly payload: IntelPayload
  /** badge_type values to attach after creation: 0=combat, 1=activity, 2=structure */
  readonly badges?: readonly (0 | 1 | 2)[]
}

export const SEED_LISTINGS: readonly SeedListing[] = [

  // ── 869-Y-51 region ──────────────────────────────────────────────────────

  // Resource — no badge. Cheap tip, unverified.
  {
    intelType: 0,
    systemId: 30006118n,
    price: 8_000_000n,
    decayHours: 168n,
    stakeAmount: 2_000_000n,
    payload: {
      type: 0,
      systemId: 'OJG-K03',
      nearbyBody: 'Planet 3 Moon 1',
      resourceType: 'Feldspar Crystals',
      yieldTier: 'mid',
      notes: '[SEED] Stable deposit, low traffic',
    },
  },

  // Resource — Activity Verified. Scout deposited extracted material into a
  // nearby SSU, confirming operational presence in the system.
  {
    intelType: 0,
    systemId: 30006094n,
    price: 14_000_000n,
    decayHours: 336n,
    stakeAmount: 3_500_000n,
    badges: [1],
    payload: {
      type: 0,
      systemId: 'IHK-745',
      nearbyBody: 'P2-M1',
      resourceType: 'Hydrated Sulfide Matrix',
      yieldTier: 'high',
      notes: '[SEED] Confirmed via on-chain deposit event',
    },
  },

  // Base — Structure Verified. Discovered via LocationRevealedEvent when the
  // scout triggered a Smart Gate in system.
  {
    intelType: 2,
    systemId: 30006021n,
    price: 17_000_000n,
    decayHours: 504n,
    stakeAmount: 4_000_000n,
    badges: [2],
    payload: {
      type: 2,
      systemId: 'OB1-7J3',
      structureType: 'Smart Storage Unit',
      defenseLevel: 7,
      ownerTribe: 'Iron Guard',
      notes: '[SEED] Location binding from on-chain gate traversal',
    },
  },

  // ── K4T-Y region ──────────────────────────────────────────────────────────

  // Fleet — Combat Verified. Scout confirmed this camp after engaging — the
  // killmail binds the intel to the on-chain kill event.
  {
    intelType: 1,
    systemId: 30021737n,
    price: 18_000_000n,
    decayHours: 168n,
    stakeAmount: 4_500_000n,
    badges: [0],
    payload: {
      type: 1,
      systemId: 'EQ6-V9N',
      fleetSize: 18,
      shipTypes: ['Frigate', 'Cruiser', 'Interceptor'],
      heading: 'Stationary — gate camp on O5K-KCN',
      observedAt: '2026-03-21T04:10:00Z',
      notes: '[SEED] Scout was engaged. Combat Verified via killmail.',
    },
  },

  // Base — Combat + Activity + Structure. Full attestation stack — premium listing.
  // Scout triggered a gate (Structure), deposited resources (Activity),
  // and survived a skirmish (Combat) all in the same operation.
  {
    intelType: 2,
    systemId: 30021734n,
    price: 35_000_000n,
    decayHours: 720n,
    stakeAmount: 8_000_000n,
    badges: [0, 1, 2],
    payload: {
      type: 2,
      systemId: 'O5K-KCN',
      structureType: 'Smart Turret',
      defenseLevel: 9,
      ownerTribe: 'Dusk Covenant',
      notes: '[SEED] Triple-verified. Scout engaged hostiles, deposited via SSU, gate traversal recorded. Highest confidence rating.',
    },
  },

  // ── PJ1-Y-33 region ───────────────────────────────────────────────────────

  // Resource — no badge.
  {
    intelType: 0,
    systemId: 30018133n,
    price: 7_000_000n,
    decayHours: 240n,
    stakeAmount: 1_800_000n,
    payload: {
      type: 0,
      systemId: 'I75-7RC',
      nearbyBody: 'Planet 1',
      resourceType: 'Ice Shards',
      yieldTier: 'low',
      notes: '[SEED] Contested — hostiles seen nearby',
    },
  },

  // Route — no badge. Raw tip, buyer beware.
  {
    intelType: 3,
    systemId: 30018130n,
    price: 9_000_000n,
    decayHours: 240n,
    stakeAmount: 2_200_000n,
    payload: {
      type: 3,
      originSystemId: 'O3C-8LF',
      destSystemId: 'ETT-73N',
      threatLevel: 4,
      gateCamps: [],
      notes: '[SEED] Clear run observed during off-peak hours',
    },
  },

  // ── 877-Y-L1 region ───────────────────────────────────────────────────────

  // Fleet — Activity + Structure Verified. Scout activity at nearby SSU and
  // gate traversal both visible on-chain.
  {
    intelType: 1,
    systemId: 30017833n,
    price: 22_000_000n,
    decayHours: 336n,
    stakeAmount: 5_500_000n,
    badges: [1, 2],
    payload: {
      type: 1,
      systemId: 'ETT-73N',
      fleetSize: 11,
      shipTypes: ['Destroyer', 'Cruiser'],
      heading: 'S toward Southern Expanse',
      observedAt: '2026-03-21T11:45:00Z',
      notes: '[SEED] Confirmed via deposit + gate events. Moving south, likely raiding.',
    },
  },

  // ── 398-6Y-J region ───────────────────────────────────────────────────────

  // Fleet — Combat + Structure Verified. Scout triggered a gate and got jumped.
  {
    intelType: 1,
    systemId: 30001167n,
    price: 25_000_000n,
    decayHours: 168n,
    stakeAmount: 6_000_000n,
    badges: [0, 2],
    payload: {
      type: 1,
      systemId: 'OS7-VMC',
      fleetSize: 6,
      shipTypes: ['Cruiser', 'Battleship'],
      heading: 'Holding on gate — ambush formation',
      observedAt: '2026-03-21T15:00:00Z',
      notes: '[SEED] Scout was ambushed here. Combat Verified. Structure event confirms position.',
    },
  },

  // ── R62-Y-04 region ───────────────────────────────────────────────────────

  // Resource — Structure Verified. Gate traversal confirmed scout was in system.
  {
    intelType: 0,
    systemId: 30014670n,
    price: 13_000_000n,
    decayHours: 336n,
    stakeAmount: 3_200_000n,
    badges: [2],
    payload: {
      type: 0,
      systemId: 'IG1-NV6',
      nearbyBody: 'P1-M3',
      resourceType: 'Compressed Regolith',
      yieldTier: 'mid',
      notes: '[SEED] Gate traversal on record — scout was here.',
    },
  },

  // Route — no badge. Cross-region route with a known camp.
  {
    intelType: 3,
    systemId: 30014667n,
    price: 11_000_000n,
    decayHours: 336n,
    stakeAmount: 2_800_000n,
    payload: {
      type: 3,
      originSystemId: 'I55-6J7',
      destSystemId: 'E71-QGJ',
      threatLevel: 6,
      gateCamps: [
        { systemId: 'I55-6J7', description: '[SEED] Gate camp at I55-6J7 Smart Gate' },
      ],
      notes: '[SEED]',
    },
  },

  // ── L74-Y-21 region ───────────────────────────────────────────────────────

  // Fleet — Combat Verified. Scout confirmed kill, badge is the receipt.
  {
    intelType: 1,
    systemId: 30009437n,
    price: 16_000_000n,
    decayHours: 168n,
    stakeAmount: 4_000_000n,
    badges: [0],
    payload: {
      type: 1,
      systemId: 'E71-QGJ',
      fleetSize: 4,
      shipTypes: ['Battleship', 'Cruiser'],
      heading: 'NE — suspected hunting patrol',
      observedAt: '2026-03-21T22:30:00Z',
      notes: '[SEED] Combat Verified — killmail on-chain. Small but dangerous.',
    },
  },
]

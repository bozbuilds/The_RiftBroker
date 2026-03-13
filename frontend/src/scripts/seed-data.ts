import type { IntelPayload } from '../lib/intel-schemas'

export interface SeedListing {
  readonly intelType: number
  readonly systemId: bigint
  readonly price: bigint
  readonly decayHours: bigint
  readonly stakeAmount: bigint
  readonly payload: IntelPayload
}

export const SEED_LISTINGS: readonly SeedListing[] = [
  // ── Dense cluster — 869-Y-51 region ──────────────────────────────────────

  // Resource: OJG-K03
  {
    intelType: 0,
    systemId: 30006118n,
    price: 100_000_000n,
    decayHours: 168n,
    stakeAmount: 30_000_000n,
    payload: {
      type: 0,
      systemId: '30006118',
      nearbyBody: 'Planet 3 Moon 1',
      resourceType: 'Feldspar Crystals',
      yieldTier: 'mid',
      notes: 'Stable deposit, low traffic area',
    },
  },
  // Resource: IHK-745
  {
    intelType: 0,
    systemId: 30006094n,
    price: 150_000_000n,
    decayHours: 336n,
    stakeAmount: 40_000_000n,
    payload: {
      type: 0,
      systemId: '30006094',
      nearbyBody: 'P2-M1',
      resourceType: 'Hydrated Sulfide Matrix',
      yieldTier: 'high',
    },
  },
  // Fleet: ABT-MT2
  {
    intelType: 1,
    systemId: 30006070n,
    price: 120_000_000n,
    decayHours: 168n,
    stakeAmount: 35_000_000n,
    payload: {
      type: 1,
      systemId: '30006070',
      fleetSize: 12,
      shipTypes: ['Frigate', 'Destroyer'],
      heading: 'NW toward Core',
      observedAt: '2026-03-12T10:30:00Z',
    },
  },
  // Fleet: ILG-F13
  {
    intelType: 1,
    systemId: 30006045n,
    price: 200_000_000n,
    decayHours: 504n,
    stakeAmount: 50_000_000n,
    payload: {
      type: 1,
      systemId: '30006045',
      fleetSize: 25,
      shipTypes: ['Frigate', 'Cruiser', 'Battleship', 'Destroyer'],
      heading: 'Stationary — gate camp',
      observedAt: '2026-03-12T08:00:00Z',
    },
  },
  // Base: OB1-7J3
  {
    intelType: 2,
    systemId: 30006021n,
    price: 150_000_000n,
    decayHours: 720n,
    stakeAmount: 40_000_000n,
    payload: {
      type: 2,
      systemId: '30006021',
      structureType: 'Smart Storage Unit',
      defenseLevel: 7,
      ownerTribe: 'Iron Guard',
    },
  },
  // Base: I53-P81
  {
    intelType: 2,
    systemId: 30005997n,
    price: 180_000_000n,
    decayHours: 504n,
    stakeAmount: 45_000_000n,
    payload: {
      type: 2,
      systemId: '30005997',
      structureType: 'Smart Turret',
      defenseLevel: 9,
    },
  },

  // ── Scattered singles — 6 distinct regions ────────────────────────────────

  // Resource: EQ6-V9N (K4T-Y)
  {
    intelType: 0,
    systemId: 30021737n,
    price: 200_000_000n,
    decayHours: 720n,
    stakeAmount: 50_000_000n,
    payload: {
      type: 0,
      systemId: '30021737',
      nearbyBody: 'P4-M2',
      resourceType: 'Deep-Core Carbon',
      yieldTier: 'high',
    },
  },
  // Resource: I75-7RC (PJ1-Y-33)
  {
    intelType: 0,
    systemId: 30018133n,
    price: 80_000_000n,
    decayHours: 240n,
    stakeAmount: 20_000_000n,
    payload: {
      type: 0,
      systemId: '30018133',
      nearbyBody: 'Planet 1',
      resourceType: 'Ice Shards',
      yieldTier: 'low',
      notes: 'Contested — hostiles seen in system',
    },
  },
  // Fleet: ETT-73N (877-Y-L1)
  {
    intelType: 1,
    systemId: 30017833n,
    price: 90_000_000n,
    decayHours: 168n,
    stakeAmount: 25_000_000n,
    payload: {
      type: 1,
      systemId: '30017833',
      fleetSize: 8,
      shipTypes: ['Frigate', 'Interceptor'],
      heading: 'S toward Southern Expanse',
      observedAt: '2026-03-12T14:15:00Z',
    },
  },
  // Base: E71-QGJ (L74-Y-21)
  {
    intelType: 2,
    systemId: 30009437n,
    price: 130_000_000n,
    decayHours: 720n,
    stakeAmount: 35_000_000n,
    payload: {
      type: 2,
      systemId: '30009437',
      structureType: 'Smart Storage Unit',
      defenseLevel: 6,
      ownerTribe: 'Void Runners',
    },
  },
  // Fleet: OS7-VMC (398-6Y-J)
  {
    intelType: 1,
    systemId: 30001167n,
    price: 180_000_000n,
    decayHours: 336n,
    stakeAmount: 45_000_000n,
    payload: {
      type: 1,
      systemId: '30001167',
      fleetSize: 5,
      shipTypes: ['Cruiser', 'Battleship'],
      observedAt: '2026-03-11T18:00:00Z',
    },
  },
  // Resource: IG1-NV6 (R62-Y-04)
  {
    intelType: 0,
    systemId: 30014670n,
    price: 70_000_000n,
    decayHours: 336n,
    stakeAmount: 20_000_000n,
    payload: {
      type: 0,
      systemId: '30014670',
      nearbyBody: 'P1-M3',
      resourceType: 'Compressed Regolith',
      yieldTier: 'mid',
    },
  },

  // ── Route intel — cross-region ────────────────────────────────────────────

  // Route: K4T-Y → PJ1-Y-33
  {
    intelType: 3,
    systemId: 30021734n,
    price: 160_000_000n,
    decayHours: 504n,
    stakeAmount: 40_000_000n,
    payload: {
      type: 3,
      originSystemId: '30021734',
      destSystemId: '30018130',
      threatLevel: 8,
      gateCamps: [
        { systemId: '30021735', description: 'Bubble camp on O5K-KCN gate' },
      ],
    },
  },
  // Route: 877-Y-L1 → 398-6Y-J
  {
    intelType: 3,
    systemId: 30017830n,
    price: 50_000_000n,
    decayHours: 240n,
    stakeAmount: 20_000_000n,
    payload: {
      type: 3,
      originSystemId: '30017830',
      destSystemId: '30001164',
      threatLevel: 3,
      gateCamps: [],
    },
  },
  // Route: R62-Y-04 → L74-Y-21
  {
    intelType: 3,
    systemId: 30014667n,
    price: 110_000_000n,
    decayHours: 336n,
    stakeAmount: 30_000_000n,
    payload: {
      type: 3,
      originSystemId: '30014667',
      destSystemId: '30009434',
      threatLevel: 6,
      gateCamps: [
        { systemId: '30014668', description: 'Gate camp at I55-6J7 Smart Gate' },
      ],
    },
  },
]

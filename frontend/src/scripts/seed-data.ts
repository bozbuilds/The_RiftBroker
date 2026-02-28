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
  // === Resource intel (type 0) — North Frontier ===
  {
    intelType: 0,
    systemId: 30001000n,
    price: 100_000_000n,
    decayHours: 168n,
    stakeAmount: 30_000_000n,
    payload: {
      type: 0,
      systemId: '30001000',
      nearbyBody: 'Planet 3 Moon 1',
      resourceType: 'Feldspar Crystals',
      yieldTier: 'mid',
      notes: 'Stable deposit, low traffic area',
    },
  },
  {
    intelType: 0,
    systemId: 30001001n,
    price: 150_000_000n,
    decayHours: 336n,
    stakeAmount: 40_000_000n,
    payload: {
      type: 0,
      systemId: '30001001',
      nearbyBody: 'P2-M1',
      resourceType: 'Hydrated Sulfide Matrix',
      yieldTier: 'high',
    },
  },
  {
    intelType: 0,
    systemId: 30001002n,
    price: 80_000_000n,
    decayHours: 240n,
    stakeAmount: 20_000_000n,
    payload: {
      type: 0,
      systemId: '30001002',
      nearbyBody: 'Planet 1',
      resourceType: 'Ice Shards',
      yieldTier: 'low',
      notes: 'Contested — hostiles seen in system',
    },
  },
  {
    intelType: 0,
    systemId: 30001003n,
    price: 200_000_000n,
    decayHours: 720n,
    stakeAmount: 50_000_000n,
    payload: {
      type: 0,
      systemId: '30001003',
      nearbyBody: 'P4-M2',
      resourceType: 'Deep-Core Carbon',
      yieldTier: 'high',
    },
  },

  // === Fleet intel (type 1) — Eastern Rim + Core ===
  {
    intelType: 1,
    systemId: 30002000n,
    price: 120_000_000n,
    decayHours: 168n,
    stakeAmount: 35_000_000n,
    payload: {
      type: 1,
      systemId: '30002000',
      fleetSize: 12,
      shipTypes: ['Frigate', 'Destroyer'],
      heading: 'NW toward Core',
      observedAt: '2026-02-27T10:30:00Z',
    },
  },
  {
    intelType: 1,
    systemId: 30002001n,
    price: 180_000_000n,
    decayHours: 336n,
    stakeAmount: 45_000_000n,
    payload: {
      type: 1,
      systemId: '30002001',
      fleetSize: 5,
      shipTypes: ['Cruiser', 'Battleship'],
      observedAt: '2026-02-26T18:00:00Z',
    },
  },
  {
    intelType: 1,
    systemId: 30002002n,
    price: 90_000_000n,
    decayHours: 168n,
    stakeAmount: 25_000_000n,
    payload: {
      type: 1,
      systemId: '30002002',
      fleetSize: 8,
      shipTypes: ['Frigate', 'Interceptor'],
      heading: 'S toward Southern Expanse',
      observedAt: '2026-02-27T14:15:00Z',
    },
  },
  {
    intelType: 1,
    systemId: 30004759n,
    price: 200_000_000n,
    decayHours: 504n,
    stakeAmount: 50_000_000n,
    payload: {
      type: 1,
      systemId: '30004759',
      fleetSize: 25,
      shipTypes: ['Frigate', 'Cruiser', 'Battleship', 'Destroyer'],
      heading: 'Stationary — gate camp',
      observedAt: '2026-02-27T08:00:00Z',
    },
  },

  // === Base intel (type 2) — Southern Expanse ===
  {
    intelType: 2,
    systemId: 30003000n,
    price: 150_000_000n,
    decayHours: 720n,
    stakeAmount: 40_000_000n,
    payload: {
      type: 2,
      systemId: '30003000',
      structureType: 'Smart Storage Unit',
      defenseLevel: 7,
      ownerTribe: 'Iron Guard',
    },
  },
  {
    intelType: 2,
    systemId: 30003001n,
    price: 180_000_000n,
    decayHours: 504n,
    stakeAmount: 45_000_000n,
    payload: {
      type: 2,
      systemId: '30003001',
      structureType: 'Smart Turret',
      defenseLevel: 9,
    },
  },
  {
    intelType: 2,
    systemId: 30003002n,
    price: 70_000_000n,
    decayHours: 336n,
    stakeAmount: 20_000_000n,
    payload: {
      type: 2,
      systemId: '30003002',
      structureType: 'Smart Gate',
      defenseLevel: 4,
    },
  },
  {
    intelType: 2,
    systemId: 30003003n,
    price: 130_000_000n,
    decayHours: 720n,
    stakeAmount: 35_000_000n,
    payload: {
      type: 2,
      systemId: '30003003',
      structureType: 'Smart Storage Unit',
      defenseLevel: 6,
      ownerTribe: 'Void Runners',
    },
  },

  // === Route intel (type 3) — Cross-region ===
  {
    intelType: 3,
    systemId: 30005000n,
    price: 160_000_000n,
    decayHours: 504n,
    stakeAmount: 40_000_000n,
    payload: {
      type: 3,
      originSystemId: '30005000',
      destSystemId: '30002000',
      threatLevel: 8,
      gateCamps: [
        { systemId: '30004760', description: 'Bubble camp on E-VKJV gate' },
        { systemId: '30004761', description: 'Smartbomb camp at YHN-3K jump' },
      ],
    },
  },
  {
    intelType: 3,
    systemId: 30005001n,
    price: 50_000_000n,
    decayHours: 240n,
    stakeAmount: 20_000_000n,
    payload: {
      type: 3,
      originSystemId: '30005001',
      destSystemId: '30004759',
      threatLevel: 3,
      gateCamps: [],
    },
  },
  {
    intelType: 3,
    systemId: 30005002n,
    price: 110_000_000n,
    decayHours: 336n,
    stakeAmount: 30_000_000n,
    payload: {
      type: 3,
      originSystemId: '30005002',
      destSystemId: '30003000',
      threatLevel: 6,
      gateCamps: [
        { systemId: '30003002', description: 'Gate camp at A-ELE2 Smart Gate' },
      ],
    },
  },
]

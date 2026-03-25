# The RiftBroker — Encrypted Intel Marketplace

An encrypted intelligence marketplace for [EVE Frontier](https://www.evefrontier.com/), built on **SUI/Move** with **Seal** encryption, **Walrus** decentralized storage, and **Groth16 ZK proofs** for location verification. Built for the **EVE Frontier × SUI Hackathon** (March 11–31, 2026).

## How It Works

Scouts encrypt intelligence payloads, store them on Walrus, and list them on-chain. Optionally, scouts verify their presence using on-chain SUI events — a JumpEvent proves they entered a system, and LocationRevealedEvents provide per-assembly coordinates for ZK proximity proofs. Buyers browse unencrypted metadata, pay to unlock Seal decryption, and view intel client-side. A live 3D nebula heat map shows intel density across star systems.

```
Scout encrypts intel → uploads to Walrus → lists on-chain (optional ZK proof)
Buyer browses metadata → purchases listing → decrypts client-side
3D nebula heat map shows real-time intel activity across star systems
```

## Key Features

- **Seal encryption** — SUI-native conditional decryption. Only buyers with a valid PurchaseReceipt can decrypt.
- **Walrus storage** — Encrypted blobs stored on decentralized storage, retrieved by blob ID.
- **On-chain presence proofs** — Scouts prove system presence via SUI blockchain events (JumpEvent + LocationRevealedEvent), verified through a unified Groth16 circuit. Earns a "Presence Verified" badge with purple glow.
- **Stackable event badges** — Multiple verification badges per listing, each backed by a different on-chain event. Combat Verified (red, KillmailCreatedEvent), Activity Verified (green, ItemDepositedEvent), Structure Verified (blue, LocationRevealedEvent). Trust hierarchy: Combat > Presence > Activity > Structure > Proximity > ZK-Verified.
- **Scout reputation** — On-chain profiles (ScoutRegistry + ScoutProfileData) auto-updated on every verified listing and badge attachment. Per-badge-type counters + Poseidon Merkle tree (depth 10, frontier-based). Buyers view scout profiles by clicking addresses: verification rates, badge breakdowns, tier badges (bronze/silver/gold). Trusted Scouts filter shows only scouts with 5+ verified actions. Phase 4b ZK reputation claims circuit compiled and ready.
- **ZK proximity** — Distance from scout's entry gate to a target assembly, computed in-circuit and displayed as km / light-seconds / light-years. Uses per-assembly coordinates from on-chain events.
- **ZK location proofs** (legacy) — Groth16 proof of coordinate knowledge using galaxy.json system centroids. Shown as a "ZK-Verified" fallback badge when no event badges are present. Retained for backward compatibility.
- **Timestamp freshness** — Verified intel decays from observation time (JumpEvent block timestamp), not listing time. 24h staleness cap enforced on-chain.
- **4 intel types** — Resource deposits, fleet movements, base structures, trade routes.
- **3D nebula heat map** — Three.js canvas nebula visualization with region-based navigation, camera focus, and real-time intel density.
- **PTB composability** — Batch purchase multiple listings in a single atomic transaction.
- **My Intel** — Purchase history with decrypt, re-view, and receipt management.

## Deployed

- **Contract**: `0xdb94b50f1dc1652d8a7a4299b6367c33a66ab2005fffd0f3815c325ab84d6f11` (SUI testnet)
- **LocationVKey**: `0x29f32b3394a9550176299f28d5d406cab8129f86524a61a15e0a66c0a60e42e4`
- **DistanceVKey**: `0x5087b225470a37ca587a6f73d7d17908500cb43df1e0ac8816eee962f4cdd477`
- **PresenceVKey**: `0x671d42311c5fa43c690e112e1c41bdd86cd294fb35c8c0198c8a3ed535abed9a`
- **ReputationVKey**: `0xcb9a8de361a9d9b795ad4eef975339918c768b5d9dfdcf6efd9f5d3a9693bb41`
- **ScoutRegistry**: `0xfcfdc4d5b07a9173b13f912541b3c50ffb2491058be6345709fae03b0148d778`

## Tech Stack

- **Smart contracts**: [Move](https://move-book.com/) on SUI (edition 2024)
- **Frontend**: TypeScript / React / Vite with [`@mysten/dapp-kit`](https://sdk.mystenlabs.com/dapp-kit)
- **Encryption**: [`@mysten/seal`](https://seal.mystenlabs.com/) — IBE with threshold key servers
- **Storage**: [`Walrus`](https://www.walrus.xyz/) — decentralized blob storage (HTTP API)
- **ZK proofs**: [snarkjs](https://github.com/iden3/snarkjs) (Groth16) with on-chain Arkworks verification via `sui::groth16`
- **3D visualization**: Three.js + React Three Fiber
- **Validation**: [Zod](https://zod.dev/) discriminated unions for intel payload schemas

## Getting Started

### Prerequisites

- Node.js 20+ / pnpm
- [SUI CLI](https://docs.sui.io/build/install)

### Setup

```bash
# Move contracts
sui move build --path contracts
sui move test --path contracts    # 63 tests

# Frontend
cd frontend
pnpm install
pnpm dev                          # http://localhost:5173
pnpm test                         # 258 tests
pnpm build                        # Production build
```

### Seeding Demo Data

```bash
cd frontend
SUI_PRIVATE_KEY=<suiprivkey1...> pnpm seed
```

Creates 12 demo listings across 6 regions with encrypted payloads on Walrus.

## Project Structure

```
TheRiftBroker/
├── contracts/
│   ├── Move.toml
│   ├── sources/marketplace.move        # Core contract + Seal policies + ZK verification + event badges (~600 lines)
│   └── tests/marketplace_tests.move    # 63 tests
├── circuits/
│   ├── README.md                       # Circuit compilation workflow (PowerShell)
│   ├── location-attestation/           # Location Groth16 circuit + compiled artifacts
│   ├── distance-attestation/           # Proximity Groth16 circuit + compiled artifacts
│   ├── presence-attestation/           # Unified presence + proximity Groth16 circuit
│   └── reputation-attestation/         # Reputation Groth16 circuit + compiled artifacts
├── frontend/
│   ├── public/
│   │   ├── galaxy.json                 # Real EVE Frontier star data
│   │   └── zk/
│   │       ├── location-attestation.wasm          # Browser proof WASM (location)
│   │       ├── location-attestation_final.zkey    # Browser proving key (location)
│   │       ├── presence-attestation.wasm          # Browser proof WASM (presence)
│   │       ├── presence-attestation_final.zkey    # Browser proving key (presence)
│   │       ├── reputation-attestation.wasm        # Browser proof WASM (reputation)
│   │       └── reputation-attestation_final.zkey  # Browser proving key (reputation)
│   ├── src/
│   │   ├── App.tsx                     # 3D map + panel navigation + purchase flow
│   │   ├── providers/                  # SUI, wallet, query, galaxy data providers
│   │   ├── lib/
│   │   │   ├── constants.ts            # Package ID, VKey IDs, WORLD_PACKAGE_UTOPIA/STILLNESS
│   │   │   ├── types.ts               # On-chain type mirrors (bigint, isVerified)
│   │   │   ├── transactions.ts         # Pure PTB builders incl. verified listings
│   │   │   ├── zk-proof.ts            # snarkjs → Arkworks + generatePresenceProof
│   │   │   ├── seal.ts                # Encrypt/decrypt wrappers
│   │   │   ├── walrus.ts              # Upload/download (HTTP API)
│   │   │   ├── intel-schemas.ts       # Zod schemas (4 intel types)
│   │   │   ├── heat-map-data.ts       # Aggregation + filtering + verifiedOnly
│   │   │   ├── galaxy-data.ts         # Real EVE Frontier galaxy coordinates
│   │   │   ├── region-data.ts         # Region aggregation for navigation
│   │   │   ├── format.ts              # Shared timeRemaining, truncateAddress
│   │   │   ├── parse.ts              # On-chain field parsing
│   │   │   ├── empty-maps.ts         # Empty state constants
│   │   │   ├── events.ts             # SUI event queries (JumpEvent, LocationRevealedEvent, KillmailEvent, InventoryEvent)
│   │   │   ├── badge-verify.ts      # Badge rendering logic (getBadges, trust hierarchy)
│   │   │   ├── scout-profile.ts      # Scout profile fetch + parse
│   │   │   └── reputation-merkle.ts  # Poseidon Merkle tree for reputation
│   │   ├── scripts/
│   │   │   ├── seed-data.ts           # Demo listing definitions (7 tests)
│   │   │   └── seed.ts               # CLI seed script
│   │   ├── hooks/
│   │   │   ├── useListings.ts         # Event query → object fetch → parse
│   │   │   ├── usePurchase.ts         # Sign + execute purchase tx
│   │   │   ├── useDecrypt.ts          # Download → seal_approve → decrypt → validate
│   │   │   ├── useHeatMapData.ts      # Aggregate listings for heat map
│   │   │   ├── useReceipts.ts         # Purchase receipt tracking
│   │   │   └── useScoutProfile.ts     # Fetch + cache scout profile data
│   │   └── components/
│   │       ├── CreateListing.tsx       # Two-step form + optional ZK verification
│   │       ├── ListingBrowser.tsx      # Filterable list + verified-only toggle
│   │       ├── MyIntel.tsx            # Purchase history + decrypt + receipt mgmt
│   │       ├── MyListings.tsx         # Scout listing management (delist, reclaim)
│   │       ├── PurchaseFlow.tsx       # Purchase confirmation
│   │       ├── IntelViewer.tsx        # Type-switched intel renderer
│   │       ├── InfoModal.tsx          # Landing modal with first-visit auto-show
│   │       ├── FloatingPanel.tsx      # Floating UI panel wrapper
│   │       ├── RegionPanel.tsx        # Region details sidebar
│   │       ├── SystemPicker.tsx       # System selector component
│   │       ├── ErrorBoundary.tsx      # Error boundary with reset
│   │       ├── ScoutProfilePanel.tsx  # Scout profile viewer (reputation, badges, tier)
│   │       └── heat-map/             # 3D nebula + SVG fallback + controls
│   └── vite.config.ts
└── docs/
    └── ARCHITECTURE.md               # Technical architecture
```

## Tests

| Suite | Count |
|-------|-------|
| Move contract | 63 |
| Frontend (Vitest) | 258 |
| **Total** | **321** |

## Future Features

- **Player proximity** — Prove distance to another player's ship. The ZK circuit supports any coordinate source; only the data availability is missing. Requires CCP Games to emit player position events on-chain.
- **Resource proximity** — Prove distance to rifts, asteroids, or other resources. Requires CCP to publish resource locations on-chain or via PODs.
- **Dispute system** — Stake-backed challenges with community voting
- **zkLogin** — Google/Twitch sign-in without requiring a crypto wallet
- **Sponsored transactions** — Gasless UX for new players

## License

Source Available — No Redistribution. See [LICENSE](LICENSE) for details.

Copyright (c) 2026 BozBuilds. All rights reserved.

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
- **ZK proximity** — Distance from scout's entry gate to a target assembly, computed in-circuit and displayed as km / light-seconds / light-years. Uses per-assembly coordinates from on-chain events.
- **ZK location proofs** (legacy) — Groth16 proof of coordinate knowledge using galaxy.json system centroids. Earns a "ZK-Verified" badge. Retained for backward compatibility.
- **Timestamp freshness** — Verified intel decays from observation time (JumpEvent block timestamp), not listing time. 24h staleness cap enforced on-chain.
- **4 intel types** — Resource deposits, fleet movements, base structures, trade routes.
- **3D nebula heat map** — Three.js canvas nebula visualization with region-based navigation, camera focus, and real-time intel density.
- **PTB composability** — Batch purchase multiple listings in a single atomic transaction.
- **My Intel** — Purchase history with decrypt, re-view, and receipt management.

## Deployed

- **Contract**: [`0x361aeb5a22f71441800364cd976941e7de302dc0eaad55fbf4de18cf378fbf01`](https://suiscan.xyz/testnet/object/0x361aeb5a22f71441800364cd976941e7de302dc0eaad55fbf4de18cf378fbf01) (SUI testnet)
- **LocationVKey**: [`0xd4bddf80818eb19fb57c7fbea6e69998e96adbfa6210ceaa60e0b33a86720913`](https://suiscan.xyz/testnet/object/0xd4bddf80818eb19fb57c7fbea6e69998e96adbfa6210ceaa60e0b33a86720913)
- **DistanceVKey**: [`0xfaf9a8fc17e18253b06d943b00cb7c0f3970dca61007b27690e8c9738d1ebc24`](https://suiscan.xyz/testnet/object/0xfaf9a8fc17e18253b06d943b00cb7c0f3970dca61007b27690e8c9738d1ebc24)
- **PresenceVKey**: [`0x39bebf31fd6923be13d3662c687f3c07823da059fba0e6f249a70f4121f68c02`](https://suiscan.xyz/testnet/object/0x39bebf31fd6923be13d3662c687f3c07823da059fba0e6f249a70f4121f68c02)

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
sui move test --path contracts    # 42 tests

# Frontend
cd frontend
pnpm install
pnpm dev                          # http://localhost:5173
pnpm test                         # 210 tests
pnpm build                        # Production build
```

### Seeding Demo Data

```bash
cd frontend
SUI_PRIVATE_KEY=<suiprivkey1...> pnpm seed
```

Creates 15 demo listings across 12 systems with encrypted payloads on Walrus.

## Project Structure

```
TheRiftBroker/
├── contracts/
│   ├── Move.toml
│   ├── sources/marketplace.move        # Core contract + Seal policies + ZK verification (~530 lines)
│   └── tests/marketplace_tests.move    # 42 tests
├── circuits/
│   ├── README.md                       # Circuit compilation workflow (PowerShell)
│   ├── location-attestation/           # Location Groth16 circuit + compiled artifacts
│   ├── distance-attestation/           # Proximity Groth16 circuit + compiled artifacts
│   └── presence-attestation/           # Unified presence + proximity Groth16 circuit
├── frontend/
│   ├── public/
│   │   ├── galaxy.json                 # Real EVE Frontier star data
│   │   └── zk/
│   │       ├── location-attestation.wasm          # Browser proof WASM (location)
│   │       ├── location-attestation_final.zkey    # Browser proving key (location)
│   │       ├── presence-attestation.wasm        # Browser proof WASM (presence)
│   │       └── presence-attestation_final.zkey  # Browser proving key (presence)
│   ├── src/
│   │   ├── App.tsx                     # 3D map + panel navigation + purchase flow
│   │   ├── providers/                  # SUI, wallet, query, galaxy data providers
│   │   ├── lib/
│   │   │   ├── constants.ts            # Package ID, VKey IDs, WORLD_PACKAGE_ID
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
│   │   │   └── events.ts             # SUI event queries (JumpEvent, LocationRevealedEvent)
│   │   ├── scripts/
│   │   │   ├── seed-data.ts           # 15 demo listings (7 tests)
│   │   │   └── seed.ts               # CLI seed script
│   │   ├── hooks/                     # useListings, usePurchase, useDecrypt, useHeatMapData, useReceipts
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
│   │       └── heat-map/             # 3D nebula + SVG fallback + controls
│   └── vite.config.ts
└── docs/
    └── ARCHITECTURE.md               # Technical architecture
```

## Tests

| Suite | Count |
|-------|-------|
| Move contract | 42 |
| Frontend (Vitest) | 210 |
| **Total** | **252** |

## Upcoming Features

- **Player proximity** — Prove distance to another player's ship. The ZK circuit supports any coordinate source; only the data availability is missing. Requires CCP Games to emit player position events on-chain.
- **Resource proximity** — Prove distance to rifts, asteroids, or other resources. Requires CCP to publish resource locations on-chain or via PODs.
- **Scout reputation** — On-chain profiles tracking verified observations. Consistent accuracy builds trust; bad intel burns your record.
- **Dispute system** — Stake-backed challenges with community voting
- **zkLogin** — Google/Twitch sign-in without requiring a crypto wallet
- **Sponsored transactions** — Gasless UX for new players

## License

Source Available — No Redistribution. See [LICENSE](LICENSE) for details.

Copyright (c) 2026 BozBuilds. All rights reserved.

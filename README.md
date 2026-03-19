# The RiftBroker — Encrypted Intel Marketplace

An encrypted intelligence marketplace for [EVE Frontier](https://www.evefrontier.com/), built on **SUI/Move** with **Seal** encryption, **Walrus** decentralized storage, and **Groth16 ZK proofs** for location verification. Built for the **EVE Frontier × SUI Hackathon** (March 11–31, 2026).

## How It Works

Scouts encrypt intelligence payloads, store them on Walrus, and list them on-chain. Optionally, scouts attach zero-knowledge proofs (Groth16) — a location proof verifying physical presence at a star system, and a proximity proof showing how close they were to a target. Buyers browse unencrypted metadata, pay to unlock Seal decryption, and view intel client-side. A live 3D nebula heat map shows intel density across star systems.

```
Scout encrypts intel → uploads to Walrus → lists on-chain (optional ZK proof)
Buyer browses metadata → purchases listing → decrypts client-side
3D nebula heat map shows real-time intel activity across star systems
```

## Key Features

- **Seal encryption** — SUI-native conditional decryption. Only buyers with a valid PurchaseReceipt can decrypt.
- **Walrus storage** — Encrypted blobs stored on decentralized storage, retrieved by blob ID.
- **ZK location proofs** — Groth16 on-chain verification proves scout was physically present at a star system without revealing exact coordinates. Earns a "ZK-Verified" badge.
- **ZK proximity proofs** — Scouts can also attach a distance proof showing how close their system was to a target. Displayed as a "Proximity Verified" badge with distance in km / light-seconds / light-years. *Note: currently limited to solar system granularity using public star map coordinates — full per-object precision requires CCP Games POD data, which is not yet available.*
- **4 intel types** — Resource deposits, fleet movements, base structures, trade routes.
- **3D nebula heat map** — Three.js canvas nebula visualization with region-based navigation, camera focus, and real-time intel density.
- **PTB composability** — Batch purchase multiple listings in a single atomic transaction.
- **My Intel** — Purchase history with decrypt, re-view, and receipt management.

## Deployed

- **Contract**: [`0x8ff3a1a4e6f983749026ca40c73e3d6ea6ee75c70f947d80914f56d50278b7d2`](https://suiscan.xyz/testnet/object/0x8ff3a1a4e6f983749026ca40c73e3d6ea6ee75c70f947d80914f56d50278b7d2) (SUI testnet)
- **LocationVKey**: [`0xfee9b6601212ce44715874a99ff3f5ccec304a03b7e3cc2e7a41b81a83b19bb1`](https://suiscan.xyz/testnet/object/0xfee9b6601212ce44715874a99ff3f5ccec304a03b7e3cc2e7a41b81a83b19bb1) (location ZK verification key)
- **DistanceVKey**: [`0xf728694a51f4e88980d601c45be6e84cdd75e28ff996a3de10560131ca344026`](https://suiscan.xyz/testnet/object/0xf728694a51f4e88980d601c45be6e84cdd75e28ff996a3de10560131ca344026) (proximity ZK verification key)

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
sui move test --path contracts    # 35 tests

# Frontend
cd frontend
pnpm install
pnpm dev                          # http://localhost:5173
pnpm test                         # 188 tests
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
│   ├── sources/marketplace.move        # Core contract + Seal policies + ZK verification (~395 lines)
│   └── tests/marketplace_tests.move    # 30 tests
├── circuits/
│   ├── README.md                       # Circuit compilation workflow (PowerShell)
│   ├── location-attestation/           # Location Groth16 circuit + compiled artifacts
│   └── distance-attestation/           # Proximity Groth16 circuit + compiled artifacts
├── frontend/
│   ├── public/
│   │   ├── galaxy.json                 # Real EVE Frontier star data
│   │   └── zk/                         # Browser proof WASM + proving key
│   ├── src/
│   │   ├── App.tsx                     # 3D map + panel navigation + purchase flow
│   │   ├── providers/                  # SUI, wallet, query, galaxy data providers
│   │   ├── lib/
│   │   │   ├── constants.ts            # Package ID, Seal key servers, VKey IDs
│   │   │   ├── types.ts               # On-chain type mirrors (bigint, isVerified)
│   │   │   ├── transactions.ts         # Pure PTB builders incl. verified listings
│   │   │   ├── zk-proof.ts            # snarkjs → Arkworks byte conversion
│   │   │   ├── seal.ts                # Encrypt/decrypt wrappers
│   │   │   ├── walrus.ts              # Upload/download (HTTP API)
│   │   │   ├── intel-schemas.ts       # Zod schemas (4 intel types)
│   │   │   ├── heat-map-data.ts       # Aggregation + filtering + verifiedOnly
│   │   │   ├── galaxy-data.ts         # Real EVE Frontier galaxy coordinates
│   │   │   ├── region-data.ts         # Region aggregation for navigation
│   │   │   ├── format.ts              # Shared timeRemaining, truncateAddress
│   │   │   ├── parse.ts              # On-chain field parsing
│   │   │   └── empty-maps.ts         # Empty state constants
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
| Move contract | 35 |
| Frontend (Vitest) | 188 |
| **Total** | **223** |

## Upcoming Features

- **Full-precision proximity** — Per-object distance proofs once CCP Games exposes in-game location as POD data. The circuit is live today at solar system granularity.
- **ZK Phase 3**: Timestamp freshness — prove intel was gathered recently
- **ZK Phase 4**: Scout reputation — on-chain reputation derived from verified intel history
- **Dispute system**: Stake-backed challenges with community voting
- **zkLogin**: Google/Twitch sign-in without requiring a crypto wallet
- **Sponsored transactions**: Gasless UX for new players

## License

Source Available — No Redistribution. See [LICENSE](LICENSE) for details.

Copyright (c) 2026 BozBuilds. All rights reserved.

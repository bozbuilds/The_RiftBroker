# The RiftBroker — Encrypted Intel Marketplace

An encrypted intelligence marketplace for [EVE Frontier](https://www.evefrontier.com/), built on **SUI/Move** with **Seal** encryption, **Walrus** decentralized storage, and **Groth16 ZK proofs** for location verification. Built for the **EVE Frontier × SUI Hackathon** (March 11–31, 2026).

## How It Works

Scouts encrypt intelligence payloads, store them on Walrus, and list them on-chain. Optionally, scouts attach a zero-knowledge location proof (Groth16) to verify they were physically present without revealing exact coordinates. Buyers browse unencrypted metadata, pay to unlock Seal decryption, and view intel client-side. A live 3D nebula heat map shows intel density across star systems.

```
Scout encrypts intel → uploads to Walrus → lists on-chain (optional ZK proof)
Buyer browses metadata → purchases listing → decrypts client-side
3D nebula heat map shows real-time intel activity across star systems
```

## Key Features

- **Seal encryption** — SUI-native conditional decryption. Only buyers with a valid PurchaseReceipt can decrypt.
- **Walrus storage** — Encrypted blobs stored on decentralized storage, retrieved by blob ID.
- **ZK-verified intel** — Groth16 on-chain verification proves scout location without revealing coordinates. Verified listings earn a "ZK-Verified" badge.
- **4 intel types** — Resource deposits, fleet movements, base structures, trade routes.
- **3D nebula heat map** — Three.js canvas nebula visualization with region-based navigation, camera focus, and real-time intel density.
- **PTB composability** — Batch purchase multiple listings in a single atomic transaction.
- **My Intel** — Purchase history with decrypt, re-view, and receipt management.

## Deployed

- **Contract**: [`0xa5e33645e5d1b3f886aa6624157b131c389c9c61aedb744e20a761b5003608b8`](https://suiscan.xyz/testnet/object/0xa5e33645e5d1b3f886aa6624157b131c389c9c61aedb744e20a761b5003608b8) (SUI testnet)

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
sui move test --path contracts    # 25 tests

# Frontend
cd frontend
pnpm install
pnpm dev                          # http://localhost:5173
pnpm test                         # 182 tests
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
│   ├── sources/marketplace.move        # Core contract + Seal policies + ZK verification (~350 lines)
│   └── tests/marketplace_tests.move    # 25 tests
├── circuits/
│   ├── README.md                       # One-time circuit compilation workflow
│   └── location-attestation/           # Groth16 circuit source (pending compilation)
├── frontend/
│   ├── src/
│   │   ├── App.tsx                     # 3D map + panel navigation + purchase flow
│   │   ├── lib/
│   │   │   ├── constants.ts            # Package ID, Seal key servers, LocationVKey ID
│   │   │   ├── types.ts               # On-chain type mirrors (bigint, isVerified)
│   │   │   ├── transactions.ts         # Pure PTB builders incl. verified listings
│   │   │   ├── zk-proof.ts            # snarkjs → Arkworks byte conversion (31 tests)
│   │   │   ├── seal.ts                # Encrypt/decrypt wrappers
│   │   │   ├── walrus.ts              # Upload/download (HTTP API)
│   │   │   ├── intel-schemas.ts       # Zod schemas (4 intel types)
│   │   │   ├── heat-map-data.ts       # Aggregation + filtering + verifiedOnly
│   │   │   ├── galaxy-data.ts         # Real EVE Frontier galaxy coordinates
│   │   │   ├── region-data.ts         # Region aggregation for navigation
│   │   │   ├── format.ts              # Shared timeRemaining, truncateAddress
│   │   │   └── systems.ts            # 20 demo star systems
│   │   ├── scripts/
│   │   │   ├── seed-data.ts           # 15 demo listings (7 tests)
│   │   │   └── seed.ts               # CLI seed script
│   │   ├── hooks/                     # useListings, usePurchase, useDecrypt, useHeatMapData
│   │   └── components/
│   │       ├── CreateListing.tsx       # Two-step form + optional ZK verification
│   │       ├── ListingBrowser.tsx      # Filterable list + verified-only toggle
│   │       ├── MyIntel.tsx            # Purchase history + decrypt + receipt mgmt
│   │       ├── PurchaseFlow.tsx       # Purchase confirmation
│   │       ├── IntelViewer.tsx        # Type-switched intel renderer
│   │       ├── ErrorBoundary.tsx      # Error boundary with reset
│   │       └── heat-map/             # 3D nebula + SVG fallback + controls
│   └── vite.config.ts
└── docs/
    ├── eve_frontier_hackathon26.md    # Strategic playbook
    ├── ARCHITECTURE.md               # Technical architecture
    ├── seal-spike.md                  # Seal research
    ├── walrus-spike.md               # Walrus research
    ├── brainstorms/                   # Design exploration (10 files)
    └── plans/                         # Implementation plans (8 files)
```

## Tests

| Suite | Count |
|-------|-------|
| Move contract | 25 |
| Frontend (Vitest) | 182 |
| **Total** | **207** |

## Upcoming Features

- **ZK Phase 2**: Proximity proofs — verify scout was within range of a specific structure
- **ZK Phase 3**: Timestamp freshness — prove intel was gathered recently
- **ZK Phase 4**: Scout reputation — on-chain reputation derived from verified intel history
- **Dispute system**: Stake-backed challenges with community voting
- **zkLogin**: Google/Twitch sign-in without requiring a crypto wallet
- **Sponsored transactions**: Gasless UX for new players

## License

MIT

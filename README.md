# The Dark Net — Encrypted Intel Marketplace

An encrypted intelligence marketplace for [EVE Frontier](https://www.evefrontier.com/), built on **SUI/Move** with **Seal** encryption and **Walrus** decentralized storage. Built for the **EVE Frontier × SUI Hackathon** (March 11–31, 2026).

## How It Works

Scouts encrypt intelligence payloads, store them on Walrus, and list them on-chain. Buyers browse unencrypted metadata, pay to unlock Seal decryption, and view intel client-side. A live heat map shows intel density across star systems.

```
Scout encrypts intel → uploads to Walrus → lists on-chain
Buyer browses metadata → purchases listing → decrypts client-side
Heat map shows real-time intel activity across 20 star systems
```

## Key Features

- **Seal encryption** — SUI-native conditional decryption. Only buyers with a valid PurchaseReceipt can decrypt.
- **Walrus storage** — Encrypted blobs stored on decentralized storage, retrieved by blob ID.
- **4 intel types** — Resource deposits, fleet movements, base structures, trade routes.
- **Live heat map** — SVG star map with glow/pulse animations showing intel density and freshness.
- **PTB composability** — Batch purchase multiple listings in a single atomic transaction.

## Deployed

- **Contract**: [`0xa5e33645e5d1b3f886aa6624157b131c389c9c61aedb744e20a761b5003608b8`](https://suiscan.xyz/testnet/object/0xa5e33645e5d1b3f886aa6624157b131c389c9c61aedb744e20a761b5003608b8) (SUI testnet)

## Tech Stack

- **Smart contracts**: [Move](https://move-book.com/) on SUI (edition 2024)
- **Frontend**: TypeScript / React / Vite with [`@mysten/dapp-kit`](https://sdk.mystenlabs.com/dapp-kit)
- **Encryption**: [`@mysten/seal`](https://seal.mystenlabs.com/) — IBE with threshold key servers
- **Storage**: [`Walrus`](https://www.walrus.xyz/) — decentralized blob storage (HTTP API)
- **Validation**: [Zod](https://zod.dev/) discriminated unions for intel payload schemas

## Getting Started

### Prerequisites

- Node.js 20+ / pnpm
- [SUI CLI](https://docs.sui.io/build/install)

### Setup

```bash
# Move contracts
sui move build --path contracts
sui move test --path contracts    # 20 tests

# Frontend
cd frontend
pnpm install
pnpm dev                          # http://localhost:5173
pnpm test                         # 40 tests
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
EF_intel/
├── contracts/
│   ├── Move.toml
│   ├── sources/marketplace.move        # Core contract + Seal policies (~239 lines)
│   └── tests/marketplace_tests.move    # 20 tests
├── frontend/
│   ├── src/
│   │   ├── App.tsx                     # Map/Browse/Create nav
│   │   ├── lib/
│   │   │   ├── constants.ts            # Package ID, Seal key servers
│   │   │   ├── transactions.ts         # Pure PTB builders (6 tests)
│   │   │   ├── seal.ts                 # Encrypt/decrypt wrappers (2 tests)
│   │   │   ├── walrus.ts              # Upload/download (5 tests)
│   │   │   ├── intel-schemas.ts       # Zod schemas (8 tests)
│   │   │   ├── heat-map-data.ts       # Aggregation + filtering (12 tests)
│   │   │   └── systems.ts            # 20 demo star systems
│   │   ├── scripts/
│   │   │   ├── seed-data.ts           # 15 demo listings (7 tests)
│   │   │   └── seed.ts               # CLI seed script
│   │   ├── hooks/                     # useListings, usePurchase, useDecrypt
│   │   └── components/               # CreateListing, ListingBrowser, HeatMap, etc.
│   └── vite.config.ts
└── docs/
    ├── eve_frontier_hackathon26.md    # Strategic playbook
    ├── seal-spike.md                  # Seal research
    └── walrus-spike.md               # Walrus research
```

## Tests

| Suite | Count |
|-------|-------|
| Move contract | 20 |
| Frontend (Vitest) | 40 |
| **Total** | **60** |

## License

MIT

# EF_intel

Tools and infrastructure for the [EVE Frontier](https://www.evefrontier.com/) ecosystem, built for the **EVE Frontier × SUI Hackathon** (March 11–31, 2026).

## What is this?

EVE Frontier is CCP Games' blockchain-integrated space MMO. After migrating from Ethereum L2 to **SUI/Move**, the entire builder ecosystem needs to be rebuilt. This project targets the critical gaps: market intelligence, collaborative intel, and DeFi-native economic primitives.

## Project Concepts

| Concept | Description | Status |
|---------|-------------|--------|
| **The Dark Net** | Encrypted intel marketplace (Seal + Walrus) | **Phase 2 complete** — contract (17 tests) + frontend (21 tests) |
| **The Frontier Exchange** | AMM resource markets with cross-system arbitrage | Backlog |
| **The Underwriter** | Ship insurance with automated bounty loops | Backlog |

See [`docs/eve_frontier_hackathon26.md`](docs/eve_frontier_hackathon26.md) for the full strategic playbook.

## Tech Stack

- **Smart contracts**: [Move](https://move-book.com/) on SUI
- **Frontend**: TypeScript / React with [`@mysten/dapp-kit`](https://sdk.mystenlabs.com/dapp-kit)
- **Backend/tooling**: Python 3.11
- **On-chain data**: SUI GraphQL RPC
- **Auth**: zkLogin (Google/Twitch, no wallet required)
- **Gasless UX**: Sponsored transactions

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 20+ / pnpm
- [SUI CLI](https://docs.sui.io/build/install)

### Setup

```bash
# Python environment
python -m venv venv
venv\Scripts\activate        # Windows
source venv/bin/activate     # macOS/Linux

# Move contracts
sui move build --path contracts
sui move test --path contracts

# Frontend
cd frontend
pnpm install
pnpm dev
```

## Project Structure

```
EF_intel/
├── CLAUDE.md                              # Claude Code project context
├── README.md                              # This file
├── contracts/
│   ├── Move.toml                          # Move package manifest (edition 2024)
│   ├── sources/marketplace.move           # Listing, purchase, delist, Seal policies
│   └── tests/marketplace_tests.move       # 17 tests covering all functions
├── frontend/
│   ├── package.json                       # React + dApp Kit + Seal + Walrus
│   ├── src/
│   │   ├── App.tsx                        # Browse/Create nav with full flow
│   │   ├── providers/AppProviders.tsx     # SUI client + wallet providers
│   │   ├── lib/                           # PTB builders, Seal/Walrus wrappers, Zod schemas
│   │   ├── hooks/                         # useListings, usePurchase, useDecrypt
│   │   └── components/                    # CreateListing, ListingBrowser, PurchaseFlow, IntelViewer
│   └── vite.config.ts
├── docs/
│   ├── eve_frontier_hackathon26.md        # Strategic hackathon playbook
│   ├── ARCHITECTURE.md                    # System architecture
│   ├── seal-spike.md                      # Seal encryption research
│   ├── walrus-spike.md                    # Walrus storage research
│   ├── brainstorms/                       # Design exploration docs
│   └── plans/                             # Implementation plans
└── venv/                                  # Python virtual environment
```

## License

MIT

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TheRiftBroker is a project for the **EVE Frontier × SUI Hackathon** (March 11–31, 2026, $80K prize pool). EVE Frontier is CCP Games' blockchain-integrated space MMO where players operate in 100,000+ solar systems. The game migrated from Ethereum L2/Solidity to **SUI/Move** in October 2025, resetting the entire builder ecosystem.

The strategic planning document lives at `docs/eve_frontier_hackathon26.md`.

## Active Concept: The RiftBroker

Encrypted intel marketplace using SUI Seal + Walrus for scout-sold intelligence with ZK location verification. Scouts encrypt intel payloads, store on Walrus, list on-chain with optional Groth16 proofs. Buyers browse metadata, pay to unlock Seal decryption. Hero features: 3D nebula heat map + ZK-verified intel badges.

**Status**: Phase 4 complete + ZK Phase 1 complete. Contract: 25/25 tests (~350 lines). Frontend: 182/182 tests (15 test files). All core features implemented: marketplace CRUD, Seal encrypt/decrypt, Walrus storage, ZK-verified listings (Groth16 on-chain verification, client-side proof generation, verified badges, verified-only filters), 3D nebula visualization, region navigation, purchase history. Circuit artifacts pending compilation (see `circuits/README.md`). Fresh deploy needed to pick up `LocationVKey` object ID.

**Upcoming**: ZK Phase 2 (proximity proofs), ZK Phase 3 (timestamp freshness), ZK Phase 4 (scout reputation), dispute system, zkLogin, sponsored transactions.

See `docs/plans/2026-02-12-feat-dark-net-encrypted-intel-marketplace-plan.md` for the core implementation plan and `docs/plans/2026-03-13-feat-zk-verified-intel-plan.md` for the ZK roadmap.

### Other Concepts (backlog)

1. **"The Frontier Exchange"** — AMM resource markets with cross-system arbitrage
2. **"The Underwriter"** — Ship insurance with automated bounty loops

## Domain Concepts

- **Smart Assemblies**: On-chain programmable structures (Smart Storage Units, Smart Turrets, Smart Gates) that players physically encounter in-game
- **SSU dual inventory**: Owner-controlled primary storage + per-player ephemeral storage — maps naturally to AMM LP mechanics
- **Seal**: SUI-native encrypted data with conditional decryption (enables information markets)
- **Walrus**: SUI's decentralized storage layer
- **PTBs**: Up to 1,024 sequential commands in one atomic transaction — enables flash-loan-style operations natively
- **zkLogin**: Google/Twitch sign-in without requiring a crypto wallet

## Tech Stack

- **Smart contracts**: Move (SUI blockchain, edition 2024) with `sui::groth16` for ZK verification
- **Frontend**: TypeScript/React with `@mysten/sui@2.4.0`, `@mysten/dapp-kit@1.0.3`, `@mysten/seal@1.0.1`, `@mysten/walrus@1.0.3`
- **ZK proofs**: snarkjs 0.7.6 (Groth16, lazy-loaded) → Arkworks byte conversion for on-chain verification
- **3D visualization**: Three.js + React Three Fiber (nebula heat map)
- **Build**: Vite 5, pnpm, Vitest 4
- **Validation**: Zod 4 (discriminated unions for intel payload schemas)
- **Backend/tooling**: Python 3.11 (venv at `venv/`)
- **On-chain data**: SUI JSON-RPC (event queries + object fetch)
- **Gasless UX**: Sponsored transactions (post-MVP)

## Code Style Rules

### Code Formatting

- No semicolons (enforced)
- Single quotes (enforced)
- No unnecessary curly braces (enforced)
- 2-space indentation
- Import order: external → internal → types

## Key Resources

- Move Book: move-book.com
- SUI Move Intro Course: intro.sui-book.com
- Existing community tools: Atlas (star map), efbom.com (BOM calculator), Alpha-Strike (killboard), EVE Datacore (blockchain explorer)

## Environment Setup

```bash
# Python venv (3.11)
venv\Scripts\activate   # Windows

# SUI CLI (local install)
.sui-bin\sui.exe move build --path contracts
.sui-bin\sui.exe move test --path contracts

# Frontend
cd frontend && pnpm install && pnpm dev
```

## Project Structure

```
TheRiftBroker/
├── CLAUDE.md
├── README.md
├── .gitignore
├── contracts/
│   ├── Move.toml
│   ├── sources/marketplace.move      # Core contract + Seal policies + ZK verification (~350 lines)
│   └── tests/marketplace_tests.move  # 25 tests, all passing
├── circuits/
│   ├── README.md                     # One-time circuit compilation workflow
│   └── location-attestation/         # Groth16 circuit source (pending compilation)
├── frontend/
│   ├── package.json
│   ├── src/
│   │   ├── App.tsx                   # 3D map + panel navigation + purchase flow
│   │   ├── main.tsx
│   │   ├── index.css                 # Dark theme, responsive layout
│   │   ├── providers/AppProviders.tsx
│   │   ├── lib/
│   │   │   ├── constants.ts          # Package ID, Seal key servers, LOCATION_VKEY_ID
│   │   │   ├── types.ts             # On-chain type mirrors (bigint for u64, isVerified)
│   │   │   ├── intel-schemas.ts     # Zod discriminated union (4 intel types)
│   │   │   ├── transactions.ts      # Pure PTB builders (incl. buildCreateVerifiedListingTx)
│   │   │   ├── seal.ts              # Encrypt/decrypt wrappers
│   │   │   ├── walrus.ts            # Upload/download (HTTP API)
│   │   │   ├── zk-proof.ts          # snarkjs → Arkworks byte conversion + generateLocationProof
│   │   │   ├── galaxy-data.ts       # Real EVE Frontier galaxy coordinates
│   │   │   ├── region-data.ts       # Region aggregation for map navigation
│   │   │   ├── heat-map-data.ts     # Aggregation + filtering with verifiedOnly
│   │   │   ├── parse.ts             # On-chain field parsing
│   │   │   ├── format.ts            # Shared timeRemaining, truncateAddress
│   │   │   └── systems.ts           # 20 demo star systems
│   │   ├── scripts/
│   │   │   ├── seed-data.ts         # 15 demo listing definitions (7 tests)
│   │   │   └── seed.ts              # CLI seed script for testnet
│   │   ├── hooks/
│   │   │   ├── useListings.ts       # Event query → object fetch → parse
│   │   │   ├── useHeatMapData.ts    # Aggregate listings for heat map
│   │   │   ├── usePurchase.ts       # Sign + execute purchase tx
│   │   │   └── useDecrypt.ts        # Download → seal_approve → decrypt → validate
│   │   └── components/
│   │       ├── CreateListing.tsx     # Two-step creation form + optional ZK verification
│   │       ├── ListingBrowser.tsx    # Filterable list + verified-only toggle
│   │       ├── MyIntel.tsx          # Purchase history + decrypt + receipt management
│   │       ├── PurchaseFlow.tsx      # Purchase confirmation
│   │       ├── IntelViewer.tsx       # Type-switched intel renderer
│   │       ├── ErrorBoundary.tsx     # Error boundary with reset
│   │       └── heat-map/
│   │           ├── HeatMap.tsx       # SVG fallback star map
│   │           ├── HeatMapControls.tsx # Filter by type, price, verified
│   │           └── star-map/        # 3D Three.js nebula visualization
│   └── vite.config.ts
├── docs/
│   ├── eve_frontier_hackathon26.md   # Strategic playbook
│   ├── ARCHITECTURE.md               # Technical architecture
│   ├── seal-spike.md                 # Seal research findings
│   ├── walrus-spike.md               # Walrus research findings
│   ├── brainstorms/                  # Design exploration (10 files)
│   └── plans/                        # Implementation plans (8 files)
└── venv/                             # Python environment
```
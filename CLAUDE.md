# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EF_intel is a project for the **EVE Frontier × SUI Hackathon** (March 11–31, 2026, $80K prize pool). EVE Frontier is CCP Games' blockchain-integrated space MMO where players operate in 100,000+ solar systems. The game migrated from Ethereum L2/Solidity to **SUI/Move** in October 2025, resetting the entire builder ecosystem.

The strategic planning document lives at `docs/eve_frontier_hackathon26.md`.

## Active Concept: Frontier Intel

Encrypted intel marketplace using SUI Seal + Walrus for scout-sold intelligence. Scouts encrypt intel payloads, store on Walrus, list on-chain. Buyers browse metadata, pay to unlock Seal decryption. Hero feature: live intel heat map.

**Status**: Phase 4 in progress. Contract deployed to SUI testnet (`0xa5e33645...`). Contract: 20/20 tests, frontend: 40/40 tests (33 + 7 seed-data). Seal key servers wired. Seed script + data ready. Frontend build passes.

See `docs/plans/2026-02-12-feat-dark-net-encrypted-intel-marketplace-plan.md` for the full implementation plan.

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

- **Smart contracts**: Move (SUI blockchain, edition 2024)
- **Frontend**: TypeScript/React with `@mysten/sui@2.4.0`, `@mysten/dapp-kit@1.0.3`, `@mysten/seal@1.0.1`, `@mysten/walrus@1.0.3`
- **Build**: Vite 5, pnpm
- **Backend/tooling**: Python 3.11 (venv at `venv/`)
- **On-chain data**: SUI GraphQL RPC (planned)
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
EF_intel/
├── CLAUDE.md
├── README.md
├── .gitignore
├── contracts/
│   ├── Move.toml
│   ├── sources/marketplace.move      # Core contract + Seal policies (~235 lines)
│   └── tests/marketplace_tests.move  # 20 tests, all passing
├── frontend/
│   ├── package.json
│   ├── src/
│   │   ├── App.tsx                   # Map/Browse/Create nav with purchase flow
│   │   ├── main.tsx
│   │   ├── index.css                 # Dark theme, responsive layout
│   │   ├── providers/AppProviders.tsx
│   │   ├── lib/
│   │   │   ├── constants.ts          # Package ID, Clock ID, Seal key servers, intel type labels
│   │   │   ├── types.ts             # On-chain type mirrors (bigint for u64)
│   │   │   ├── intel-schemas.ts     # Zod discriminated union (4 intel types)
│   │   │   ├── transactions.ts      # Pure PTB builders
│   │   │   ├── seal.ts              # Encrypt/decrypt wrappers
│   │   │   ├── walrus.ts            # Upload/download (HTTP API)
│   │   │   ├── heat-map-data.ts     # Aggregation + filtering (12 tests)
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
│   │       ├── CreateListing.tsx     # Two-step creation form
│   │       ├── ListingBrowser.tsx    # Filterable listing list
│   │       ├── PurchaseFlow.tsx      # Purchase confirmation
│   │       ├── IntelViewer.tsx       # Type-switched intel renderer
│   │       ├── ErrorBoundary.tsx     # Error boundary with reset
│   │       └── heat-map/
│   │           ├── HeatMap.tsx       # SVG star map with system nodes
│   │           ├── SystemNode.tsx    # Glow + pulse per system
│   │           └── HeatMapControls.tsx # Filter by type, price
│   └── vite.config.ts
├── docs/
│   ├── eve_frontier_hackathon26.md   # Strategic playbook
│   ├── ARCHITECTURE.md
│   ├── seal-spike.md                 # Seal research findings
│   ├── walrus-spike.md               # Walrus research findings
│   ├── brainstorms/                  # Design exploration
│   └── plans/                        # Implementation plans
└── venv/                             # Python environment
```
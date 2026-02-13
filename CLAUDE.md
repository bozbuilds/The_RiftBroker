# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EF_intel is a project for the **EVE Frontier × SUI Hackathon** (March 11–31, 2026, $80K prize pool). EVE Frontier is CCP Games' blockchain-integrated space MMO where players operate in 100,000+ solar systems. The game migrated from Ethereum L2/Solidity to **SUI/Move** in October 2025, resetting the entire builder ecosystem.

The strategic planning document lives at `docs/eve_frontier_hackathon26.md`.

## Target Concepts (ranked by priority)

1. **"The Frontier Exchange"** — AMM resource markets using bonding curves (x·y=k) deployed as Smart Storage Units across star systems, with cross-system arbitrage detection and flash convoy mechanics via SUI's Programmable Transaction Blocks
2. **"The Dark Net"** — Encrypted intel marketplace using SUI Seal + Walrus for scout-sold intelligence with soulbound reputation tracking
3. **"The Underwriter"** — Ship insurance with automated bounty feedback loops

## Domain Concepts

- **Smart Assemblies**: On-chain programmable structures (Smart Storage Units, Smart Turrets, Smart Gates) that players physically encounter in-game
- **SSU dual inventory**: Owner-controlled primary storage + per-player ephemeral storage — maps naturally to AMM LP mechanics
- **Seal**: SUI-native encrypted data with conditional decryption (enables information markets)
- **Walrus**: SUI's decentralized storage layer
- **PTBs**: Up to 1,024 sequential commands in one atomic transaction — enables flash-loan-style operations natively
- **zkLogin**: Google/Twitch sign-in without requiring a crypto wallet

## Planned Tech Stack

- **Smart contracts**: Move (SUI blockchain)
- **Frontend**: TypeScript/React with `@mysten/sui` and `@mysten/dapp-kit`
- **Scaffold**: `pnpm create @mysten/dapp --template react-client-dapp`
- **Backend/tooling**: Python 3.11 (venv at `venv/`)
- **On-chain data**: SUI GraphQL RPC
- **Gasless UX**: Sponsored transactions via Shinami Gas Station API or SUI native sponsorship

## Environment Setup

```bash
# Python venv (3.11)
venv\Scripts\activate   # Windows

# SUI local devnet
sui start

# Frontend (once scaffolded)
pnpm install
pnpm dev
```

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

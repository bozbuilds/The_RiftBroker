# Architecture

**Last Updated**: 2026-02-12

## System Layers

```
┌─────────────────────────────────────────────────┐
│                  React Dashboard                 │
│         @mysten/dapp-kit · zkLogin · PTBs        │
├─────────────────────────────────────────────────┤
│              SUI GraphQL RPC Layer               │
│         On-chain events · Object queries         │
├─────────────────────────────────────────────────┤
│               Move Smart Contracts               │
│    AMM pools · Intel listings · Reputation        │
├─────────────────────────────────────────────────┤
│            EVE Frontier Smart Assemblies          │
│         SSUs · Smart Gates · Smart Turrets        │
├─────────────────────────────────────────────────┤
│                  SUI Blockchain                   │
│   Shared objects · Seal · Walrus · On-chain RNG   │
└─────────────────────────────────────────────────┘
```

## Component Overview

### Move Contracts (on-chain)

The core game logic lives in Move modules deployed to SUI. These contracts manage:

- **Pool objects** (shared) — AMM state with reserve balances, LP token supply, fee accumulators
- **Intel listings** — Encrypted metadata + Walrus blob references + Seal access policies
- **Reputation scores** — Soulbound objects tracking scout accuracy over time

Key design constraint: SUI's object model means each pool/listing is an independent shared object. Transactions on different objects parallelize automatically — critical for a game with thousands of concurrent players.

### React Frontend (off-chain)

External dashboard providing:

- Real-time price feeds across star systems
- Cross-system arbitrage opportunity detection
- LP position tracking and yield visualization
- Intel marketplace browser with map overlay
- Scout leaderboards and reputation history

Built with `@mysten/dapp-kit` for wallet connection and transaction signing. Uses zkLogin for gasless onboarding (Google/Twitch sign-in, no wallet setup).

### Python Tooling (off-chain)

Data pipeline and analysis scripts:

- Historical price aggregation from on-chain events
- Arbitrage path computation across the system graph
- Risk modeling for insurance premium pricing

### Data Flow

```
Player action (in-game)
  → Smart Assembly triggers Move contract
    → On-chain state change (shared object mutation)
      → SUI GraphQL subscription picks up event
        → React dashboard updates in real-time
```

## Key Design Decisions

### Why AMM over order books?

SSUs have dual inventory (owner primary + per-player ephemeral). The primary inventory maps to the liquidity pool; ephemeral inventory handles individual deposits/withdrawals. Order books would require sorting and matching logic that's expensive on-chain. Bonding curves (x·y=k) compute prices in O(1).

### Why Seal + Walrus for intel?

Intel data must be encrypted at rest (information asymmetry is core to EVE's design). Seal provides condition-based decryption natively on SUI — no external oracle or trusted server needed. Walrus handles blob storage so large payloads (map overlays, fleet compositions) don't bloat on-chain state.

### Why PTBs for arbitrage?

Programmable Transaction Blocks allow up to 1,024 commands atomically. A "flash convoy" can borrow → swap across multiple pools → repay in a single transaction that reverts entirely on failure. No flash loan contracts needed — it's a SUI protocol primitive.

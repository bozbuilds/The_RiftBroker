# Architecture

**Last Updated**: 2026-02-18

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
│         dark_net::marketplace (MVP)               │
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

Single module for MVP: `dark_net::marketplace` (224 lines, 17 tests). Manages:

- **IntelListing** (shared object) — Unencrypted metadata + Walrus blob reference + staked `Balance<SUI>` + expiry via `created_at + decay_hours`
- **PurchaseReceipt** (owned, soulbound) — `key` only (no `store`), non-transferable proof of purchase for Seal decryption policy

Key functions: `create_listing`, `purchase`, `delist`, `set_walrus_blob_id`, `seal_approve`, `seal_approve_scout`.

Key design constraint: SUI's object model means each listing is an independent shared object. Transactions on different listings parallelize automatically.

### Seal Integration (on-chain + off-chain)

Two entry functions serve as Seal decryption policies:

- `seal_approve(id, receipt, ctx)` — Validates buyer owns the receipt AND the receipt matches the requested listing ID (via BCS address decoding). Called by Seal key servers during decryption simulation.
- `seal_approve_scout(_id, listing, ctx)` — Scouts can always decrypt their own intel.

The Seal encryption identity is the listing's hex address. `fromHex(id)` in the TS SDK produces the same 32 bytes as `bcs::to_bytes(&address)` in Move, making hex strings the natural bridge.

### Walrus Integration (off-chain)

Intel payloads are encrypted and stored on Walrus via HTTP API:

- **Upload**: PUT to `publisher.walrus-testnet.walrus.space/v1/blobs`
- **Download**: GET from `aggregator.walrus-testnet.walrus.space/v1/blobs/{blobId}`
- Two-step listing creation: create listing (empty blob) → encrypt with listing ID → upload → `set_walrus_blob_id`

### React Frontend (off-chain)

External dashboard (Phase 2 complete, 21 tests):

- Wallet connection via `@mysten/dapp-kit`
- **Lib layer**: Pure PTB builders (`transactions.ts`), Seal wrappers (`seal.ts`), Walrus HTTP client (`walrus.ts`), Zod payload schemas (`intel-schemas.ts`)
- **Hooks**: `useListings` (event query → object fetch), `usePurchase` (sign + execute), `useDecrypt` (download → decrypt → validate)
- **Components**: `CreateListing` (two-step form), `ListingBrowser` (filter by type), `PurchaseFlow` (confirm + pay), `IntelViewer` (type-switched renderer)
- Live intel heat map (Phase 3)

### Python Tooling (off-chain)

Reserved for future data analysis. Not yet implemented.

### Data Flow

**Scout creates intel**:
```
Scout fills form → Zod validates payload → create_listing (empty blob, on-chain)
  → encrypt(payload, listingId) via Seal → upload(ciphertext) to Walrus
    → set_walrus_blob_id(listingId, blobId) on-chain
```

**Buyer purchases and decrypts**:
```
Buyer browses listings (IntelListed events → object queries)
  → purchase(listingId, payment) on-chain → PurchaseReceipt minted
    → download(blobId) from Walrus → seal_approve(id, receipt) simulated by key servers
      → decrypt(ciphertext) → Zod validate → render by type
```

## Key Design Decisions

### Why Seal + Walrus for intel?

Intel data must be encrypted at rest (information asymmetry is core to EVE's design). Seal provides condition-based decryption natively on SUI — no external oracle or trusted server needed. Walrus handles blob storage so large payloads (map overlays, fleet compositions) don't bloat on-chain state.

### Why soulbound PurchaseReceipt?

Receipts have `key` only (no `store`), making them non-transferable. This prevents receipt-sharing that would break Seal access control — only the original buyer can decrypt. The Seal policy checks `receipt.buyer == ctx.sender()`.

### Why shared objects per listing?

Each `IntelListing` is an independent shared object rather than a dynamic field on a single `Marketplace` object. This means purchases on different listings parallelize automatically (no contention). The tradeoff is per-listing overhead, but for an intel marketplace with moderate listing volume, parallelism wins.

### Why PTBs for batch purchase?

Programmable Transaction Blocks allow up to 1,024 commands atomically. A buyer can purchase intel from multiple scouts in a single transaction — batch-purchase 3 listings, get 3 receipts, all atomic. No wrapper contract needed.

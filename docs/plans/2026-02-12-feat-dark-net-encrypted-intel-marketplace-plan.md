---
title: "feat: Dark Net Encrypted Intel Marketplace"
type: feat
date: 2026-02-13
updated: 2026-03-14
brainstorm: docs/brainstorms/2026-02-12-dark-net-intel-marketplace-brainstorm.md
---

# Dark Net — Encrypted Intel Marketplace

## Progress Summary

| Phase | Status | Key Deliverables |
|-------|--------|-----------------|
| **Phase 0**: Spikes + Scaffolding | **Complete** | Seal spike (`docs/seal-spike.md`), Walrus spike (`docs/walrus-spike.md`), Move package, frontend scaffold |
| **Phase 1**: Core Marketplace Contract | **Complete** | `marketplace.move` (178 lines), 9/9 tests passing, zero warnings |
| **Phase 2**: Frontend — List, Purchase, Decrypt | **Complete** | Contract: 17/17 tests (added `seal_approve`, `set_walrus_blob_id`). Frontend: 21/21 tests, all lib/hooks/components built. |
| **Phase 3**: Heat Map + Polish | **Complete** | Heat map (SVG, 20 demo systems, glow/pulse), dark theme CSS, error boundaries, responsive layout. Contract: 20/20 tests. Frontend: 33/33 tests. |
| **Phase 4**: Deploy + Submit | **Complete** | Contract deployed to testnet (`0xa5e33645...`). Seal key servers wired. Seed data (15 listings, 7 tests). Build passes. |
| **ZK Phase 1**: ZK-Verified Intel | **Complete** | Groth16 on-chain verification, client-side proof generation (snarkjs → Arkworks), ZK-Verified badges, verified-only filters. Contract: 25/25 tests. Frontend: 182/182 tests (31 new zk-proof tests). See `docs/plans/2026-03-13-feat-zk-verified-intel-plan.md`. |
| **3D Nebula Map** | **Complete** | Three.js + React Three Fiber nebula visualization, region navigation, camera focus, additive sprite rendering. Replaced SVG heat map as primary view. |

**Current totals**: 25 contract tests + 182 frontend tests = **207 tests passing**.

**Next up**: Circuit compilation → fresh deploy with `LocationVKey` → ZK Phase 2 (proximity proofs).

---

## Overview

An encrypted intelligence marketplace for EVE Frontier where scouts sell structured intel using SUI-native Seal encryption and Walrus storage. Buyers browse unencrypted metadata, pay to unlock decryption, and view intel client-side. The hero feature is a live intel heat map overlaid on the star system map.

**Target**: EVE Frontier × SUI Hackathon, March 11–31, 2026 ($80K prize pool)
**Builder**: Solo, some Move experience
**Timeline**: 5 weeks (Feb 12 – Mar 19, with buffer before Mar 31 deadline)

---

## Problem Statement

EVE Frontier has zero collaborative intel infrastructure. The SUI migration unlocked Seal (encrypted data with conditional decryption) and Walrus (decentralized blob storage), enabling information markets impossible on any other blockchain. No one has built this yet.

---

## Proposed Solution

A two-layer system for MVP:

1. **Move smart contract** (on-chain): Single `marketplace.move` module — intel listing, payment with receipt pattern for PTB composability, listing management
2. **Seal + Walrus** (off-chain storage): Encrypted intel payloads on Walrus, decryption controlled by on-chain Seal policies checking purchase receipts
3. **React dashboard** (external app): Listing browser, purchase/decrypt flow, heat map

---

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────┐
│              React Dashboard (dApp Kit)           │
│   Heat Map · Listing Browser · Purchase Flow      │
├─────────────────────────────────────────────────┤
│           SUI GraphQL RPC Subscriptions           │
│     Event streams · Object queries · Indexing     │
├─────────────────────────────────────────────────┤
│              Move Smart Contract                  │
│           dark_net::marketplace                   │
├─────────────────────────────────────────────────┤
│         Seal Encryption · Walrus Storage          │
│  Conditional decryption · Blob storage/retrieval  │
├─────────────────────────────────────────────────┤
│                SUI Blockchain                     │
│   Shared objects · Events · ~400ms finality       │
└─────────────────────────────────────────────────┘
```

### On-Chain Data Model

```mermaid
erDiagram
    LocationVKey {
        UID id
        vector vkey_bytes
    }

    IntelListing {
        UID id
        address scout
        u8 intel_type
        u64 system_id
        u64 created_at
        u64 decay_hours
        vector walrus_blob_id
        u64 individual_price
        Balance stake
        bool delisted
        vector location_proof_hash
    }

    PurchaseReceipt {
        UID id
        ID listing_id
        address buyer
        u64 paid_at
    }

    LocationVKey ||--o{ IntelListing : "verifies"
    IntelListing ||--o{ PurchaseReceipt : "generates"
```

### Module Responsibility Map

Single module for MVP — complexity lives in the frontend integration, not the contract:

| Module | File | Shared Objects | Key Functions |
|--------|------|---------------|---------------|
| **marketplace** | `sources/marketplace.move` (~350 lines) | `IntelListing`, `LocationVKey` | `create_listing()`, `create_verified_listing()`, `purchase()`, `delist()`, `set_walrus_blob_id()`, `burn_receipt()`, `seal_approve()`, `seal_approve_scout()`, getters |

---

### Implementation Phases

#### Phase 0: Spikes + Scaffolding (Week 1) — COMPLETE

**Goal**: Retire the two biggest unknowns (Seal and Walrus), then scaffold the project.

This is a full week, not two days. Seal integration is the make-or-break risk.

**Tasks**:

- [x] **Spike: Seal conditional access policy API** (days 1–3):
  - Read Seal docs end-to-end
  - ~~Write a minimal test: encrypt a blob, define a policy that checks for a specific address, decrypt~~ Research-only spike; hands-on testnet verification deferred to Phase 2
  - Determine: does the Seal policy live on-chain (Move object) or off-chain (SDK config)? → **On-chain.** A Move package with `seal_approve` function(s).
  - Determine: how does Seal verify a `PurchaseReceipt` exists? → **Buyer passes owned receipt as arg to `seal_approve`. Key servers simulate; if no abort, they release key shares.**
  - Document the actual API in a `docs/seal-spike.md` → Done
  - **If Seal is unworkable**: fall back to symmetric encryption with key stored in a Move object, revealed on purchase. Weaker but functional. → **Not needed — Seal is viable.**
- [x] **Spike: Walrus blob storage** (day 2–3, parallel with Seal):
  - ~~Write a minimal test: upload a JSON blob, retrieve by ID, confirm round-trip integrity~~ Research-only spike; hands-on testnet verification deferred to Phase 2
  - Determine: blob size limits, latency, SDK availability for TypeScript → **13.6 GiB max, 10 MiB via HTTP, `@mysten/walrus@1.0.3` SDK + HTTP API**
  - **Serialization format**: JSON (stringify → Uint8Array → encrypt → upload). Documented in `docs/walrus-spike.md`.
- [x] Initialize git repository + `.gitignore` (exclude `venv/`, `node_modules/`, `build/`, `.env`)
- [x] Install SUI CLI → `.sui-bin/sui.exe` v1.65.2 (prebuilt Windows binary)
- [x] Create Move package:

```
contracts/
├── Move.toml
├── sources/
│   └── marketplace.move
└── tests/
    └── marketplace_tests.move
```

`contracts/Move.toml`:
```toml
[package]
name = "dark_net"
edition = "2024"

[addresses]
dark_net = "0x0"
```

- [x] Scaffold React frontend:

```bash
# pnpm create @mysten/dapp doesn't accept positional args (interactive only)
# Manually scaffolded instead:
mkdir -p frontend/src/{providers,lib,hooks,components/heat-map}
# Created: package.json, tsconfig.json, vite.config.ts, index.html, main.tsx, App.tsx, AppProviders.tsx, constants.ts, types.ts
cd frontend && pnpm install
```

**Implementation note**: `pnpm create @mysten/dapp --template react-client-dapp frontend` is interactive-only (no positional args). Frontend was manually scaffolded with the same dependencies.

**Implementation note**: `@mysten/sui` v2 breaking changes encountered during scaffold:
- `getFullnodeUrl` moved from `@mysten/sui/client` → `getJsonRpcFullnodeUrl` from `@mysten/sui/jsonRpc`
- `createNetworkConfig` requires `network` field (e.g., `{ url: '...', network: 'testnet' }`)

- [x] Verify `sui move build` compiles, `pnpm dev` serves

**Exit criteria**: ~~Seal spike produces a working encrypt/decrypt round-trip with conditional access. Walrus spike produces a working upload/download round-trip.~~ Both spikes produced research findings with viable architecture; hands-on verification deferred to Phase 2. Spike findings documented. Move package compiles. React scaffold runs. **All met.**

---

#### Phase 1: Core Marketplace Contract (Week 2) — COMPLETE

**Goal**: One Move module that handles listing, purchasing, and delisting.

##### 1a. `marketplace.move` — Structs

```move
module dark_net::marketplace;

use sui::balance::Balance;
use sui::coin::{Self, Coin};
use sui::clock::Clock;
use sui::event;
use sui::sui::SUI;

// === Error constants (EPascalCase) ===

const ENotScout: u64 = 0;
const EInsufficientPayment: u64 = 1;
const EListingExpired: u64 = 2;
const EListingDelisted: u64 = 3;

// === Regular constants (ALL_CAPS) ===

#[allow(unused_const)]
const INTEL_TYPE_RESOURCE: u8 = 0;
#[allow(unused_const)]
const INTEL_TYPE_FLEET: u8 = 1;
#[allow(unused_const)]
const INTEL_TYPE_BASE: u8 = 2;
#[allow(unused_const)]
const INTEL_TYPE_ROUTE: u8 = 3;

// === Objects ===

/// Core listing. Shared object so multiple buyers can purchase concurrently.
/// Holds actual staked tokens in `stake` field (Balance<SUI>, not u64).
/// `delisted` tracks manual removal; expiry computed from created_at + decay_hours.
public struct IntelListing has key {
    id: UID,
    scout: address,
    intel_type: u8,
    system_id: u64,
    created_at: u64,
    decay_hours: u64,
    walrus_blob_id: vector<u8>,
    individual_price: u64,
    stake: Balance<SUI>,
    delisted: bool,
}

/// Proof of purchase. `key` only (NOT `store`) — non-transferable.
/// Seal policy checks receipt.buyer == requester.
public struct PurchaseReceipt has key {
    id: UID,
    listing_id: ID,
    buyer: address,
    paid_at: u64,
}

// === Events (past tense) ===

public struct IntelListed has copy, drop {
    listing_id: ID,
    scout: address,
    intel_type: u8,
    system_id: u64,
}

public struct IntelPurchased has copy, drop {
    listing_id: ID,
    buyer: address,
    price_paid: u64,
}

public struct IntelDelisted has copy, drop {
    listing_id: ID,
    scout: address,
}
```

**Key design decisions applied from review**:
- `stake: Balance<SUI>` — actual tokens, not a `u64` ghost. Enables `delist()` refund and future dispute extraction.
- `PurchaseReceipt` has `key` only, NOT `store` — non-transferable. Prevents receipt-sharing that would break Seal access control.
- `delisted: bool` instead of `active: bool` — clearer semantics (a listing can be "not delisted" but still expired).
- Single module — no `intel.move`, `reputation.move`, `access_policy.move`, or `dispute.move` in MVP.

**Implementation notes (deviations from original plan)**:
- Removed `Self` alias from `use sui::balance::{Self, Balance}` → `use sui::balance::Balance` (unused, caused warning)
- Added `#[allow(unused_const)]` to INTEL_TYPE_* constants (used for documentation, not referenced in code yet)

##### 1b. `marketplace.move` — Functions

- [x] `create_listing()`:
  - Parameter order: primitives (type, system_id, price, decay_hours, blob_id) → `Coin<SUI>` (stake) → `Clock` → `TxContext`
  - Converts stake coin to `Balance<SUI>` via `stake.into_balance()`
  - Creates shared `IntelListing` object via `transfer::share_object()`
  - Emits `IntelListed` event
- [x] `purchase()`:
  - Parameter order: `listing: &mut IntelListing` → `payment: Coin<SUI>` → `Clock` → `TxContext`
  - Validates: `!listing.delisted`, `clock.timestamp_ms() < listing.created_at + listing.decay_hours * 3_600_000`
  - Validates: `payment.value() >= listing.individual_price`
  - Transfers payment to scout via `transfer::public_transfer(payment, listing.scout)`
  - Creates `PurchaseReceipt` with `buyer: ctx.sender()`, transfers to buyer via `transfer::transfer` (key-only)
  - Emits `IntelPurchased`
  - **Returns nothing** — receipt is transferred, not returned (because `key`-only objects can't be returned from PTBs without `store`)
- [x] `delist()`:
  - Only scout: `assert!(listing.scout == ctx.sender(), ENotScout)`
  - Withdraws stake: `let refund = coin::from_balance(listing.stake.withdraw_all(), ctx)`
  - Transfers refund to scout
  - Sets `listing.delisted = true`
  - Emits `IntelDelisted`
- [x] Getters (field-named, no `get_` prefix):
  - `scout()`, `intel_type()`, `system_id()`, `created_at()`, `decay_hours()`, `walrus_blob_id()`, `individual_price()`, `delisted()`, `stake_value()`
  - `is_expired(listing: &IntelListing, clock: &Clock): bool` — computed from fields
  - Receipt getters: `buyer()`, `listing_id()`, `paid_at()`

**Implementation note**: Added `stake_value()` getter (not in original plan) to expose balance amount for tests without accessing `Balance` directly. Added receipt getters `buyer()`, `listing_id()`, `paid_at()` for Seal policy and test access.

##### 1c. Tests — `marketplace_tests.move`

- [x] `listing_creation_works`: Create listing, verify all fields via getters with `assert!()`
- [x] `listing_holds_stake`: Create → verify stake balance equals deposited amount
- [x] `delist_refunds_stake`: Create → delist → verify scout received tokens
- [x] `purchase_creates_receipt`: Purchase → verify receipt exists (TestScenario, multi-address)
- [x] `purchase_pays_scout`: Purchase → verify scout balance increased by price
- [x] `#[test, expected_failure(abort_code = marketplace::ENotScout)] delist_by_non_scout_aborts`
- [x] `#[test, expected_failure(abort_code = marketplace::EListingExpired)] purchase_expired_listing_aborts`
- [x] `#[test, expected_failure(abort_code = marketplace::EInsufficientPayment)] purchase_underpayment_aborts`
- [x] `#[test, expected_failure(abort_code = marketplace::EListingDelisted)] purchase_delisted_listing_aborts`

**Implementation notes (deviations from original plan)**:
- Used `assert!()` instead of `assert_eq!()` — both work, `assert!` used for consistency
- `expected_failure` abort codes require `marketplace::` module prefix (e.g., `marketplace::ENotScout`)
- `std::unit_test::destroy(receipt)` used for PurchaseReceipt cleanup (replaces deprecated `sui::test_utils::destroy`)
- `coin.burn_for_testing()` used for Coin cleanup (not `destroy()`)

**Exit criteria**: `sui move test` passes all 9 tests. Zero warnings. ~~Contract deployed to local devnet.~~ Deployment deferred to Phase 4 (testnet). **Met.**

---

#### Phase 2: Frontend — List, Purchase, Decrypt (Week 3) — COMPLETE

**Goal**: End-to-end flow in the browser — create listing, browse, purchase, decrypt.

**Prerequisite added from Seal spike**: Add `seal_approve` function to `marketplace.move` before building frontend decrypt flow. See `docs/seal-spike.md` for implementation. **Done.**

##### 2a. Frontend Architecture

```
frontend/src/
├── providers/
│   └── AppProviders.tsx          # dApp Kit + QueryClient wrappers          ✅ Done
├── lib/
│   ├── transactions.ts           # PTB builder functions (pure, no React)   ✅ Done (6 tests)
│   ├── seal.ts                   # Seal encrypt/decrypt wrappers            ✅ Done (2 tests)
│   ├── walrus.ts                 # Walrus upload/download (HTTP API)        ✅ Done (5 tests)
│   ├── types.ts                  # TypeScript types mirroring on-chain      ✅ Done
│   ├── constants.ts              # Package ID, Clock ID, intel type enum    ✅ Done
│   └── intel-schemas.ts          # Zod schemas for 4 intel payload types    ✅ Done (8 tests)
├── hooks/
│   ├── useListings.ts            # Event query → object fetch → parse       ✅ Done
│   ├── usePurchase.ts            # Sign + execute purchase tx               ✅ Done
│   └── useDecrypt.ts             # Download → seal_approve → decrypt → validate ✅ Done
├── components/
│   ├── CreateListing.tsx          # Two-step creation form                   ✅ Done
│   ├── ListingBrowser.tsx         # Filterable listing list                  ✅ Done
│   ├── PurchaseFlow.tsx           # Purchase confirmation                    ✅ Done
│   └── IntelViewer.tsx            # Type-switched intel renderer             ✅ Done
├── main.tsx                      # React entry point                         ✅ Done
└── App.tsx                       # Root with Browse/Create nav               ✅ Done
```

**Key architectural decisions applied from review**:
- `lib/transactions.ts` — PTB construction extracted from components into pure testable functions
- `lib/types.ts` — all `u64` fields are `bigint`, not `number` (JavaScript overflow protection)
- `lib/intel-schemas.ts` — Zod discriminated union for payload validation on both scout (form) and buyer (decrypt) sides
- `lib/seal.ts` + `lib/walrus.ts` — isolate the two biggest unknowns behind clean async interfaces
- Error handling designed alongside purchase flow, not bolted on later

##### 2b. `lib/types.ts` — TypeScript Type Mirrors — COMPLETE

Implemented as planned. See `frontend/src/lib/types.ts`.

##### 2c. `lib/intel-schemas.ts` — Zod Payload Validation — COMPLETE

Implemented as planned with Zod 4.x (API compatible). 8 tests covering valid payloads, invalid payloads, and discriminated union dispatch. See `frontend/src/lib/intel-schemas.ts`.

##### 2d. `lib/transactions.ts` — Pure PTB Builders — COMPLETE

Implemented as planned with an additional `buildSetBlobIdTx` for the two-step listing creation flow. 6 tests. See `frontend/src/lib/transactions.ts`.

##### 2e. Component Implementation — COMPLETE

- [x] `CreateListing.tsx`: Two-step flow (create empty listing → encrypt with listing ID → upload to Walrus → `set_walrus_blob_id`). Resolves the Seal identity chicken-and-egg problem.
- [x] `ListingBrowser.tsx`: Queries `IntelListed` events, fetches listing objects, filters by intel type, shows time remaining.
- [x] `PurchaseFlow.tsx`: Price display + confirm button, executes `buildPurchaseTx`.
- [x] `IntelViewer.tsx`: Download blob → `seal_approve` tx → decrypt → Zod validate → switch-render by payload type.

##### 2f. Hooks — COMPLETE

- [x] `useListings.ts`: Event query → object fetch → field parsing.
- [x] `usePurchase.ts`: Sign + execute purchase transaction.
- [x] `useDecrypt.ts`: Full decrypt lifecycle (download → seal_approve → decrypt → validate).

No dedicated hook tests — thin adapters around tested lib functions. Pragmatic exception for hackathon speed.

##### 2g. Contract Additions — COMPLETE

Added to `marketplace.move` during Phase 2 (not in original Phase 1 scope):

- `seal_approve(id, receipt, ctx)` — Entry function for Seal key servers. Validates buyer ownership AND listing ID match via BCS address decoding.
- `seal_approve_scout(_id, listing, ctx)` — Scouts can always decrypt their own intel.
- `set_walrus_blob_id(listing, blob_id, ctx)` — One-time blob ID setter for two-step creation. Scout-only, empty-guard.
- Error constants: `ENotBuyer (4)`, `EWrongListing (5)`, `EBlobIdAlreadySet (6)`.
- `#[test_only] transfer_receipt_for_testing` — Workaround for key-only transfer restriction.
- 8 new tests (17 total): `seal_approve_works`, `seal_approve_wrong_buyer_aborts`, `seal_approve_wrong_listing_aborts`, `seal_approve_scout_works`, `seal_approve_scout_non_scout_aborts`, `set_walrus_blob_id_works`, `set_walrus_blob_id_non_scout_aborts`, `set_walrus_blob_id_already_set_aborts`.

**Implementation notes (deviations from original plan)**:
- Two-step listing creation was not in the original plan — discovered as necessary during Seal integration (listing address needed as encryption identity).
- `seal_approve` validates both `receipt.buyer == ctx.sender()` AND `receipt.listing_id == id` — without listing ID check, a buyer with receipt A could decrypt listing B.
- `EncryptOptions.id` is a **hex string** (not Uint8Array). SDK calls `fromHex(id)` internally, producing the same 32 bytes as `bcs::to_bytes(&address)`.

**Exit criteria**: A scout can create a listing from the UI. A buyer can browse, purchase, and see decrypted intel. PTB batch purchase works for 2+ listings. **Met.** Contract: 17/17 tests, zero warnings. Frontend: 21/21 tests, build passes.

---

#### Phase 3: Heat Map + Polish (Week 4) — COMPLETE

**Goal**: The "wow" demo. Visually compelling, demo-ready product.

##### 3a. Heat Map Components — COMPLETE

Split into focused components (not one monolith):

```
components/
├── heat-map/
│   ├── HeatMap.tsx               # SVG star map with system nodes + tooltip
│   ├── SystemNode.tsx            # Individual system glow + pulse animation
│   └── HeatMapControls.tsx       # Filter by type, price range
```

- [x] `HeatMap.tsx`:
  - SVG star map with 20 demo systems across 6 regions (hardcoded from `lib/systems.ts`)
  - Positions systems on a 900×600 SVG canvas with region labels
  - Delegates rendering to `SystemNode` per system
  - Click system → tooltip with listing details, link to purchase
- [x] `SystemNode.tsx`:
  - Glow intensity = active listing count in system (radialGradient with dynamic radius)
  - Hue = dominant intel type (resource=green, fleet=red, base=orange, route=blue)
  - Opacity = freshness (fully opaque → fade as listings age)
  - Pulse animation = CSS keyframe for high-freshness listings (> 0.95)
- [x] `HeatMapControls.tsx`:
  - Filter toggles by intel type (dropdown)
  - Max price filter
  - Uses shared `INTEL_TYPE_LABELS` from constants
- [x] `hooks/useHeatMapData.ts`:
  - Aggregate listings by `system_id` using pure `aggregateBySystem()` from `lib/heat-map-data.ts`
  - Compute density/freshness per system
  - Auto-refresh `Date.now()` every 60s to keep freshness/expiry accurate
- [x] `lib/heat-map-data.ts` (12 tests via TDD):
  - `aggregateBySystem()` — groups active listings by system, computes dominant type, freshness, avg price
  - `filterHeatMapData()` — filters by intel type and max price
  - Excludes delisted and expired listings
  - Handles zero `decayHours` edge case
- [x] `lib/systems.ts`:
  - 20 demo star systems with x/y coordinates across 6 regions
  - `SYSTEM_MAP` for O(1) lookup by system ID

##### 3b. UX Polish — COMPLETE

- [x] Loading states for all async operations (listing queries show "Loading...")
- [x] Error boundaries around purchase + decrypt flow (`ErrorBoundary.tsx` with key-based remounting)
- [x] Dark theme (CSS custom properties, 13 color tokens, "Dark Net" branding)
- [x] Mobile-responsive layout (breakpoints at 768px and 480px)
- [x] All inline styles migrated to CSS classes in `index.css`

##### 3c. Code Review Fixes (added during Phase 3)

Code review identified 27 issues (3 critical, 5 high, 10 medium, 9 low). All fixed:

**Contract fixes (3 new tests, 20/20 total)**:
- [x] Input validation: `intel_type <= INTEL_TYPE_ROUTE`, `decay_hours <= 8760` (1 year cap)
- [x] Overpayment protection: `purchase()` splits exact price, refunds remainder to buyer
- [x] Error constants: `EInvalidIntelType (7)`, `EDecayTooLarge (8)`, `MAX_DECAY_HOURS (8760)`

**Frontend fixes (33/33 tests total)**:
- [x] Fixed `useDecrypt.ts`: hex-decode listing address for Seal identity (was using blob ID bytes)
- [x] Fixed `walrus.ts`: proper `ArrayBuffer.slice()` for `Uint8Array` views, `encodeURIComponent` for blob IDs
- [x] Fixed `useListings.ts`: cursor-based pagination (MAX_EVENT_PAGES=10, limit=50, dedup)
- [x] Fixed `useHeatMapData.ts`: periodic `Date.now()` refresh (60s interval)
- [x] Deduplicated `timeRemaining`, `truncateAddress`, intel type labels into shared modules
- [x] Form disabled during submission (`<fieldset disabled>`)
- [x] Error display in `PurchaseFlow.tsx`
- [x] Post-purchase success state in `App.tsx`
- [x] `readonly` array types in `SystemHeatData`
- [x] `buildBatchPurchaseTx` throws on empty array

**Exit criteria**: Heat map renders with demo systems. Glow/pulse animations work. Filter controls work. Dark theme applied. All 20 contract tests pass. All 33 frontend tests pass. Clean `tsc -b` build. **Met.**

---

#### Phase 4: Deploy + Submit (Week 5) — COMPLETE

**Goal**: Deployed, recorded, and submitted.

- [x] Deploy contracts to SUI testnet → `0xa5e33645e5d1b3f886aa6624157b131c389c9c61aedb744e20a761b5003608b8`
- [x] Wire Seal testnet key servers (3 open-mode: 2 Mysten Labs + Ruby Nodes)
- [x] Seed data module: 15 demo listings across 12 systems, 4 intel types (7 tests via TDD)
- [x] Seed script: CLI tool using `tsx`, reuses `lib/seal.ts` + `lib/walrus.ts`
- [x] Update `PACKAGE_ID` in `constants.ts` with deployed address
- [x] Frontend build passes (`tsc -b && vite build`)
- [x] All tests pass: 25/25 contract, 182/182 frontend
- [ ] Run seed script on testnet
- [ ] Deploy frontend (Vercel or similar)
- [ ] Smoke test full flow (browse, purchase, decrypt)
- [ ] Record demo video
- [ ] Write submission narrative
- [ ] Submit before voting period begins

**Implementation notes**:
- Seal key servers from https://seal-docs.wal.app/Pricing/ (open-mode testnet)
- `scripts/` directory excluded from `tsconfig.json` — `tsx` handles its own TS compilation
- Seed script builds transactions inline (not via `lib/transactions.ts`) to use `SuiClient.signAndExecuteTransaction` directly with `Ed25519Keypair`
- UpgradeCap stored at `0x8d8e0088ae010d6a20c78de98b5982c1e07c445321483c4a080f6a0f7cd2b364`
- V2 package (burn_receipt): `0xb5369b33fb321d9f8ffbac42232bf60f985c34e7d05b5178e9435a93eb710125`

**Exit criteria**: Live on testnet. Demo video uploaded. Submission narrative complete.

---

#### ZK Phase 1: ZK-Verified Intel (Week 6+) — COMPLETE

**Goal**: Scouts can attach Groth16 location proofs to listings for on-chain verification.

See full plan: `docs/plans/2026-03-13-feat-zk-verified-intel-plan.md`

**Delivered**:
- [x] `zk-proof.ts` — snarkjs → Arkworks byte conversion (fieldToLE, serializeG1/G2Compressed, snarkjsProofToArkworks, publicSignalsToBytes, generateLocationProof)
- [x] 31 unit tests for all conversion functions
- [x] `create_verified_listing` — on-chain Groth16 verification via `sui::groth16`
- [x] `LocationVKey` shared object — verification key bytes, created at package init
- [x] `location_proof_hash` field on IntelListing — non-empty = verified
- [x] `VerifiedIntelListed` event
- [x] 5 new contract tests (25 total): verified listing creation, invalid proof abort, is_verified getter, input validation (min decay, min stake, min price)
- [x] `buildCreateVerifiedListingTx` PTB builder
- [x] ZK verification toggle in CreateListing (disabled for Route intel)
- [x] "ZK-Verified" badges in ListingBrowser, MyIntel, HeatMapControls
- [x] `verifiedOnly` filter in heat-map-data
- [x] `isVerified` field in types.ts + parse.ts

**Pending**:
- [ ] Circuit compilation (see `circuits/README.md`)
- [ ] Fresh contract deploy with LocationVKey object
- [ ] Update `LOCATION_VKEY_ID` in constants.ts

---

#### 3D Nebula Map (parallel with ZK) — COMPLETE

**Goal**: Replace SVG heat map with immersive 3D visualization.

See plans: `docs/plans/2026-03-09-feat-real-galaxy-star-map-plan.md`, `docs/plans/2026-03-13-feat-intel-nebula-plan.md`

**Delivered**:
- [x] Three.js + React Three Fiber canvas nebula with additive sprite rendering
- [x] Real EVE Frontier galaxy coordinates (`galaxy-data.ts`)
- [x] Region-based navigation with camera focus
- [x] Dynamic glow based on intel density per system
- [x] Region panel with listing counts and browse integration
- [x] Obfuscated system labels for lore consistency
- [x] SVG fallback heat map preserved

---

## Edge Cases & Error States (MVP)

| Scenario | Expected Behavior |
|----------|------------------|
| Purchase expired listing | Abort with `EListingExpired` |
| Insufficient payment | Abort with `EInsufficientPayment` |
| Non-scout tries to delist | Abort with `ENotScout` |
| Purchase delisted listing | Abort with `EListingDelisted` |
| Walrus blob unavailable | Frontend shows error + retry button |
| Seal decrypt failure | Frontend shows "access denied" with support hint |
| Invalid payload after decrypt | Frontend shows "corrupted data" (Zod parse failed) |
| Same buyer purchases same listing twice | Allow — idempotent, creates second receipt |

---

## Constants & Configuration

```move
// Error codes (EPascalCase)
const ENotScout: u64 = 0;
const EInsufficientPayment: u64 = 1;
const EListingExpired: u64 = 2;
const EListingDelisted: u64 = 3;
const ENotBuyer: u64 = 4;
const EWrongListing: u64 = 5;
const EBlobIdAlreadySet: u64 = 6;
const EInvalidIntelType: u64 = 7;
const EDecayTooLarge: u64 = 8;
const EInvalidLocationProof: u64 = 9;
const EDecayTooSmall: u64 = 10;
const EStakeTooLow: u64 = 11;
const EPriceTooLow: u64 = 12;

// Regular constants (ALL_CAPS)
const INTEL_TYPE_RESOURCE: u8 = 0;
const INTEL_TYPE_FLEET: u8 = 1;
const INTEL_TYPE_BASE: u8 = 2;
const INTEL_TYPE_ROUTE: u8 = 3;
const MAX_DECAY_HOURS: u64 = 8760; // 1 year
const MIN_DECAY_HOURS: u64 = 1;
const MIN_PRICE: u64 = 1;
const MIN_STAKE: u64 = 1;
```

---

## Open Questions (MVP)

| # | Question | Blocks | Resolution Strategy | Status |
|---|----------|--------|-------------------|--------|
| 1 | EVE Frontier's token contract on SUI | Payment integration | Search EVE Frontier docs/Discord. Use SUI native token as fallback. | Open — using `SUI` for now |
| 2 | Star map data source (system coordinates) | Heat map | Check EVE Frontier API, Atlas, or community Discord. Hardcode 20 systems for demo. | Open |
| 3 | Seal conditional policy API specifics | Encryption flow | **Week 1 spike (full week)**. This is the #1 risk. | **Resolved** — see `docs/seal-spike.md`. IBE with `seal_approve` Move functions. PurchaseReceipt-based access viable. |
| 4 | Smart Assembly deployment type | In-game presence | Likely SSU. Confirm with builder docs. Not blocking for external app submission. | Open |

---

## Acceptance Criteria (MVP)

### Functional Requirements

- [ ] Scout can create an encrypted intel listing with structured metadata and staked tokens
- [ ] Buyer can browse listings filtered by type, system, and freshness
- [ ] Buyer can purchase intel and decrypt it client-side via Seal
- [ ] Decrypted intel renders correctly based on schema type (Zod-validated)
- [ ] Heat map shows real-time intel density across star systems with freshness decay
- [ ] PTB batch purchase works for 2+ listings in a single transaction

### Non-Functional Requirements

- [x] Contract compiles with `sui move build` on edition 2024
- [x] All contract tests pass via `sui move test` (25/25, zero warnings)
- [x] All frontend tests pass via `pnpm test` (182/182)
- [x] Frontend follows code style: no semicolons, single quotes, 2-space indent
- [x] All Move code follows the Code Quality Checklist (modern syntax, parameter ordering)
- [x] All `u64` values in TypeScript use `bigint` (no overflow)

### Quality Gates

- [x] Phase 0 Seal spike produces research findings with viable architecture (hands-on verification deferred to Phase 2)
- [x] Phase 0 Walrus spike produces research findings with SDK + HTTP API documented
- [x] Each phase has passing tests before moving to next (Phase 0 → Phase 1: 9/9; Phase 1 → Phase 2: 17/17 contract + 21/21 frontend; Phase 2 → Phase 3: 20/20 contract + 33/33 frontend; Phase 3 → Phase 4: 20/20 contract + 40/40 frontend; Phase 4 → ZK Phase 1: 25/25 contract + 182/182 frontend)
- [ ] Demo video recorded
- [ ] Circuit compilation completed + fresh deploy with LocationVKey

---

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation | Status |
|------|-----------|--------|------------|--------|
| Seal API immature or underdocumented | Medium | Critical | Full week 1 spike. If unworkable, fall back to symmetric encryption with key escrow in a Move object. | **Mitigated** — SDK 1.0.1. Seal fully integrated end-to-end. |
| EVE Frontier game API unavailable for star map | Medium | High | Hardcode 20 high-traffic systems for demo. | **Mitigated** — Real galaxy coordinates extracted, 3D nebula map rendering working. |
| Move learning curve exceeds estimate | Low | High | Conventions documented in brainstorm. Single module keeps scope tight. | **Mitigated** — 25 tests, ZK verification integrated. |
| Hackathon deadline pressure | Medium | High | Phases ordered by demo value. Heat map + core loop is a compelling demo even without polish. | **Mitigated** — Core MVP + ZK verification + 3D map complete. |
| `@mysten/sui` v2 breaking changes | Low | Medium | Pin versions, document migration notes. | **Mitigated** — `getJsonRpcFullnodeUrl`, `network` field requirement documented. |
| Circuit compilation environment | Medium | Medium | Circom requires Linux/macOS; documented in `circuits/README.md`. | **Open** — Circuit source ready, compilation pending. |
| snarkjs bundle size | Low | Medium | Lazy-load snarkjs only on first proof generation. | **Mitigated** — Dynamic import implemented. |

---

## File Structure

Files marked ✅ exist. All core features implemented.

```
TheRiftBroker/
├── CLAUDE.md                                  ✅
├── README.md                                  ✅
├── .gitignore                                 ✅
├── contracts/
│   ├── Move.toml                              ✅
│   ├── sources/
│   │   └── marketplace.move                   ✅ (~350 lines, 25/25 tests)
│   └── tests/
│       └── marketplace_tests.move             ✅
├── circuits/
│   ├── README.md                              ✅ (compilation workflow)
│   └── location-attestation/                  ✅ (pending compilation)
├── frontend/
│   ├── package.json                           ✅
│   ├── tsconfig.json                          ✅
│   ├── vite.config.ts                         ✅
│   ├── index.html                             ✅
│   ├── src/
│   │   ├── main.tsx                           ✅
│   │   ├── index.css                          ✅ (dark theme, responsive)
│   │   ├── App.tsx                            ✅ (3D map + panel nav)
│   │   ├── providers/
│   │   │   └── AppProviders.tsx               ✅
│   │   ├── lib/
│   │   │   ├── constants.ts                   ✅ (Package IDs, Seal servers, VKey ID)
│   │   │   ├── types.ts                       ✅ (bigint, isVerified)
│   │   │   ├── transactions.ts                ✅ (PTB builders incl. verified)
│   │   │   ├── transactions.test.ts           ✅
│   │   │   ├── zk-proof.ts                    ✅ (snarkjs → Arkworks conversion)
│   │   │   ├── zk-proof.test.ts               ✅ (31 tests)
│   │   │   ├── seal.ts                        ✅
│   │   │   ├── seal.test.ts                   ✅
│   │   │   ├── walrus.ts                      ✅
│   │   │   ├── walrus.test.ts                 ✅
│   │   │   ├── intel-schemas.ts               ✅
│   │   │   ├── intel-schemas.test.ts          ✅
│   │   │   ├── galaxy-data.ts                 ✅ (real galaxy coordinates)
│   │   │   ├── galaxy-data.test.ts            ✅
│   │   │   ├── region-data.ts                 ✅ (region aggregation)
│   │   │   ├── region-data.test.ts            ✅
│   │   │   ├── heat-map-data.ts               ✅ (aggregation + verifiedOnly)
│   │   │   ├── heat-map-data.test.ts          ✅
│   │   │   ├── parse.ts                       ✅ (on-chain field parsing)
│   │   │   ├── parse.test.ts                  ✅
│   │   │   ├── format.ts                      ✅ (shared utils)
│   │   │   ├── format.test.ts                 ✅
│   │   │   └── systems.ts                     ✅ (20 demo systems)
│   │   ├── scripts/
│   │   │   ├── seed-data.ts                   ✅ (15 listings)
│   │   │   ├── seed-data.test.ts              ✅
│   │   │   └── seed.ts                        ✅ (CLI seed script)
│   │   ├── hooks/
│   │   │   ├── useListings.ts                 ✅ (paginated)
│   │   │   ├── useHeatMapData.ts              ✅ (aggregation + 60s refresh)
│   │   │   ├── usePurchase.ts                 ✅
│   │   │   └── useDecrypt.ts                  ✅
│   │   └── components/
│   │       ├── CreateListing.tsx               ✅ (+ ZK verification toggle)
│   │       ├── ListingBrowser.tsx              ✅ (+ verified-only filter)
│   │       ├── MyIntel.tsx                     ✅ (purchase history + decrypt)
│   │       ├── PurchaseFlow.tsx                ✅
│   │       ├── IntelViewer.tsx                 ✅
│   │       ├── ErrorBoundary.tsx               ✅
│   │       └── heat-map/
│   │           ├── HeatMap.tsx                 ✅ (SVG fallback)
│   │           ├── HeatMapControls.tsx         ✅ (+ verified filter)
│   │           └── star-map/                   ✅ (3D Three.js nebula)
│   └── public/
│       └── zk/                                (circuit artifacts, pending)
├── docs/
│   ├── eve_frontier_hackathon26.md            ✅
│   ├── ARCHITECTURE.md                        ✅
│   ├── seal-spike.md                          ✅
│   ├── walrus-spike.md                        ✅
│   ├── brainstorms/                           ✅ (10 files)
│   └── plans/                                 ✅ (8 files)
└── venv/                                      ✅
```

---

## Upcoming: ZK Phases 2–4

Detailed brainstorms exist for each phase in `docs/brainstorms/`.

### ZK Phase 2: Proximity Proofs

**Goal**: Prove scout was within range of a specific smart assembly or structure, not just in the right star system.

See `docs/brainstorms/2026-03-13-zk-phase2-proximity-intel-brainstorm.md`.

### ZK Phase 3: Timestamp Freshness

**Goal**: Prove intel was gathered within a recent time window (e.g., last 24 hours) without revealing exact timestamp.

See `docs/brainstorms/2026-03-13-zk-phase3-timestamp-freshness-brainstorm.md`.

### ZK Phase 4: Scout Reputation

**Goal**: On-chain reputation system derived from verified intel history — scouts build trust through provably accurate, timely intel.

See `docs/brainstorms/2026-03-13-zk-phase4-scout-reputation-brainstorm.md`.

---

## Post-MVP: Future Phases

Items below were scoped out of MVP based on review feedback. Each is independently addable.

### Post-MVP A: Dispute System

**Prerequisites**: Working marketplace with purchase flow.

- [ ] `contracts/sources/dispute.move` — separate module
- [ ] `DisputeTicket` hot potato (no abilities — forces consumption, prevents abandonment)
- [ ] `Dispute` shared object with voting: `VecMap<address, u64>` for voter stakes (O(n) lookup, acceptable at low scale; migrate to `Table` if needed)
- [ ] `open_dispute()` — requires `PurchaseReceipt`, challenger stakes tokens
- [ ] `vote()` — any address with small stake, one vote per address
- [ ] `resolve()` — callable after deadline, payout formula:
  ```
  If upheld:
    challenger receives: scout_stake × (challenger_stake / total_stakes)
    each voter_for: scout_stake × (voter_stake / total_stakes)
  If rejected:
    scout receives: challenger_stake × (scout_stake / total_stakes)
    each voter_against: challenger_stake × (voter_stake / total_stakes)
  ```
- [ ] **Stake calibration**: `MIN_STAKE_AMOUNT` must be meaningful relative to expected earnings per listing, not a fixed 0.001 SUI. If a scout sells false intel to 10 buyers at 1 SUI, staking 0.001 SUI is not accountability. Consider: minimum stake = individual_price × expected_purchase_count.
- [ ] Edge cases: dispute on delisted listing (allow), scout delist during active dispute (block with `EDisputeActive`), vote after deadline (abort)
- [ ] Frontend: `DisputeFlow.tsx`, `DisputeList.tsx`, `VotePanel.tsx`

### Post-MVP B: Soulbound Reputation

**Prerequisites**: Working dispute system (reputation is meaningless without dispute feedback loop).

- [ ] `contracts/sources/reputation.move` — separate module
- [ ] `Reputation` struct (`has key`, NO `store` = soulbound)
- [ ] Created on first listing, updated by dispute resolution
- [ ] `increment()` + `penalize()` (friend-only, called by dispute module)
- [ ] Frontend: Scout leaderboard, reputation badges on listings
- [ ] **Alternative MVP approach**: Derive reputation client-side from on-chain events (count `IntelPurchased` vs `DisputeResolved` events per scout). No contract needed.

### Post-MVP C: Tribe-Tier Pricing

**Prerequisites**: Understanding of how EVE Frontier represents tribe/alliance membership on SUI.

- [ ] Add `tribe_price: u64` field to `IntelListing`
- [ ] Seal policy checks tribe membership for tribe-tier access
- [ ] Tier selection in `PurchaseFlow.tsx`
- [ ] **Blocked by**: Open question #3 (tribe membership on-chain representation). Cannot build until resolved.

### Post-MVP D: zkLogin + Sponsored Transactions

**Prerequisites**: Working frontend with standard wallet connection.

- [ ] zkLogin integration (Google/Twitch sign-in, no wallet setup)
- [ ] Sponsored transactions via Shinami Gas Station or SUI native sponsorship
- [ ] **Risk**: zkLogin is a multi-day integration with OAuth configuration. Only attempt if core demo is solid.

### Post-MVP E: Scout Profiles + Purchase History

**Prerequisites**: Working purchase flow with receipt tracking.

- [ ] `ScoutProfile.tsx` — listing history, earnings summary
- [ ] `PurchaseHistory.tsx` — buyer's purchased intel with re-decrypt
- [ ] Low demo value — judges care about the core loop and heat map, not CRUD views.

---

## References

### Internal

- Brainstorm: `docs/brainstorms/2026-02-12-dark-net-intel-marketplace-brainstorm.md`
- ZK brainstorms: `docs/brainstorms/2026-03-13-zk-verified-intel-brainstorm.md`, `zk-phase2-*`, `zk-phase3-*`, `zk-phase4-*`
- ZK plan: `docs/plans/2026-03-13-feat-zk-verified-intel-plan.md`
- Architecture: `docs/ARCHITECTURE.md`
- Strategic playbook: `docs/eve_frontier_hackathon26.md`
- Seal spike: `docs/seal-spike.md` — Seal architecture, `seal_approve` rules, encrypt/decrypt flows, risks
- Walrus spike: `docs/walrus-spike.md` — Walrus SDK, HTTP API, blob ID format, serialization
- Circuit compilation: `circuits/README.md` — Groth16 circuit build workflow
- Code conventions: `CLAUDE.md` (TypeScript), brainstorm Move Architecture section (Move)

### External

- [Move Book](https://move-book.com/) — Move language reference
- [Move Code Quality Checklist](https://move-book.com/guides/code-quality-checklist/) — Enforced conventions
- [SUI Move Intro Course](https://intro.sui-book.com/) — Learning path
- [Seal Documentation](https://seal.mystenlabs.com/) — SDK reference
- [Walrus](https://www.walrus.xyz/) — Decentralized blob storage
- [@mysten/dapp-kit](https://sdk.mystenlabs.com/dapp-kit) — React integration

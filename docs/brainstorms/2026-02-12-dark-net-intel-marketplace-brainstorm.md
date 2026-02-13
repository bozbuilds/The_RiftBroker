# Brainstorm: The Dark Net — Encrypted Intel Marketplace

**Date**: 2026-02-12
**Status**: Ready for planning
**Approach**: A — Intel-First MVP

---

## What We're Building

An encrypted intelligence marketplace for EVE Frontier where scouts sell structured intel to other players using SUI-native encryption (Seal) and decentralized storage (Walrus). The system creates an information economy with skin-in-the-game accountability through stake-based disputes and soulbound reputation.

### Core Loop

```
Scout discovers intel → Encrypts via Seal → Stores on Walrus → Lists on-chain with metadata + tiered pricing
    ↓
Buyer browses listings (unencrypted metadata) → Pays (individual or tribe tier) → Seal grants decryption → Intel revealed
    ↓
If intel is false → Buyer stakes counter-challenge → Community validates → Scout loses stake + reputation
```

---

## Key Decisions

### 1. Primary User: Scouts (supply-side first)
No marketplace works without inventory. The listing and encryption flow is the core primitive. Buyer UX is built on top of it.

### 2. Structured Intel Schemas (not freeform)
Four predefined types with typed fields:

| Type | Key Fields | Decay Rate |
|------|-----------|------------|
| **Resource location** | system_id, coordinates, resource_type, yield_estimate | Days |
| **Fleet/threat sighting** | system_id, fleet_size, ship_types, heading, timestamp | Hours |
| **Base intelligence** | system_id, structure_type, defense_level, owner_tribe | Days |
| **Route safety report** | origin_system, dest_system, threat_level, gate_camps | Hours |

Structured schemas enable: meaningful search/filtering, typed rendering in the dashboard, potential automated cross-referencing with on-chain data, and clearer dispute evidence.

**On-chain vs off-chain split**: The encrypted payload with full detail lives on Walrus. The on-chain `IntelListing` stores only unencrypted metadata (intel type discriminant, system_id, timestamps, pricing, Walrus blob reference) — enough for browsing, filtering, and heat map rendering without decryption.

### 3. Verification: Stake-Based Disputes
- Scouts stake tokens when listing intel
- Buyers can open a dispute by staking a counter-amount
- Other players can vote/confirm the dispute (may require their own small stake)
- Resolution: if dispute upheld, scout loses stake (split between challenger + voters), reputation decreases. If dispute rejected, challenger loses stake, scout reputation unaffected
- Creates emergent counter-intelligence gameplay

### 4. Access Model: Tiered Pricing via Seal Policies
- **Individual tier**: Decryption granted to the buyer's address only. Base price.
- **Tribe tier**: Decryption granted to all members of the buyer's on-chain tribe. Premium price (e.g., 3–5x individual).
- Seal policy checks which tier was purchased before issuing decryption keys
- Scout sets both prices at listing time

### 5. Currency: Native Game Token
Use EVE Frontier's primary in-game token for all pricing, staking, and payouts. Keeps the marketplace embedded in the game economy with zero extra friction.

### 6. Hero Feature: Live Intel Heat Map
Star map overlay where regions glow based on intel density and freshness. Color intensity = number of active listings. Fade = time decay. Pulse = fresh listing just dropped. Click a region to see available intel. This is the "wow" moment for judges and community voters.

---

## Approach: Intel-First MVP (5 weeks)

### Week 1–2: Scout Listing Flow (Move + Seal + Walrus)
- Move contracts: intel listing struct, 4 schema types, tiered pricing config
- Seal integration: encrypt intel payload with conditional access policy
- Walrus integration: store encrypted blobs, reference by on-chain listing
- Scout can list intel, set prices, stake tokens
- Result: **scouts can create encrypted intel listings on-chain**

### Week 3: Purchase + Decrypt Flow
- Buyer browses listings via metadata (unencrypted on-chain)
- Payment contract: handles individual vs tribe tier payment
- Seal decryption: buyer (or tribe) gains access after payment
- Dashboard: listing browser, purchase flow, decrypted intel renderer
- Result: **end-to-end marketplace loop works**

### Week 4: Heat Map + Dashboard Polish
- Star map integration with intel density overlay
- Real-time updates via SUI GraphQL subscriptions
- Scout profile pages with listing history
- Purchase history for buyers
- Result: **visually compelling, demo-ready product**

### Week 5: Dispute System + Hardening
- Stake-based dispute contracts
- Dispute resolution UI
- Soulbound reputation objects (non-transferable score)
- Scout leaderboard ranked by reputation
- Edge case handling, testnet deployment, demo recording
- Result: **complete system with crypto-economic accountability**

---

## Move Architecture (Code Quality Checklist)

All contract code must follow the [Move Book Code Quality Checklist](https://move-book.com/guides/code-quality-checklist/). These decisions are baked in from day one to avoid refactoring.

### Package Manifest

```toml
# Move.toml
[package]
name = "dark_net"
edition = "2024"

[addresses]
dark_net = "0x0"
```

- **Edition 2024** required — all modern syntax (label modules, macros, enums) depends on it
- **No explicit framework dependencies** — SUI 1.45+ uses implicit deps
- **Prefixed address** `dark_net` not `intel` — avoids collisions with other packages

### Module Structure

```
sources/
├── intel.move          # Core IntelListing shared object, schema types
├── marketplace.move    # List, purchase, delist functions
├── reputation.move     # Soulbound reputation objects
├── dispute.move        # Stake-based dispute resolution
└── access_policy.move  # Seal tier logic + Walrus blob references
```

All modules use label syntax (no curly brace wrapping):
```move
module dark_net::intel;
```

### Struct Conventions

**Core listing object** (shared, holds only unencrypted metadata):
```move
public struct IntelListing has key {
    id: UID,
    scout: address,
    intel_type: u8,             // enum discriminant for filtering
    system_id: u64,             // unencrypted for heat map
    created_at: u64,            // freshness
    decay_rate: u64,            // hours until stale
    walrus_blob_id: vector<u8>, // encrypted payload reference
    individual_price: u64,
    tribe_price: u64,
    stake_amount: u64,          // scout's skin in the game
}
```

**Soulbound reputation** — no `store` ability = non-transferable:
```move
public struct Reputation has key {
    id: UID,
    scout: address,
    accuracy_score: u64,
    total_listings: u64,
    successful_listings: u64,
    disputed_listings: u64,
}
```

**Capabilities suffixed with `Cap`**:
```move
public struct AdminCap has key, store { id: UID }
```

**Events in past tense**:
```move
public struct IntelListed has copy, drop { listing_id: ID, scout: address }
public struct IntelPurchased has copy, drop { listing_id: ID, buyer: address, tier: u8 }
public struct DisputeOpened has copy, drop { listing_id: ID, challenger: address }
public struct DisputeResolved has copy, drop { listing_id: ID, upheld: bool }
```

**Hot potato for disputes** — no abilities forces consumption, prevents abandoned disputes:
```move
public struct DisputeTicket {
    listing_id: ID,
    challenger: address,
    stake: Balance<GAME_TOKEN>,
}
```

### Constants

```move
// EPascalCase for errors
const ENotScout: u64 = 0;
const EInsufficientPayment: u64 = 1;
const EListingExpired: u64 = 2;
const EDisputeAlreadyOpen: u64 = 3;
const EInvalidTier: u64 = 4;

// ALL_CAPS for regular constants
const INDIVIDUAL_TIER: u8 = 0;
const TRIBE_TIER: u8 = 1;
const MAX_DECAY_HOURS: u64 = 168;
```

### Function Signatures

**No `public entry`** — use `public` (composable, returns values) or `entry` (terminal endpoint):
```move
// Composable — returns listing for PTB chaining
public fun create_listing(
    marketplace: &mut Marketplace,
    walrus_blob_id: vector<u8>,
    intel_type: u8,
    system_id: u64,
    individual_price: u64,
    tribe_price: u64,
    stake: Coin<GAME_TOKEN>,
    clock: &Clock,
    ctx: &mut TxContext,
): IntelListing { ... }

// Terminal — no return value
entry fun purchase_and_decrypt(
    listing: &mut IntelListing,
    payment: Coin<GAME_TOKEN>,
    tier: u8,
    ctx: &mut TxContext,
) { ... }
```

**Parameter order enforced**: Objects (mut → immut) → Caps → Primitives → Clock → TxContext

**Composable purchase flow** — split into receipt pattern for PTB chaining (buy from 3 scouts in one tx):
```move
public fun purchase(
    listing: &mut IntelListing,
    payment: Coin<GAME_TOKEN>,
    tier: u8,
    ctx: &mut TxContext,
): PurchaseReceipt { ... }

public fun authorize_decrypt(
    listing: &IntelListing,
    receipt: &PurchaseReceipt,
): DecryptionAuth { ... }
```

**Getters named after field** — no `get_` prefix:
```move
public fun scout(listing: &IntelListing): address { listing.scout }
public fun system_id(listing: &IntelListing): u64 { listing.system_id }
public fun accuracy_score(rep: &Reputation): u64 { rep.accuracy_score }
```

### Modern Syntax Patterns

Use method-style calls throughout — no legacy function-style:

```move
// ✅ Coin operations
let stake_balance = payment.balance_mut().split(stake_amount);
let refund = balance.into_coin(ctx);

// ✅ Strings
let name = b"Dark Net Intel".to_string();

// ✅ UID cleanup
id.delete();

// ✅ Context
let sender = ctx.sender();

// ✅ Vectors
let mut tags = vector[1u8, 2, 3];
let first = tags[0];
assert!(tags.length() == 3);

// ✅ Option macros
opt.do!(|value| process(value));
let value = opt.destroy_or!(abort ECannotBeEmpty);

// ✅ Loop macros
vec.do_ref!(|e| emit_event(e));
let sum = balances.fold!(0u64, |acc, v| acc + v);
let filtered = listings.filter!(|l| l.system_id == target);
vec.destroy!(|e| cleanup(e));

// ✅ Unpack with ..
let IntelListing { id, scout, .. } = listing;
```

### Testing Rules

```move
// No test_ prefix — #[test] attribute is sufficient
#[test]
fun listing_creation_works() {
    let ctx = &mut tx_context::dummy();
    // ...
    assert_eq!(listing.system_id(), 42);  // assert_eq! over assert!
}

// Merge attributes, no cleanup in expected_failure
#[test, expected_failure(abort_code = EInsufficientPayment)]
fun purchase_with_insufficient_funds_aborts() {
    // ... setup that triggers abort
}

// Use test_utils::destroy for teardown
use sui::test_utils::destroy;
destroy(listing);
```

- Use `tx_context::dummy()` for simple tests — skip `TestScenario` unless multi-address needed
- No abort codes in `assert!()` — use `assert_eq!` to show both values on failure

### Design Risks Flagged by Checklist

**Shared object contention**: `IntelListing` as a shared object means every purchase on the same listing gets consensus-ordered. For popular intel, consider whether listings should be **owned objects** with a separate shared registry, or whether the `Marketplace` itself is the single shared object with listings as dynamic fields.

**PTB composability**: The receipt-based purchase pattern is critical. Without it, buyers can't batch-purchase intel from multiple scouts in a single transaction — a key UX advantage on SUI that judges will look for.

---

## Open Questions

1. **EVE Frontier's token contract on SUI** — Need to identify the exact token type/module to integrate payment. May need to use a placeholder token for testnet.
2. **Star map data source** — Does EVE Frontier expose system coordinates via API for the heat map? Or do we need to scrape/derive from Atlas?
3. **Tribe membership on-chain** — How are tribes/alliances represented on SUI? Needed for tribe-tier Seal policies.
4. **Seal documentation maturity** — The playbook notes Seal docs are newer. Need to spike the conditional access policy API early in week 1.
5. **Dispute quorum** — How many validators needed to resolve a dispute? Fixed number? Percentage of recent buyers? Needs game theory analysis.
6. **Smart Assembly deployment** — Which type of Smart Assembly hosts the marketplace? SSU seems natural (it holds items), but the "items" here are intel listing references, not physical goods.
7. **Shared object topology** — Should each `IntelListing` be its own shared object, or should a single shared `Marketplace` hold listings as dynamic fields? Tradeoff: independent shared objects parallelize better but add per-listing overhead; a single shared object simplifies queries but creates contention on popular systems.

---

## Why This Wins

- **SUI-native showcase**: Seal + Walrus are unique to SUI — no other chain can do this. Judges from Mysten Labs will notice.
- **Emergent gameplay**: Counter-intelligence, scout guilds, information brokers, double agents selling false data — all emerge naturally from the mechanics.
- **Community votes**: The heat map is instantly shareable and visually memorable. Players will want to use it during the judging period.
- **EVE DNA**: Information asymmetry is core to EVE's identity. This tool doesn't fight the game design — it amplifies it.
- **Technical depth**: Structured schemas + tiered Seal policies + stake-based disputes demonstrate serious smart contract engineering, not just a wrapper around an API.

---

## Next Step

Run `/workflows:plan` to decompose into an implementation plan with file-level detail.

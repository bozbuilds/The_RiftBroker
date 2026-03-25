---
date: 2026-03-13
updated: 2026-03-25
topic: zk-scout-reputation
---

# ZK Phase 4 — Scout Reputation via Merkle History

## What We're Building

A reputation system where scouts accumulate a cryptographic track record of verified observations. Each verified listing adds a leaf to the scout's personal Merkle tree. Scouts can selectively reveal past attestations to build buyer trust — without exposing their full operational history. Buyers check a scout's verification rate and history before purchasing.

This is the capstone: Phases 1–3 verify individual listings, Phase 5 binds proofs to on-chain events, Stackable Badges attest individual actions. Phase 4 verifies the *scout* — aggregating all of that into a persistent reputation.

## Why Merkle Trees (Not Simple Counters)

A naive reputation system would just count verified listings: "Scout X has 47 verified reports." But that reveals too much:

- How many systems they operate in (operational footprint)
- How frequently they scout (activity patterns)
- Which intel types they specialize in (predictable behavior)

A Merkle tree approach lets the scout prove specific claims without revealing the full picture:
- "I have at least 10 verified fleet reports" — without revealing the other 37
- "My last 5 reports were all verified" — without revealing the ones that weren't
- "I've been active for 3+ months" — without revealing exact dates

The ZK repo's Poseidon-based Merkle tree implementation is exactly this pattern. The `MerkleMultiProof` struct supports selective revelation of arbitrary leaf subsets.

## How It Works

### On-Chain: Scout Attestation Registry

Each scout gets a shared object tracking their verification history:

```move
public struct ScoutProfile has key {
    id: UID,
    scout: address,
    merkle_root: vector<u8>,        // Root of all verified listing hashes
    leaf_count: u64,                 // Total Merkle leaves
    // ── Per-badge-type counters ──
    total_zk_verified: u64,          // Basic ZK location proofs (Phase 1)
    total_presence_verified: u64,    // On-chain event-backed ZK proofs (Phase 5)
    total_combat_verified: u64,      // KillmailCreatedEvent badges
    total_activity_verified: u64,    // ItemDepositedEvent badges
    total_structure_verified: u64,   // LocationRevealedEvent badges
    total_unverified: u64,           // Plain listings with no verification
    first_verified_at: u64,          // Timestamp of first verified listing
    last_verified_at: u64,           // Timestamp of most recent
}
```

**Why per-badge counters instead of a flat `total_verified`?**
- The trust hierarchy (Combat > Presence > Activity > Structure > Proximity > ZK-Verified) means not all verifications are equal
- Per-badge counters let buyers see *how* a scout proves their intel, not just *that* they do
- A scout with 20 Combat Verified listings is a very different signal than one with 20 Structure Verified
- Counters are cheap to query and sufficient for basic reputation display
- The Merkle root enables ZK proofs about the *content* of the history (Phase 4b — see below)

### Automatic Updates

All verified listing creation paths update the scout's profile:

1. **`create_verified_listing`** (Phase 1 — basic ZK location proof):
   - Looks up or creates the scout's `ScoutProfile`
   - Hashes the listing's verification data (proof hash + system + type + timestamp)
   - Appends the leaf to the Merkle tree (new root computed)
   - Increments `total_zk_verified`

2. **`create_presence_verified_listing`** (Phase 5 — on-chain event-backed ZK):
   - Same Merkle tree update as above
   - Increments `total_presence_verified`

3. **`attach_event_badge`** (Stackable Badges — combat/activity/structure):
   - Appends a badge-specific leaf to the Merkle tree
   - Increments the corresponding counter (`total_combat_verified`, `total_activity_verified`, or `total_structure_verified`)
   - A single listing can trigger multiple badge counter increments

4. **`create_listing`** (unverified):
   - Only increments `total_unverified`
   - No Merkle tree update (nothing to prove about unverified listings)

### Frontend: Reputation Display

Scout profiles are visible from listing cards in the ListingBrowser:

```
FLEET  COMBAT VERIFIED  ACTIVITY VERIFIED
— K4T-Y (28 systems) | 0x42a0...769b • Scout: 12 combat, 8 presence (87% verified) • Active 2mo
```

Clicking the scout address opens a profile panel showing:
- Per-badge verification counts (aligned with the trust hierarchy from `badge-verify.ts`)
- Overall verification rate (all verified types / total listings)
- Activity timeline (first/last verified dates)
- Verified listing count by intel type (derived from events, not Merkle tree)
- Threshold badges: bronze (10+), silver (50+), gold (100+) total verified

### Integration with Trust Hierarchy

The existing `BADGE_TRUST_ORDER` from `badge-verify.ts` applies to scout reputation display:

```
Combat > Presence > Activity > Structure > Proximity > ZK-Verified
```

When displaying scout reputation inline, show the *highest* trust level the scout has earned, with a count:
- "12× Combat Verified" (scout has 12 listings with killmail badges)
- Falls back to next tier if no combat: "8× Presence Verified"
- Unverified scouts show nothing (no badge, just address)

## Key Decisions

### 1. On-chain Merkle tree vs. off-chain with on-chain root

**Option A: Full on-chain Merkle tree** — Store all leaves in a `Table<u64, vector<u8>>`. Contract computes new root on each insert. Pro: fully trustless. Con: O(log n) Poseidon hashes per insertion (gas cost grows with history).

**Option B: Off-chain tree, on-chain root only** — Scout maintains their own Merkle tree client-side. Contract stores only the root. Scout submits inclusion proofs when claiming reputation. Pro: O(1) on-chain storage. Con: scout must maintain state.

**Decision: Option A for the PoC.** The on-chain Poseidon costs are manageable for PoC scale (hundreds of listings, not millions). The ZK repo already demonstrates on-chain Poseidon via `sui::poseidon::poseidon_bn254`. For production scale, migrate to Option B.

### 2. Reputation badges are non-transferable

`ScoutProfile` has `key` only (no `store`), like `PurchaseReceipt`. Reputation is soulbound to the scout address. Cannot be sold, gifted, or transferred.

### 3. Reputation doesn't affect pricing

The contract does NOT enforce "verified scouts can charge more" or "unverified scouts are capped." Pricing is market-driven. Reputation is information that helps buyers make decisions — not a contract-enforced mechanic.

**Rationale:** Hard-coding reputation into pricing creates perverse incentives (scouts gaming the system to hit thresholds). Letting the market price reputation naturally is more robust.

### 4. No reputation slashing (yet)

Phase 4 does NOT include negative reputation or dispute resolution. If a buyer thinks intel was bad, they... don't buy from that scout again. The per-badge verification rate is the signal.

Slashing requires a dispute resolution mechanism (who judges? how?) that's a significant design problem on its own. Deferred to a future dispute system phase.

### 5. Profile creation is implicit

No "register as scout" step. The `ScoutProfile` is created automatically on first verified listing creation or badge attachment. Reduces friction.

## Phase 4b (Future): ZK Reputation Claims

Once scouts have Merkle histories, they can generate ZK proofs about their history:

- "I have 10+ verified fleet reports" → Merkle inclusion proof for 10 fleet-type leaves
- "I've reported in 5+ different regions" → Prove 5 leaves with distinct system IDs
- "All my reports in the last month were verified" → Temporal range proof
- "I have 5+ Combat Verified badges" → Prove 5 combat-type leaves without revealing the rest

This uses the same Groth16 pattern but with a new "reputation circuit" that operates on the scout's Merkle tree. This is the most technically ambitious part and is intentionally separated as 4b — the basic counter/rate reputation (4a) ships first and provides most of the value.

## Contract Changes

```move
// New shared object
public struct ScoutProfile has key {
    id: UID,
    scout: address,
    merkle_root: vector<u8>,
    leaf_count: u64,
    total_zk_verified: u64,
    total_presence_verified: u64,
    total_combat_verified: u64,
    total_activity_verified: u64,
    total_structure_verified: u64,
    total_unverified: u64,
    first_verified_at: u64,
    last_verified_at: u64,
}

// New event
public struct ScoutVerified has copy, drop {
    scout: address,
    listing_id: ID,
    badge_type: u8,           // 0xFF = ZK-verified, 0xFE = presence, 0-2 = event badge types
    total_for_type: u64,      // Running count for this badge type
}

// Automatic profile updates in:
//   - create_verified_listing (Phase 1)
//   - create_presence_verified_listing (Phase 5)
//   - attach_event_badge (Stackable Badges)
//   - create_listing (unverified count only)
// New getter: scout_profile(scout: address) -> &ScoutProfile
```

The `ScoutProfile` is a shared object so anyone can read it (buyers checking scout reputation). Only the contract's listing creation and badge attachment functions update it.

## Frontend Changes

### Scout reputation badge on listing cards
- Inline: highest badge type + count, e.g. "12× Combat Verified"
- Threshold badges: bronze (10+), silver (50+), gold (100+) total verified
- Styled consistently with existing badge classes from `badge-verify.ts`

### Scout profile panel
- Triggered by clicking scout address on any listing in ListingBrowser
- Per-badge-type breakdown (aligned with trust hierarchy)
- Overall verification rate
- "Active since" date
- Activity timeline (first/last verified dates)

### Browse filter
- "Verified scouts only" toggle (scouts with 5+ verified listings of any type)
- Sort by scout reputation (total verified count or verification rate)

### Scout dashboard (in "My Listings" tab)
- Own reputation stats and per-badge breakdown
- Verification rate
- Suggestion: "Attach a Combat badge to your next listing to build your reputation"

## Open Questions

1. **Merkle tree depth**: What's the maximum number of leaves we support? Depth 10 = 1,024 listings. Depth 16 = 65,536. Deeper = more gas per insert. For PoC, depth 10 seems sufficient. Note: event badges add leaves too, so a heavily-badged scout accumulates leaves faster than one verification per listing.

2. **Profile lookup**: How does a buyer find a scout's `ScoutProfile`? Options: (a) dynamic field on a global registry keyed by scout address, (b) event-based discovery, (c) off-chain indexer. Option (a) is simplest and fully on-chain.

3. **Multi-address scouts**: A scout could create fresh addresses to reset bad reputation. This is inherent to pseudonymous systems. The defense is that new addresses have no reputation either — buyers naturally prefer scouts with established track records.

4. **Profile migration**: If a scout wants to move to a new address, can they transfer their reputation? Given the soulbound design (key-only), no. This is intentional — reputation must be earned per address.

5. **Gas optimization**: On-chain Poseidon for every listing creation and badge attachment adds gas. How much? Need to benchmark `poseidon_bn254` cost on SUI testnet. If prohibitive, switch to Option B (off-chain tree).

6. **Badge weighting**: Should Combat Verified count more toward reputation than Structure Verified? The trust hierarchy implies relative weight, but the PoC can start with equal weight (1 leaf per event) and let buyers interpret the per-badge counters themselves.

## Dependencies

All prerequisites are complete:

- **Phase 1** (verified listings) — complete. Provides `create_verified_listing` and the `isVerified` concept.
- **Phase 2** (distance proofs) — complete. Distance-verified listings count toward reputation via the location proof path.
- **Phase 3** (timestamps) — complete. Provides `observed_at` for accurate `first_verified_at` / `last_verified_at`.
- **Phase 5** (on-chain presence proofs) — complete. Provides `create_presence_verified_listing` with event-backed trust.
- **Stackable Event Badges** — complete. Provides `attach_event_badge` with combat/activity/structure badge types.

Phase 4 is unblocked. All upstream verification infrastructure is in place.

## Next Steps

Implementation order: basic `ScoutProfile` with per-badge counters first (4a), Merkle tree second (4a+), ZK reputation claims last (4b). Each sub-phase is independently useful.

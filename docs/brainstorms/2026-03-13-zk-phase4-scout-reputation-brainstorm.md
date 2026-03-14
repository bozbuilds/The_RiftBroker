---
date: 2026-03-13
topic: zk-scout-reputation
---

# ZK Phase 4 — Scout Reputation via Merkle History

## What We're Building

A reputation system where scouts accumulate a cryptographic track record of verified observations. Each verified listing adds a leaf to the scout's personal Merkle tree. Scouts can selectively reveal past attestations to build buyer trust — without exposing their full operational history. Buyers check a scout's verification rate and history before purchasing.

This is the capstone: Phases 1-3 verify individual listings. Phase 4 verifies the *scout*.

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
    merkle_root: vector<u8>,    // Root of all verified listing hashes
    total_verified: u64,         // Count of verified listings
    total_unverified: u64,       // Count of unverified listings
    first_verified_at: u64,      // Timestamp of first verified listing
    last_verified_at: u64,       // Timestamp of most recent
}
```

**Why both Merkle root AND counters?**
- Counters are cheap to query and sufficient for basic reputation display
- The Merkle root enables ZK proofs about the *content* of the history (Phase 4b — see below)
- Counters alone can't prove claims like "my last 5 reports covered 5 different regions"

### Automatic Updates

When `create_verified_listing` succeeds (Phase 1), the contract also:
1. Looks up or creates the scout's `ScoutProfile`
2. Hashes the listing's verification data (proof hash + system + type + timestamp)
3. Appends the leaf to the Merkle tree (new root computed)
4. Increments `total_verified`

When `create_listing` (unverified) is called:
1. Only increments `total_unverified`
2. No Merkle tree update (nothing to prove about unverified listings)

### Frontend: Reputation Display

Scout profiles are visible from listing cards:

```
Fleet Movement • Zarzakh Region • Observed 2h ago ✓
Scout: 0x42a0...769b • 47 verified (93% rate) • Active 3mo
```

Clicking the scout address opens a profile panel showing:
- Verification rate (verified / total)
- Activity timeline (first/last verified dates)
- Verified listing count by intel type (derived from events, not Merkle tree)
- "ZK-Verified Scout" badge at thresholds (10+, 50+, 100+ verified)

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

Phase 4 does NOT include negative reputation or dispute resolution. If a buyer thinks intel was bad, they... don't buy from that scout again. The verification rate (verified vs. unverified) is the signal.

Slashing requires a dispute resolution mechanism (who judges? how?) that's a significant design problem on its own. Deferred to a potential Phase 5.

### 5. Profile creation is implicit

No "register as scout" step. The `ScoutProfile` is created automatically on first `create_verified_listing` call. Reduces friction.

## Phase 4b (Future): ZK Reputation Claims

Once scouts have Merkle histories, they can generate ZK proofs about their history:

- "I have 10+ verified fleet reports" → Merkle inclusion proof for 10 fleet-type leaves
- "I've reported in 5+ different regions" → Prove 5 leaves with distinct system IDs
- "All my reports in the last month were verified" → Temporal range proof

This uses the same Groth16 pattern but with a new "reputation circuit" that operates on the scout's Merkle tree. This is the most technically ambitious part and is intentionally separated as 4b — the basic counter/rate reputation (4a) ships first and provides most of the value.

## Contract Changes

```move
// New shared object
public struct ScoutProfile has key {
    id: UID,
    scout: address,
    merkle_root: vector<u8>,
    leaf_count: u64,
    total_verified: u64,
    total_unverified: u64,
    first_verified_at: u64,
    last_verified_at: u64,
}

// New event
public struct ScoutVerified has copy, drop {
    scout: address,
    listing_id: ID,
    total_verified: u64,
}

// Automatic profile updates in create_verified_listing and create_listing
// New getter: scout_profile(scout: address) -> &ScoutProfile
```

The `ScoutProfile` is a shared object so anyone can read it (buyers checking scout reputation). Only the contract's listing creation functions update it.

## Frontend Changes

### Scout reputation badge on listing cards
- Minimal: "47 verified (93%)" inline text
- Threshold badges: bronze (10+), silver (50+), gold (100+)
- Tooltip on hover shows full profile summary

### Scout profile panel
- Triggered by clicking scout address on any listing
- Shows verification history timeline
- Breakdown by intel type
- "Active since" date
- Verification rate chart (simple bar)

### Browse filter
- "Verified scouts only" toggle (scouts with 5+ verified listings)
- Sort by scout reputation (verification rate)

### Scout dashboard (in "My Intel" tab)
- Own reputation stats
- Verification rate over time
- Suggestion: "Verify your next listing to improve your rating"

## Open Questions

1. **Merkle tree depth**: What's the maximum number of leaves we support? Depth 10 = 1,024 listings. Depth 16 = 65,536. Deeper = more gas per insert. For PoC, depth 10 seems sufficient.

2. **Profile lookup**: How does a buyer find a scout's `ScoutProfile`? Options: (a) dynamic field on a global registry keyed by scout address, (b) event-based discovery, (c) off-chain indexer. Option (a) is simplest and fully on-chain.

3. **Multi-address scouts**: A scout could create fresh addresses to reset bad reputation. This is inherent to pseudonymous systems. The defense is that new addresses have no reputation either — buyers naturally prefer scouts with established track records.

4. **Profile migration**: If a scout wants to move to a new address, can they transfer their reputation? Given the soulbound design (key-only), no. This is intentional — reputation must be earned per address.

5. **Gas optimization**: On-chain Poseidon for every listing creation adds gas. How much? Need to benchmark `poseidon_bn254` cost on SUI testnet. If prohibitive, switch to Option B (off-chain tree).

## Dependencies

- Phase 1 (verified listings) — required for the "verified" concept to exist
- Phase 3 (timestamps) — optional but enhances profile with `first_verified_at` / `last_verified_at` accuracy
- Phase 2 (distance) — independent, but distance-verified listings should also count toward reputation

## Next Steps

Implementation order: basic `ScoutProfile` with counters first (4a), Merkle tree second (4a+), ZK reputation claims last (4b). Each sub-phase is independently useful.

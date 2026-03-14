---
date: 2026-03-13
topic: zk-timestamp-bound-freshness
---

# ZK Phase 3 — Timestamp-Bound Freshness

## What We're Building

Intel freshness backed by cryptographic timestamps instead of self-reported creation times. When a scout submits a ZK-verified listing, the proof binds the observation to a specific timestamp that cannot be forged. The marketplace's `decay_hours` mechanic then operates on *observation time*, not *listing time* — eliminating the stale-intel-sold-as-fresh exploit.

## The Problem Today

Current flow:
1. Scout observes fleet at system X on Monday
2. Scout creates listing on Wednesday
3. `created_at` = Wednesday (when the tx hit the chain)
4. Buyer sees "2 hours old" — but the observation is actually 2 days old
5. Decay clock started at the wrong time

The scout isn't necessarily malicious — maybe they were offline, or waiting for the right price. But the buyer has no way to distinguish fresh observation from repackaged stale data.

## How ZK Timestamps Fix This

The location attestation circuit already includes a `timestampWitness` as a private input. It's hashed into the Merkle root alongside the coordinates. The distance circuit outputs `maxTimestamp` as a public output.

**Key insight from the ZK repo:** POD attestations include timestamp fields that are cryptographically bound to the proof. The on-chain contract enforces "staleness requirements" — rejecting proofs where the timestamp is too old.

We adapt this pattern:

1. Scout generates location proof → timestamp is baked into the Merkle root
2. Scout submits listing → contract extracts timestamp from proof's public data
3. Contract sets `observed_at` = proof timestamp (in addition to `created_at` = chain time)
4. Decay clock runs from `observed_at`, not `created_at`
5. Frontend displays both: "Observed 2h ago, listed 30min ago"

## Key Decisions

### 1. Dual timestamp model

```move
/// Existing field (unchanged):
created_at: u64,        // When the listing tx executed (chain clock)

/// New field (Phase 3):
observed_at: u64,       // When the scout made the observation (from ZK proof)
                        // Equal to created_at for unverified listings
```

For unverified listings, `observed_at == created_at` (no proof to extract from). For verified listings, `observed_at` comes from the proof's Merkle-bound timestamp.

**Decay calculation changes from:**
```
expired = now >= created_at + decay_hours * 3_600_000
```
**To:**
```
expired = now >= observed_at + decay_hours * 3_600_000
```

This is a breaking change to the decay semantic, but it's the *correct* semantic. Unverified listings behave identically (observed_at == created_at). Verified listings decay from observation time.

### 2. Staleness cap on proof submission

A scout shouldn't be able to submit a 3-month-old observation as a new listing (even if the proof is valid). Contract enforces a maximum gap between observation time and listing time:

```move
const MAX_OBSERVATION_AGE_MS: u64 = 86_400_000; // 24 hours

assert!(
    clock.timestamp_ms() - observed_at <= MAX_OBSERVATION_AGE_MS,
    EObservationTooStale,
);
```

This prevents proof hoarding. A scout has 24 hours to monetize an observation before the proof becomes too old to list. Tunable constant — could be 48h, 72h, or configurable per intel type.

### 3. Timestamp display in the frontend

Current listing card shows:
```
Fleet Movement • Zarzakh Region • 2h ago
```

After Phase 3, verified listings show:
```
Fleet Movement • Zarzakh Region • Observed 4h ago ✓ • Listed 1h ago
```

The "Observed X ago" with checkmark is the ZK-verified timestamp. "Listed X ago" is the chain timestamp. Unverified listings show only "Listed X ago" (no change).

### 4. Timestamp extraction from existing circuit

The location circuit's Merkle root includes the timestamp as a leaf (index 4 in the 8-leaf tree). After Groth16 verification, we need to extract it.

**Option A: Extract from Merkle proof on-chain** — The ZK repo's `location_attestation.move` already demonstrates this pattern. After proof verification, it reconstructs the Merkle proof and reads the timestamp leaf. We adapt this logic.

**Option B: Pass timestamp as an additional public input** — Simpler but requires circuit modification. Since we're reusing the existing circuit, Option A is preferred.

**Decision: Option A** — extract timestamp from the verified Merkle proof data, matching the ZK repo's pattern.

## Contract Changes

Additive to Phase 1:

```move
// New error constant
const EObservationTooStale: u64 = 10;

// New constant
const MAX_OBSERVATION_AGE_MS: u64 = 86_400_000; // 24h

// create_verified_listing gains:
// 1. Extract timestamp from verified proof public data
// 2. Assert timestamp is within MAX_OBSERVATION_AGE_MS of current chain time
// 3. Set observed_at = extracted timestamp
```

The `is_expired` getter changes:
```move
public fun is_expired(listing: &IntelListing, clock: &Clock): bool {
    clock.timestamp_ms() >= listing.observed_at + listing.decay_hours * 3_600_000
}
```

## Frontend Changes

- Listing cards: dual timestamp display for verified intel
- ListingBrowser: "freshness" sort option (sort by observed_at for verified, created_at for unverified)
- HeatMap: freshness glow uses `observed_at` for verified intel (more accurate heat)
- CreateListing: timestamp shown during proof generation ("Observation timestamp: 2026-03-13 14:32 UTC")

## Interaction with Phase 2

The distance circuit outputs `maxTimestamp` — the more recent of the two observation timestamps. For distance-proven intel, `observed_at` = `maxTimestamp` from the distance proof. This is naturally correct: the intel is as fresh as the most recent observation involved.

## Open Questions

1. **Clock skew**: The ZK proof timestamp comes from the scout's client. The chain clock is the SUI validator consensus time. How much skew do we tolerate? The 24h staleness cap makes minor skew irrelevant, but should we reject future timestamps (`observed_at > chain_time`)?

2. **Staleness cap per intel type**: Should resource deposits (which change slowly) have a longer observation window than fleet movements (which change rapidly)? e.g., 72h for resources, 6h for fleets. Or keep it simple with one constant.

3. **Contract upgrade path**: This changes the `is_expired` semantic. Since the contract is already deployed, this requires a package upgrade. The `observed_at` field must be added to `IntelListing` — existing listings would need a migration strategy or a V2 listing type.

## Next Steps

Implementation depends on Phase 1 (verified listings) being deployed first. The timestamp extraction builds directly on the location proof verification flow.

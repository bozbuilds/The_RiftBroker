---
date: 2026-03-13
topic: zk-proximity-proven-intel
---

# ZK Phase 2 — Proximity-Proven Fleet Intel

## What We're Building

A new verification tier for fleet movement and base structure intel: scouts prove that two entities (e.g., a fleet and a gate, or two ships) were within a certain distance of each other — without revealing where either one actually is. This transforms "I saw ships near the gate" from a trust-me claim into a cryptographic fact.

Builds on Phase 1 (verified scout presence). Requires two location attestations as prerequisites, then layers a distance proof on top.

## Why This Matters

Phase 1 proves "the scout was there." Phase 2 proves "these two things were near each other." The combination is dramatically more valuable for fleet intel and base structure intel:

- **Fleet movement**: "A 50-ship fleet was within 500km of the Zarzakh gate" — provable, not claimable
- **Base structures**: "An SSU was deployed within scanning range of this route" — buyers know the intel is geometrically real
- **Ambush corridors**: Distance between two gates proves a chokepoint exists

The ZK repo's distance circuit (~1,010 constraints, ~250ms proof generation) is even lighter than the location circuit, making this practical for browser-based proof generation.

## How the Distance Circuit Works

From the ZK repo's `distance-attestation.circom`:

**Public inputs (5):**
- `locationMerkleRoot1`, `locationMerkleRoot2` — binding to two location proofs
- `coordinatesHash1`, `coordinatesHash2` — Poseidon hashes of each coordinate set
- `distanceSquaredMeters` — the claimed distance

**Public output (1):**
- `maxTimestamp` — max of the two observation timestamps

**Private inputs (witness):**
- Coordinates + salt for both locations (`x1,y1,z1,salt1`, `x2,y2,z2,salt2`)
- Timestamps and location values for verification

**Distance calculation:** Manhattan distance (|dx| + |dy| + |dz|), squared. Uses `AbsDiff` helper template with `LessThan` + `Mux1` for unsigned comparison in-circuit.

The circuit verifies that both coordinate hashes match, both Merkle roots match, and the computed distance equals the claimed value. No coordinates leave the browser.

## Key Decisions

### 1. Distance proof as an intel payload enhancement, not a new listing type

Rather than creating a fifth `intel_type`, distance proofs attach to existing fleet (type 1) and base (type 2) listings as supplementary verification. The `IntelListing` gains an optional `distance_proof_hash` alongside the Phase 1 `location_proof_hash`.

**Rationale:** A fleet movement listing is still a fleet movement listing. The distance proof adds *credibility*, not a new category. Keeps the type system clean and backward-compatible.

### 2. Two-proof prerequisite

The distance circuit requires two location attestations as inputs (their Merkle roots and coordinate hashes). In our context:

- **Proof A**: Scout's own location (Phase 1 — "I was here")
- **Proof B**: Observed entity's location ("the fleet was there")

Both proofs are generated client-side in sequence. The scout needs coordinates for both positions — their own (from game client/API) and the observed target (from scanning/observation).

### 3. Distance thresholds are metadata, not enforced on-chain

The contract verifies the Groth16 proof is valid (the distance computation is correct), but does NOT enforce "distance must be less than X." Threshold interpretation is a frontend/buyer concern:

- Frontend displays: "Verified: 2 entities within 847km"
- Buyers decide if that distance is meaningful for their use case
- Different intel types have different relevant distance scales

This avoids baking game-specific constants into an immutable contract.

### 4. Timestamp binding via maxTimestamp

The distance circuit outputs `maxTimestamp` — the more recent of the two observation timestamps. This provides temporal binding: the distance was measured at a specific time. Combined with Phase 3's timestamp attestations, this prevents scouts from mixing old location data with new observations.

## Contract Changes

```move
/// Extended IntelListing (additive to Phase 1)
/// distance_proof_hash: non-empty if a valid distance proof was verified
/// distance_squared: the proven Manhattan distance squared (from circuit output)
/// observed_entity_hash: Poseidon hash of the observed entity's coordinates
```

New function:

```move
public fun attach_distance_proof(
    listing: &mut IntelListing,
    vkey: &DistanceVKey,
    proof_points_bytes: vector<u8>,
    public_inputs_bytes: vector<u8>,
    ctx: &TxContext,
) {
    // Only scout can attach
    assert!(listing.scout == ctx.sender(), ENotScout);
    // Verify Groth16 distance proof
    // Store distance_proof_hash + distance_squared on listing
}
```

**Design choice: `attach_distance_proof` is separate from `create_verified_listing`.**

A scout might create a location-verified listing first, then add the distance proof later (or vice versa). Keeping them independent avoids a combinatorial explosion of creation functions and lets scouts incrementally add verification to listings.

## Frontend Changes

- Distance proof generation added to CreateListing as a second optional step
- Listing cards show distance badge: "Verified: within 847km" (derived from `distance_squared`)
- IntelViewer shows a distance visualization for proximity-proven intel
- The proof generation flow: location proof first → distance proof second → submit both

## Open Questions

1. **Observed entity coordinates**: Where does the scout get the target's coordinates? In EVE Frontier, scanning/dscan provides approximate positions. Do we need to account for coordinate imprecision in the circuit, or is exact position acceptable for the PoC?

2. **Single transaction or two?**: Should both proofs (location + distance) be submitted in one PTB, or can the distance proof be attached after listing creation? PTB composability suggests doing it atomically when both are ready.

3. **Distance unit display**: The circuit computes Manhattan distance squared in EVE meters. Frontend needs to convert to human-readable units (km, AU). What's the canonical conversion factor?

4. **Circuit artifact hosting**: Same `.wasm`/`.zkey` question as Phase 1, but now with two circuits to host.

## Next Steps

Depends on Phase 1 being implemented first — distance proofs reference location attestation data.

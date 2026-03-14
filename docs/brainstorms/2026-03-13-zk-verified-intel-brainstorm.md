---
date: 2026-03-13
topic: zk-verified-intel
---

# ZK-Verified Intel — Phase 1

## What We're Building

Scouts can optionally attach a ZK location proof when creating an intel listing, proving they were physically present in the system they claim to report on — without revealing their exact coordinates. Verified listings get a cryptographic badge that buyers can trust. This eliminates the core trust gap in the marketplace: "was the scout actually there?"

Based on CCP's [eve-frontier-proximity-zk-poc](https://github.com/evefrontier/eve-frontier-proximity-zk-poc) — an official Groth16 + Poseidon circuit system for privacy-preserving location attestation on SUI.

## Why This Approach

The ZK repo provides three things we need:

1. **Location attestation circuit** (~2,359 constraints, ~320ms proof generation) — proves "I was at coordinates (x,y,z)" without revealing them. Uses Poseidon hashing for in-circuit efficiency. Public outputs: merkle root, coordinates hash, signature+key hash.

2. **On-chain Groth16 verification** — SUI has native `sui::groth16` support. The ZK repo demonstrates the exact call sequence: `prepare_verifying_key` → `proof_points_from_bytes` → `public_proof_inputs_from_bytes` → `verify_groth16_proof` on BN254 curve.

3. **Coordinate binding via Poseidon hash** — the proof outputs a `coordinates_hash = Poseidon(x, y, z, salt)`. We can compare this against a known hash of the claimed system's coordinates to verify the scout was in the right system.

Alternative approaches considered and rejected:
- **Trusted oracle**: Centralized, defeats the point of a decentralized marketplace
- **Reputation-only**: Doesn't prevent fraud, just penalizes it after the fact
- **Client-side verification**: Not trustworthy — proofs must be verified on-chain

## Key Decisions

### 1. Verification is optional (not mandatory)

Scouts can still create unverified listings. Market dynamics handle the rest — verified listings command higher prices and buyer trust. This avoids blocking non-ZK-capable scouts and keeps the creation flow simple.

**Contract**: `create_listing` stays as-is. New function `create_verified_listing` accepts proof data. Both produce `IntelListing` objects — verified ones have a `location_proof_hash` field set.

### 2. System coordinate validation approach

The circuit proves the scout knows coordinates that hash to `coordinates_hash`. We need to verify this matches the `system_id` the scout claims.

**Two options:**

**(A) On-chain coordinate registry** — Store known system coordinates on-chain in a lookup table. Contract checks `Poseidon(system_coords, salt) == proof.coordinates_hash`. Fully trustless.

**(B) Off-chain coordinate check, on-chain proof** — Store the Groth16 proof verification on-chain (scout was *somewhere* real) but let the frontend cross-reference the coordinates hash against known galaxy data. Simpler contract, slightly weaker guarantee.

**Decision: Start with (B), upgrade to (A) if needed.** The Groth16 proof itself is the hard part and the strongest signal. The frontend can display "ZK-verified location" for listings where the proof checks out. A future contract upgrade can add the coordinate registry for full trustlessness.

### 3. Circuit reuse vs. custom circuit

The ZK repo's location attestation circuit is designed for EVE Frontier's coordinate system. It takes (x, y, z, salt) as private inputs and outputs a Poseidon hash. This maps directly to our `system_id` → coordinate lookup.

**Decision: Reuse the existing circuit as-is.** No custom circuit work needed. We need:
- The compiled circuit artifacts (`.wasm`, `.zkey`)
- The verification key (serialized for SUI's `groth16::prepare_verifying_key`)
- Client-side proof generation using `snarkjs`

### 4. What gets stored on-chain

The `IntelListing` gains one new optional field:

```move
/// Poseidon hash of the ZK proof's public inputs, or empty if unverified.
/// Non-empty means Groth16 verification passed at creation time.
location_proof_hash: vector<u8>,
```

We do NOT store the full proof on-chain (it's large and unnecessary after verification). The hash serves as a receipt: "a valid proof was verified when this listing was created."

### 5. Client-side proof generation flow

Scout creates a verified listing:
1. Scout selects system → frontend looks up (x, y, z) coordinates
2. Frontend generates random salt
3. Frontend runs `snarkjs.groth16.fullProve()` with private inputs (coords + salt)
4. Frontend sends proof + public inputs in the `create_verified_listing` transaction
5. Contract verifies Groth16 proof on-chain → sets `location_proof_hash`
6. Listing appears with "ZK-Verified" badge

Proof generation (~320ms) happens client-side before transaction submission. No additional user interaction beyond clicking "Create Verified Listing."

## Contract Changes

### New dependencies

```toml
# Move.toml — no new deps needed
# sui::groth16 and sui::poseidon are built into the SUI framework
```

### New storage

```move
/// Verification key for the location attestation circuit.
/// Shared object created once at package publish via init().
public struct LocationVKey has key {
    id: UID,
    vkey_bytes: vector<u8>,
}
```

### New function

```move
public fun create_verified_listing(
    // ... same params as create_listing ...
    vkey: &LocationVKey,
    proof_points_bytes: vector<u8>,
    public_inputs_bytes: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    // 1. Verify Groth16 proof
    let pvk = groth16::prepare_verifying_key(&groth16::bn254(), &vkey.vkey_bytes);
    let public_inputs = groth16::public_proof_inputs_from_bytes(public_inputs_bytes);
    let proof_points = groth16::proof_points_from_bytes(proof_points_bytes);
    assert!(
        groth16::verify_groth16_proof(&groth16::bn254(), &pvk, &public_inputs, &proof_points),
        EInvalidLocationProof,
    );

    // 2. Hash the public inputs as a verification receipt
    let location_proof_hash = /* poseidon or sha256 of public_inputs_bytes */;

    // 3. Create listing with proof hash set
    // ... (same as create_listing but with location_proof_hash populated)
}
```

### Frontend changes

- New `snarkjs` dependency for client-side proof generation
- "Verify Location" toggle on CreateListing form
- "ZK-Verified" badge component on listing cards
- Filter: "Verified only" toggle in browse view

## New Dependencies

| Dependency | Purpose | Size Impact |
|------------|---------|-------------|
| `snarkjs` | Client-side Groth16 proof generation | ~2MB (tree-shakeable) |
| Circuit `.wasm` | Compiled circuit for browser | ~200KB |
| Circuit `.zkey` | Proving key | ~500KB-2MB (loaded on demand) |

All circuit artifacts loaded lazily — only when scout clicks "Verify Location."

## Open Questions

1. **Circuit artifacts hosting**: Where to host `.wasm` and `.zkey` files? Options: bundled in frontend, hosted on Walrus, or fetched from a CDN. Walrus feels thematic.

2. **Coordinate source**: EVE Frontier's ~100K system coordinates — do we use the galaxy JSON we already load, or does the ZK repo have a canonical coordinate set?

3. **Verification key deployment**: The vkey is ~1KB. Deploy as a shared object at package init, or pass as a constant? Shared object is more upgradeable.

4. **Salt management**: The salt prevents brute-force coordinate recovery. Should we store it client-side (localStorage) so the scout can re-prove later, or is it single-use?

## Next Steps

-> `/workflows:plan` for implementation details — contract changes, circuit integration, frontend proof generation flow

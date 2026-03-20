# ZK Phase 5: On-Chain Verified Intel — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the self-signed galaxy.json trust model with on-chain SUI events — scouts prove system presence via `JumpEvent` and structure proximity via `LocationRevealedEvent`, verified through a single unified ZK proof.

**Architecture:** A new "presence-attestation" circuit replaces both the location-attestation and distance-attestation circuits. It takes on-chain event data as private inputs, verifies coordinates against the on-chain `location_hash` (Poseidon), computes Manhattan distance, and outputs distance + timestamp as public signals. The contract verifies one Groth16 proof and stores the JumpEvent transaction digest for auditability. The frontend queries SUI events via `suix_queryEvents` (no auth needed) to source proof inputs.

**Tech Stack:** circom 2.2+, snarkjs 0.7.6, Move (SUI edition 2024), TypeScript/React, Vitest 4, SUI JSON-RPC (`suix_queryEvents`)

**Spec:** `docs/brainstorms/2026-03-20-zk-phase4-onchain-verified-intel-brainstorm.md`

---

## Design Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Trust anchor | SUI on-chain events (not PODs) | PODs require legacy REST API + auth. On-chain events are public, permanent, no auth. Blockchain immutability > EdDSA signatures. |
| Trust binding | Location hash verification + tx digest audit trail | Circuit verifies `Poseidon(coords) == location_hash`. Listing stores JumpEvent tx digest. Two-layer: cryptographic + auditable. |
| Circuit architecture | Single unified circuit (replaces location + distance) | Scout knows both positions from on-chain events. One proof for presence + proximity is simpler than two-step flow. |
| Scout position | Gate coordinates from LocationRevealedEvent | Gate = entry point to system. Best available on-chain position data. More precise than system centroid. |
| Timestamp source | JumpEvent block timestamp | CCP-determined time (not `Date.now()`). Feeds into existing Phase 3 `observed_at` + staleness validation. |
| Public signal count | 5 total: 2 outputs (distance, timestamp) + 3 inputs (coordinatesHash, targetHash, locationHash) | 160 bytes. snarkjs orders outputs first: `[distance, timestamp, coordinatesHash, targetHash, locationHash]`. |
| Coordinate handling | Signed decimal strings → BigInt → BN254 field elements | EVE coords are signed i64. Reuse AbsDiff hint pattern from distance-attestation circuit. |
| Galaxy.json | Retained for 3D map/UI, replaced for proof generation | Live SUI queries for proofs. No fallback to galaxy.json — the whole point is replacing self-signed trust. |
| Existing `attach_distance_proof` | Kept in contract (not used by new flow) | Doesn't hurt. Distance is embedded in the unified proof. Old function remains for potential legacy use. |
| Error constants | Use `EInvalidPresenceProof: u64 = 22` (not spec's codes 20-21) | Spec suggested `EInvalidLocationHash` and `EJumpTooOld` but the implementation uses a single error for proof failure (matches existing pattern). Codes 20-21 reserved for future granular errors if needed. |
| Distance output naming | Circuit outputs `distanceSquared` (not `distance`) | Spec table says `distance` but the circuit avoids sqrt by outputting manhattan²  — consistent with existing distance-attestation circuit. Frontend takes sqrt client-side. |
| Phase numbering | This is Phase 5 (original Phase 4 = scout reputation, now Phase 6) | On-chain verification is more foundational and should precede reputation. |
| Location hash compatibility | **RISK:** CCP's `location_hash` may use Poseidon2 (not Poseidon). Need to verify at implementation time. | If hashes don't match, `locationHash` becomes an audit-only public input rather than a cryptographic binding. Circuit structure unchanged either way. |

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `circuits/presence-attestation/presence-attestation.circom` | Create | Unified circuit: location hash binding + distance + timestamp |
| `frontend/public/zk/presence-attestation.wasm` | Create (offline) | Compiled browser WASM |
| `frontend/public/zk/presence-attestation_final.zkey` | Create (offline) | Browser proving key |
| `contracts/sources/marketplace.move` | Modify | Add `jump_tx_digest` field, new error constants, update `create_verified_listing` for 5-signal proof |
| `contracts/tests/marketplace_tests.move` | Modify | Presence proof tests, updated `fake_inputs` (160 bytes) |
| `frontend/src/lib/events.ts` | Create | SUI event query functions (`fetchJumpEvents`, `fetchLocationEvents`) |
| `frontend/src/lib/events.test.ts` | Create | Tests with recorded event fixtures |
| `frontend/src/lib/zk-proof.ts` | Modify | New `generatePresenceProof()`, keep old functions for reference |
| `frontend/src/lib/zk-proof.test.ts` | Modify | Tests for new proof generation helpers |
| `frontend/src/lib/types.ts` | Modify | Add `jumpTxDigest: Uint8Array` to `IntelListingFields` |
| `frontend/src/lib/parse.ts` | Modify | Parse `jump_tx_digest` from on-chain fields |
| `frontend/src/lib/parse.test.ts` | Modify | Test `jump_tx_digest` parsing |
| `frontend/src/lib/transactions.ts` | Modify | Update `buildCreateVerifiedListingTx` with `jump_tx_digest` param |
| `frontend/src/lib/transactions.test.ts` | Modify | Test new tx builder |
| `frontend/src/lib/constants.ts` | Modify | Add `WORLD_PACKAGE_ID`, update PACKAGE_ID + VKey IDs after deploy |
| `frontend/src/components/CreateListing.tsx` | Modify | New verification flow using SUI event queries |
| `frontend/src/components/InfoModal.tsx` | Modify | Move "On-chain verified intel" to Live Features |
| `frontend/src/components/ListingBrowser.tsx` | Modify | Show "Presence Verified" badge for presence-proven listings |
| `frontend/src/components/MyIntel.tsx` | Modify | Same badge treatment as ListingBrowser |
| `frontend/src/components/MyListings.tsx` | Modify | Same badge treatment as ListingBrowser |
| `frontend/src/components/RegionPanel.tsx` | Modify | Same badge treatment as ListingBrowser |

---

## Chunk 1: Circuit

### Task 1: Write the Presence Attestation Circuit

**Files:**
- Create: `circuits/presence-attestation/presence-attestation.circom`

- [ ] **Step 1: Create the circuit file**

Create `circuits/presence-attestation/presence-attestation.circom`:

```circom
pragma circom 2.2.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";

// Reuse AbsDiff from distance-attestation circuit
template AbsDiff() {
    signal input a;
    signal input b;
    signal input hint;
    signal output out;

    signal diff;
    diff <== a - b;
    signal diffSq;
    diffSq <== diff * diff;
    signal hintSq;
    hintSq <== hint * hint;
    diffSq === hintSq;

    component n2b = Num2Bits(64);
    n2b.in <== hint;

    out <== hint;
}

/// Presence Attestation Circuit
///
/// Proves: scout was at a gate whose coordinates match an on-chain location_hash,
/// and computes Manhattan distance to a target assembly.
///
/// Public Inputs (3):
///   coordinatesHash — Poseidon(scoutX, scoutY, scoutZ, salt) for backward compatibility
///   targetHash      — Poseidon(targetX, targetY, targetZ, targetSalt)
///   locationHash    — on-chain Poseidon hash from LocationRevealedEvent (trust binding)
///
/// Public Outputs (2):
///   distanceSquared — (|dx| + |dy| + |dz|)^2 in meters^2
///   timestamp       — jump timestamp for on-chain staleness validation
///
/// Private Inputs:
///   scoutCoords[3]   — gate coordinates from LocationRevealedEvent
///   scoutSalt        — random salt for brute-force protection
///   targetCoords[3]  — target assembly coordinates from LocationRevealedEvent
///   targetSalt       — random salt for target coordinates
///   absDiffHints[3]  — |dx|, |dy|, |dz| computed off-chain
///   jumpTimestamp     — block timestamp of the JumpEvent transaction
template PresenceAttestationCircuit() {
    // ========== PUBLIC INPUTS ==========
    signal input coordinatesHash;     // Poseidon(scoutX, scoutY, scoutZ, scoutSalt)
    signal input targetHash;          // Poseidon(targetX, targetY, targetZ, targetSalt)
    signal input locationHash;        // On-chain location_hash from LocationRevealedEvent

    // ========== PUBLIC OUTPUTS ==========
    signal output distanceSquared;
    signal output timestamp;

    // ========== PRIVATE INPUTS ==========
    signal input scoutCoords[3];      // [x, y, z] from scout's gate LocationRevealedEvent
    signal input scoutSalt;
    signal input targetCoords[3];     // [x, y, z] from target assembly LocationRevealedEvent
    signal input targetSalt;
    signal input absDiffHints[3];     // |dx|, |dy|, |dz| computed off-chain
    signal input jumpTimestamp;       // Block timestamp of the JumpEvent

    // ========== VERIFICATION ==========

    // 1. Verify scout coordinates match the on-chain location_hash (trust binding).
    //    IMPORTANT: This assumes CCP's location_hash uses Poseidon(3) over the raw coordinates.
    //    If CCP uses Poseidon2 or a different arity/encoding, this constraint will be
    //    unsatisfiable. In that case, REMOVE the equality constraint and keep locationHash
    //    as an unconstrained public input for audit purposes only.
    //    VERIFICATION STEP: Before compiling, test with a known LocationRevealedEvent:
    //    compute Poseidon(x, y, z) in JS and compare with the on-chain location_hash bytes.
    //    If they match → keep the constraint. If not → remove the equality, keep as audit input.
    component locHash = Poseidon(3);
    locHash.inputs[0] <== scoutCoords[0];
    locHash.inputs[1] <== scoutCoords[1];
    locHash.inputs[2] <== scoutCoords[2];
    locHash.out === locationHash;  // REMOVE this line if Poseidon hash doesn't match CCP's

    // 2. Verify scout coordinatesHash (backward compatibility with existing flow)
    component scoutHash = Poseidon(4);
    scoutHash.inputs[0] <== scoutCoords[0];
    scoutHash.inputs[1] <== scoutCoords[1];
    scoutHash.inputs[2] <== scoutCoords[2];
    scoutHash.inputs[3] <== scoutSalt;
    scoutHash.out === coordinatesHash;

    // 3. Verify target coordinatesHash
    component tgtHash = Poseidon(4);
    tgtHash.inputs[0] <== targetCoords[0];
    tgtHash.inputs[1] <== targetCoords[1];
    tgtHash.inputs[2] <== targetCoords[2];
    tgtHash.inputs[3] <== targetSalt;
    tgtHash.out === targetHash;

    // 4. Compute Manhattan distance: |dx| + |dy| + |dz|
    component absDx = AbsDiff();
    absDx.a <== scoutCoords[0];
    absDx.b <== targetCoords[0];
    absDx.hint <== absDiffHints[0];

    component absDy = AbsDiff();
    absDy.a <== scoutCoords[1];
    absDy.b <== targetCoords[1];
    absDy.hint <== absDiffHints[1];

    component absDz = AbsDiff();
    absDz.a <== scoutCoords[2];
    absDz.b <== targetCoords[2];
    absDz.hint <== absDiffHints[2];

    signal manhattanDist;
    manhattanDist <== absDx.out + absDy.out + absDz.out;

    // 5. Output distance squared (avoids sqrt in-circuit)
    distanceSquared <== manhattanDist * manhattanDist;

    // 6. Output timestamp for on-chain staleness validation
    timestamp <== jumpTimestamp;
}

component main { public [coordinatesHash, targetHash, locationHash] } = PresenceAttestationCircuit();
```

- [ ] **Step 2: Verify Poseidon hash compatibility with CCP's location_hash**

Before compiling, test whether our Poseidon(3) matches CCP's `location_hash`:

```typescript
// Quick verification script (Node.js)
import { buildPoseidon } from 'circomlibjs'

const poseidon = await buildPoseidon()
const F = poseidon.F

// Use coords from a real LocationRevealedEvent (Utopia):
const x = -21127680483892550000n
const y = -63992514302670300n
const z = -10527202688414894000n

const hash = F.toObject(poseidon([x, y, z]))
console.log('Computed Poseidon(x,y,z):', hash.toString(16))
console.log('On-chain location_hash bytes:', [34, 195, 61, ...]) // from the event

// Compare: if the computed hash matches the on-chain bytes (LE), keep the constraint.
// If not, remove `locHash.out === locationHash;` from the circuit and document why.
```

**If hashes DON'T match:** Remove the equality constraint from the circuit (line with `locHash.out === locationHash`). The `locationHash` becomes an unconstrained public input — still useful as an audit trail but not cryptographically binding. Update the spec to note this.

- [ ] **Step 3: Compile the circuit (offline, PowerShell)**

Follow the workflow in `circuits/README.md`. From the `zk-compile` working directory:

```powershell
# Copy the circom file
Copy-Item -Force "D:\Misc\GitHub\portfolio\EF_intel\circuits\presence-attestation\presence-attestation.circom" .

# Compile
circom presence-attestation.circom --r1cs --wasm --sym -l node_modules -o build/

# Expected: should show constraint count (~1,500)
```

- [ ] **Step 3: Run trusted setup (offline)**

```powershell
npx snarkjs groth16 setup build/presence-attestation.r1cs ppot_0080_13.ptau presence-attestation_0000.zkey

$entropy = -join (1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 } | ForEach-Object { $_.ToString("x2") })
npx snarkjs zkey contribute presence-attestation_0000.zkey presence-attestation_final.zkey --name="phase5" -e="$entropy"
```

- [ ] **Step 4: Extract VKey and copy artifacts**

```powershell
npx snarkjs zkey export verificationkey presence-attestation_final.zkey verification_key.json
node D:\Misc\GitHub\portfolio\EF_intel\circuits\extract-vkey.cjs verification_key.json
# Record the output hex — this goes into the contract's init()

# Copy browser artifacts
Copy-Item -Force "build\presence-attestation_js\presence-attestation.wasm" "D:\Misc\GitHub\portfolio\EF_intel\frontend\public\zk\presence-attestation.wasm"
Copy-Item -Force "presence-attestation_final.zkey" "D:\Misc\GitHub\portfolio\EF_intel\frontend\public\zk\presence-attestation_final.zkey"
```

- [ ] **Step 5: Commit circuit source (not binaries — those come after compilation)**

```bash
git add circuits/presence-attestation/presence-attestation.circom
git commit -m "feat(circuit): add presence-attestation unified circuit"
```

---

## Chunk 2: Contract

### Task 2: Contract — New Field, Error Constants, PresenceVKey

**Files:**
- Modify: `contracts/sources/marketplace.move`

- [ ] **Step 1: Add new error constants**

After `ETimestampInFuture` (line 32), add:

```move
const EInvalidPresenceProof: u64 = 22;
```

- [ ] **Step 2: Add `jump_tx_digest` field to IntelListing**

In the `IntelListing` struct, after `distance_proof_hash: vector<u8>,` add:

```move
    jump_tx_digest: vector<u8>,     // SUI tx digest of JumpEvent (audit trail, empty for unverified)
```

- [ ] **Step 3: Add PresenceVKey shared object**

After the `DistanceVKey` struct, add:

```move
/// Verification key for the unified presence-attestation circuit (Phase 5).
public struct PresenceVKey has key {
    id: UID,
    vkey_bytes: vector<u8>,
}
```

- [ ] **Step 4: Create PresenceVKey in `init()` with placeholder bytes**

In `init()`, after the `distance_vkey` creation, add:

```move
    let presence_vkey = PresenceVKey {
        id: object::new(ctx),
        vkey_bytes: x"00", // Placeholder — updated after circuit compilation
    };
    transfer::share_object(presence_vkey);
```

- [ ] **Step 5: Initialize `jump_tx_digest` in both creation functions**

In `create_listing`, add `jump_tx_digest: vector::empty(),` to the IntelListing construction.
In `create_verified_listing`, add `jump_tx_digest: vector::empty(),` to the IntelListing construction.

- [ ] **Step 6: Add `jump_tx_digest` getter**

After the `observed_at` getter:

```move
public fun jump_tx_digest(listing: &IntelListing): &vector<u8> { &listing.jump_tx_digest }
```

- [ ] **Step 7: Build and run tests**

Run: `.sui-bin/sui.exe move test --path contracts`
Expected: All 39 tests pass (no new tests yet, just structural additions).

- [ ] **Step 8: Commit**

```bash
git add contracts/sources/marketplace.move
git commit -m "feat(contract): add PresenceVKey, jump_tx_digest field, error constants"
```

---

### Task 3: Contract — Add `create_presence_verified_listing`

**Files:**
- Modify: `contracts/sources/marketplace.move`

- [ ] **Step 1: Add the new entry function**

After `create_verified_listing`, add a new function:

```move
/// Create a listing verified by the unified presence-attestation circuit (Phase 5).
/// Proof embeds: distance to target, jump timestamp, coordinate hashes, location_hash binding.
/// public_inputs_bytes: 160 bytes (5 × 32), snarkjs output order:
///   [0]: distanceSquared (32 bytes LE) — output
///   [1]: timestamp (32 bytes LE) — output
///   [2]: coordinatesHash (32 bytes LE) — input
///   [3]: targetHash (32 bytes LE) — input
///   [4]: locationHash (32 bytes LE) — input
public fun create_presence_verified_listing(
    intel_type: u8,
    system_id: u64,
    individual_price: u64,
    decay_hours: u64,
    walrus_blob_id: vector<u8>,
    stake: Coin<SUI>,
    vkey: &PresenceVKey,
    proof_points_bytes: vector<u8>,
    public_inputs_bytes: vector<u8>,
    jump_tx_digest: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(intel_type <= INTEL_TYPE_ROUTE, EInvalidIntelType);
    assert!(decay_hours >= MIN_DECAY_HOURS, EDecayTooSmall);
    assert!(decay_hours <= MAX_DECAY_HOURS, EDecayTooLarge);
    assert!(individual_price >= MIN_PRICE, EPriceTooLow);
    assert!(coin::value(&stake) >= MIN_STAKE, EStakeTooLow);

    // Verify Groth16 proof on-chain
    let pvk = groth16::prepare_verifying_key(&groth16::bn254(), &vkey.vkey_bytes);
    let public_inputs = groth16::public_proof_inputs_from_bytes(public_inputs_bytes);
    let proof_points = groth16::proof_points_from_bytes(proof_points_bytes);
    assert!(
        groth16::verify_groth16_proof(&groth16::bn254(), &pvk, &public_inputs, &proof_points),
        EInvalidPresenceProof,
    );

    // Extract timestamp from second public signal (bytes [32..40])
    // snarkjs output order: [distanceSquared, timestamp, ...]
    let observed_at = bytes_to_u64_le(&public_inputs_bytes, 32);
    let now = clock.timestamp_ms();

    // Reject future timestamps
    assert!(observed_at <= now, ETimestampInFuture);

    // Reject stale observations (24h cap)
    assert!(
        now - observed_at <= MAX_OBSERVATION_AGE_MS,
        EObservationTooStale,
    );

    let listing = IntelListing {
        id: object::new(ctx),
        scout: ctx.sender(),
        intel_type,
        system_id,
        created_at: now,
        observed_at,
        decay_hours,
        walrus_blob_id,
        individual_price,
        stake: stake.into_balance(),
        delisted: false,
        location_proof_hash: public_inputs_bytes,
        distance_proof_hash: vector::empty(),
        jump_tx_digest,
    };
    let listing_id_val = object::id(&listing);
    event::emit(IntelListed {
        listing_id: listing_id_val,
        scout: ctx.sender(),
        intel_type,
        system_id,
    });
    event::emit(VerifiedIntelListed {
        listing_id: listing_id_val,
        scout: ctx.sender(),
    });
    transfer::share_object(listing);
}
```

Note: The distance is embedded in `public_inputs_bytes[0..32]` (the `distanceSquared` output). The frontend extracts it client-side from `location_proof_hash` — same pattern as the existing distance proof parsing in `parse.ts`.

- [ ] **Step 2: Build and run tests**

Run: `.sui-bin/sui.exe move test --path contracts`
Expected: All 39 tests pass.

- [ ] **Step 3: Commit**

```bash
git add contracts/sources/marketplace.move
git commit -m "feat(contract): add create_presence_verified_listing with unified proof"
```

---

### Task 4: Contract Tests

**Files:**
- Modify: `contracts/tests/marketplace_tests.move`
- Modify: `contracts/sources/marketplace.move` (test-only helpers)

- [ ] **Step 1: Add test-only helpers**

In `contracts/sources/marketplace.move`, add after existing test-only helpers:

```move
#[test_only]
public fun init_presence_vkey_for_testing(ctx: &mut TxContext) {
    let presence_vkey = PresenceVKey {
        id: object::new(ctx),
        vkey_bytes: x"00",
    };
    transfer::share_object(presence_vkey);
}

#[test_only]
public fun set_jump_tx_digest_for_testing(listing: &mut IntelListing, digest: vector<u8>) {
    listing.jump_tx_digest = digest;
}
```

- [ ] **Step 2: Add test — unverified listing has empty jump_tx_digest**

```move
#[test]
fun test_unverified_listing_empty_jump_tx_digest() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(1, 42, 500_000, 24, b"blob", stake, &clk, ctx);
        clock::destroy_for_testing(clk);
    };
    scenario.next_tx(SCOUT);
    {
        let listing = scenario.take_shared<IntelListing>();
        assert!(marketplace::jump_tx_digest(&listing).is_empty());
        test_scenario::return_shared(listing);
    };
    scenario.end();
}
```

- [ ] **Step 3: Add test — presence verified listing stores jump_tx_digest**

```move
#[test]
fun test_presence_listing_stores_jump_tx_digest() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(1, 42, 500_000, 24, b"blob", stake, &clk, ctx);
        clock::destroy_for_testing(clk);
    };
    scenario.next_tx(SCOUT);
    {
        let mut listing = scenario.take_shared<IntelListing>();
        marketplace::set_jump_tx_digest_for_testing(&mut listing, b"test_digest_abc123");
        assert!(*marketplace::jump_tx_digest(&listing) == b"test_digest_abc123");
        test_scenario::return_shared(listing);
    };
    scenario.end();
}
```

- [ ] **Step 4: Add test — `create_presence_verified_listing` rejects invalid proof**

```move
#[test, expected_failure(abort_code = marketplace::EInvalidPresenceProof)]
fun test_create_presence_verified_listing_invalid_proof() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        marketplace::init_for_testing(scenario.ctx());
    };
    scenario.next_tx(SCOUT);
    {
        let vkey = scenario.take_shared<PresenceVKey>();
        let ctx = scenario.ctx();
        let clock = clock::create_for_testing(ctx);
        let coin = coin::mint_for_testing<SUI>(1_000_000, ctx);
        // 128-byte garbage proof, 160-byte garbage inputs (5×32)
        let fake_proof = x"0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        let fake_inputs = x"00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        marketplace::create_presence_verified_listing(
            1, 42, 500_000, 24, b"blob", coin,
            &vkey,
            fake_proof,
            fake_inputs,
            b"fake_tx_digest",
            &clock, ctx,
        );
        clock::destroy_for_testing(clock);
        test_scenario::return_shared(vkey);
    };
    scenario.end();
}
```

Note: This test verifies that the Groth16 verification correctly rejects garbage proofs. The `PresenceVKey` has placeholder bytes (`x"00"`), so any proof will fail verification.

- [ ] **Step 5: Add test — old `create_verified_listing` still works (backward compatibility)**

This test confirms the existing `create_verified_listing` function still works with the LocationVKey. No changes needed to existing tests — just verify they still pass.

- [ ] **Step 6: Run all tests**

Run: `.sui-bin/sui.exe move test --path contracts`
Expected: 42 tests pass (39 existing + 3 new).

- [ ] **Step 7: Commit**

```bash
git add contracts/sources/marketplace.move contracts/tests/marketplace_tests.move
git commit -m "test(contract): presence proof — jump_tx_digest, invalid proof, field tests"
```

---

## Chunk 3: Frontend — Data Layer

### Task 5: Frontend — SUI Event Query Library

**Files:**
- Create: `frontend/src/lib/events.ts`
- Create: `frontend/src/lib/events.test.ts`

- [ ] **Step 1: Write failing tests for event types and parsing**

Create `frontend/src/lib/events.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'

import { parseJumpEvent, parseLocationEvent } from './events'

describe('parseJumpEvent', () => {
  const rawEvent = {
    parsedJson: {
      character_id: '0xef0945b',
      source_gate_id: '0xc0e53f',
      destination_gate_id: '0x2840c4',
      character_key: { item_id: '2112000078', tenant: 'utopia' },
      source_gate_key: { item_id: '1000000014451', tenant: 'utopia' },
      destination_gate_key: { item_id: '1000000014502', tenant: 'utopia' },
    },
    timestampMs: '1773701456372',
    txDigest: 'ABC123',
  }

  it('parses character_id', () => {
    expect(parseJumpEvent(rawEvent).characterId).toBe('0xef0945b')
  })

  it('parses destination_gate_id', () => {
    expect(parseJumpEvent(rawEvent).destinationGateId).toBe('0x2840c4')
  })

  it('parses timestamp as bigint', () => {
    expect(parseJumpEvent(rawEvent).timestamp).toBe(1773701456372n)
  })

  it('parses txDigest', () => {
    expect(parseJumpEvent(rawEvent).txDigest).toBe('ABC123')
  })
})

describe('parseLocationEvent', () => {
  const rawEvent = {
    parsedJson: {
      assembly_id: '0x970ed2',
      solarsystem: '30013468',
      x: '-21127680483892550000',
      y: '-63992514302670300',
      z: '-10527202688414894000',
      location_hash: [34, 195, 61, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      type_id: '88092',
    },
    timestampMs: '1773973111797',
  }

  it('parses coordinates as BigInt', () => {
    const loc = parseLocationEvent(rawEvent)
    expect(loc.x).toBe(-21127680483892550000n)
    expect(loc.y).toBe(-63992514302670300n)
    expect(loc.z).toBe(-10527202688414894000n)
  })

  it('parses solarSystem as number', () => {
    expect(parseLocationEvent(rawEvent).solarSystem).toBe(30013468)
  })

  it('parses locationHash as Uint8Array', () => {
    const loc = parseLocationEvent(rawEvent)
    expect(loc.locationHash).toBeInstanceOf(Uint8Array)
    expect(loc.locationHash.length).toBe(32)
    expect(loc.locationHash[0]).toBe(34)
  })

  it('parses assemblyId', () => {
    expect(parseLocationEvent(rawEvent).assemblyId).toBe('0x970ed2')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && pnpm exec vitest run src/lib/events.test.ts`
Expected: FAIL — `events.ts` doesn't exist

- [ ] **Step 3: Implement event types and parsers**

Create `frontend/src/lib/events.ts`:

```typescript
export interface JumpEvent {
  readonly characterId: string
  readonly sourceGateId: string
  readonly destinationGateId: string
  readonly timestamp: bigint
  readonly txDigest: string
  readonly systemId?: number
}

export interface LocationEvent {
  readonly assemblyId: string
  readonly solarSystem: number
  readonly x: bigint
  readonly y: bigint
  readonly z: bigint
  readonly locationHash: Uint8Array
  readonly typeId: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseJumpEvent(raw: any): JumpEvent {
  const json = raw.parsedJson
  return {
    characterId: json.character_id,
    sourceGateId: json.source_gate_id,
    destinationGateId: json.destination_gate_id,
    timestamp: BigInt(raw.timestampMs),
    txDigest: raw.txDigest,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseLocationEvent(raw: any): LocationEvent {
  const json = raw.parsedJson
  return {
    assemblyId: json.assembly_id,
    solarSystem: Number(json.solarsystem),
    x: BigInt(json.x),
    y: BigInt(json.y),
    z: BigInt(json.z),
    locationHash: new Uint8Array(json.location_hash),
    typeId: json.type_id,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && pnpm exec vitest run src/lib/events.test.ts`
Expected: All pass

- [ ] **Step 5: Add SUI query functions**

Add to `frontend/src/lib/events.ts`:

```typescript
import type { SuiClient } from '@mysten/sui/client'

const UTOPIA_WORLD_PACKAGE = '0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75'

/** Fetch recent JumpEvents, optionally filtered by character ID. */
export async function fetchJumpEvents(
  suiClient: SuiClient,
  characterId?: string,
  packageId: string = UTOPIA_WORLD_PACKAGE,
): Promise<JumpEvent[]> {
  const { data } = await suiClient.queryEvents({
    query: { MoveEventType: `${packageId}::gate::JumpEvent` },
    order: 'descending',
    limit: 50,
  })
  const all = data.map(parseJumpEvent)
  // SUI queryEvents can't filter by inner fields — filter client-side
  if (characterId) return all.filter(e => e.characterId === characterId)
  return all
}

/** Fetch the LocationRevealedEvent for a specific assembly. */
export async function fetchLocationEvent(
  suiClient: SuiClient,
  assemblyId: string,
  packageId: string = UTOPIA_WORLD_PACKAGE,
): Promise<LocationEvent | null> {
  // SUI queryEvents can't filter by inner fields — fetch and filter client-side.
  // For large event volumes, consider paginating. limit: 200 covers most deployments.
  const { data } = await suiClient.queryEvents({
    query: { MoveEventType: `${packageId}::location::LocationRevealedEvent` },
    order: 'descending',
    limit: 200,
  })
  const parsed = data.map(parseLocationEvent)
  return parsed.find(e => e.assemblyId === assemblyId) ?? null
}

/**
 * Resolve a wallet address to an EVE Frontier character ID.
 * Queries PlayerProfile objects owned by the wallet address.
 * Returns null if no PlayerProfile is found.
 */
export async function resolveCharacterId(
  suiClient: SuiClient,
  walletAddress: string,
  packageId: string = UTOPIA_WORLD_PACKAGE,
): Promise<string | null> {
  const { data } = await suiClient.getOwnedObjects({
    owner: walletAddress,
    filter: { StructType: `${packageId}::smart_character::PlayerProfile` },
    options: { showContent: true },
    limit: 1,
  })
  if (data.length === 0 || !data[0]?.data?.content) return null
  // The PlayerProfile object ID is the character_id used in JumpEvents
  return data[0].data.objectId
}
```

- [ ] **Step 6: Run all frontend tests**

Run: `cd frontend && pnpm exec vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/events.ts frontend/src/lib/events.test.ts
git commit -m "feat(frontend): SUI event query library for JumpEvent and LocationRevealedEvent"
```

---

### Task 6: Frontend — Types + Parsing for jump_tx_digest

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/parse.ts`
- Modify: `frontend/src/lib/parse.test.ts`

- [ ] **Step 1: Write failing test**

In `frontend/src/lib/parse.test.ts`, add:

```typescript
describe('parseListingFields — jump_tx_digest', () => {
  const baseFields = {
    scout: '0xABC',
    intel_type: 1,
    system_id: '42',
    created_at: '1000',
    observed_at: '900',
    decay_hours: '24',
    walrus_blob_id: [],
    individual_price: '500000',
    stake: { value: '1000000' },
    delisted: false,
    location_proof_hash: [],
  }

  it('parses jump_tx_digest when present', () => {
    const result = parseListingFields('0x1', { ...baseFields, jump_tx_digest: [65, 66, 67] })
    expect(result.jumpTxDigest).toEqual(new Uint8Array([65, 66, 67]))
  })

  it('returns empty Uint8Array when jump_tx_digest is missing', () => {
    const result = parseListingFields('0x1', { ...baseFields })
    expect(result.jumpTxDigest).toEqual(new Uint8Array([]))
  })
})
```

- [ ] **Step 2: Run test to verify FAIL**

Run: `cd frontend && pnpm exec vitest run src/lib/parse.test.ts`
Expected: FAIL — `jumpTxDigest` missing

- [ ] **Step 3: Add `jumpTxDigest` to types and parsing**

In `frontend/src/lib/types.ts`, add after `distanceMeters`:

```typescript
  readonly jumpTxDigest: Uint8Array
```

In `frontend/src/lib/parse.ts`, add in the `parseListingFields` return object after `distanceMeters`:

```typescript
    jumpTxDigest: new Uint8Array((fields.jump_tx_digest as number[] | undefined) ?? []),
```

- [ ] **Step 4: Update test fixtures**

Add `jumpTxDigest: new Uint8Array()` to all `makeListing` fixtures in:
- `frontend/src/lib/format.test.ts`
- `frontend/src/lib/heat-map-data.test.ts`

Pattern: `jumpTxDigest: overrides.jumpTxDigest ?? new Uint8Array(),`

- [ ] **Step 5: Run all tests**

Run: `cd frontend && pnpm exec vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/parse.ts frontend/src/lib/parse.test.ts
git add frontend/src/lib/format.test.ts frontend/src/lib/heat-map-data.test.ts
git commit -m "feat(frontend): add jumpTxDigest to types, parse, and test fixtures"
```

---

### Task 7: Frontend — Transaction Builder Update

**Files:**
- Modify: `frontend/src/lib/transactions.ts`
- Modify: `frontend/src/lib/transactions.test.ts`

- [ ] **Step 1: Write failing test**

In `frontend/src/lib/transactions.test.ts`, find the existing test for `buildCreateVerifiedListingTx`. Add a new test:

```typescript
describe('buildCreatePresenceVerifiedListingTx', () => {
  it('creates a transaction with presence vkey and jump_tx_digest', () => {
    const tx = buildCreatePresenceVerifiedListingTx({
      intelType: 1,
      systemId: 42n,
      individualPrice: 500_000n,
      decayHours: 24n,
      walrusBlobId: new Uint8Array([1, 2, 3]),
      stakeAmount: 1_000_000n,
      presenceVkeyId: '0xPRESENCE_VKEY',
      proofPointsBytes: new Uint8Array(128),
      publicInputsBytes: new Uint8Array(160),
      jumpTxDigest: new Uint8Array([65, 66, 67]),
    })
    expect(tx).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify FAIL**

- [ ] **Step 3: Implement the new tx builder**

In `frontend/src/lib/transactions.ts`, add:

```typescript
export function buildCreatePresenceVerifiedListingTx(params: {
  intelType: number
  systemId: bigint
  individualPrice: bigint
  decayHours: bigint
  walrusBlobId: Uint8Array
  stakeAmount: bigint
  presenceVkeyId: string
  proofPointsBytes: Uint8Array
  publicInputsBytes: Uint8Array
  jumpTxDigest: Uint8Array
}): Transaction {
  const tx = new Transaction()
  const [stake] = tx.splitCoins(tx.gas, [tx.pure.u64(params.stakeAmount)])
  tx.moveCall({
    target: `${PACKAGE_ID}::marketplace::create_presence_verified_listing`,
    arguments: [
      tx.pure.u8(params.intelType),
      tx.pure.u64(params.systemId),
      tx.pure.u64(params.individualPrice),
      tx.pure.u64(params.decayHours),
      tx.pure.vector('u8', Array.from(params.walrusBlobId)),
      stake,
      tx.object(params.presenceVkeyId),
      tx.pure.vector('u8', Array.from(params.proofPointsBytes)),
      tx.pure.vector('u8', Array.from(params.publicInputsBytes)),
      tx.pure.vector('u8', Array.from(params.jumpTxDigest)),
      tx.object(CLOCK_ID),
    ],
  })
  return tx
}
```

- [ ] **Step 4: Run tests to verify pass**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/transactions.ts frontend/src/lib/transactions.test.ts
git commit -m "feat(frontend): add buildCreatePresenceVerifiedListingTx"
```

---

### Task 8: Frontend — Constants + Proof Generation

**Files:**
- Modify: `frontend/src/lib/constants.ts`
- Modify: `frontend/src/lib/zk-proof.ts`

- [ ] **Step 1: Add constants**

In `frontend/src/lib/constants.ts`, add:

```typescript
/** EVE Frontier world-contracts package ID on Utopia testnet. */
export const WORLD_PACKAGE_ID = '0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75'

// TODO (Phase 5 deploy): add PRESENCE_VKEY_ID after contract deployment
```

- [ ] **Step 2: Add presence proof generator to zk-proof.ts**

Add new circuit artifact URLs and the proof generation function:

```typescript
const PRESENCE_WASM_URL = '/zk/presence-attestation.wasm'
const PRESENCE_ZKEY_URL = '/zk/presence-attestation_final.zkey'

/**
 * Generate a unified presence + proximity proof from on-chain event data.
 *
 * This replaces both generateLocationProof and generateDistanceProof for
 * Phase 5 on-chain verified listings.
 */
export async function generatePresenceProof(
  scoutCoords: { x: bigint; y: bigint; z: bigint },
  targetCoords: { x: bigint; y: bigint; z: bigint },
  jumpTimestamp: bigint,
): Promise<{ proofBytes: Uint8Array; publicInputsBytes: Uint8Array; scoutSalt: bigint; targetSalt: bigint }> {
  const scoutSalt = generateSalt()
  const targetSalt = generateSalt()

  // @ts-expect-error snarkjs has no bundled types
  const snarkjs = await import('snarkjs')
  // @ts-expect-error circomlibjs has no bundled types
  const { buildPoseidon } = await import('circomlibjs')
  const poseidon = await buildPoseidon()
  const F = poseidon.F

  // Compute hashes
  const coordinatesHash = F.toObject(poseidon([scoutCoords.x, scoutCoords.y, scoutCoords.z, scoutSalt]))
  const targetHash = F.toObject(poseidon([targetCoords.x, targetCoords.y, targetCoords.z, targetSalt]))
  const locationHash = F.toObject(poseidon([scoutCoords.x, scoutCoords.y, scoutCoords.z]))

  // Compute AbsDiff hints
  const absDx = scoutCoords.x > targetCoords.x ? scoutCoords.x - targetCoords.x : targetCoords.x - scoutCoords.x
  const absDy = scoutCoords.y > targetCoords.y ? scoutCoords.y - targetCoords.y : targetCoords.y - scoutCoords.y
  const absDz = scoutCoords.z > targetCoords.z ? scoutCoords.z - targetCoords.z : targetCoords.z - scoutCoords.z

  const circuitInput = {
    coordinatesHash: coordinatesHash.toString(),
    targetHash: targetHash.toString(),
    locationHash: locationHash.toString(),
    scoutCoords: [scoutCoords.x.toString(), scoutCoords.y.toString(), scoutCoords.z.toString()],
    scoutSalt: scoutSalt.toString(),
    targetCoords: [targetCoords.x.toString(), targetCoords.y.toString(), targetCoords.z.toString()],
    targetSalt: targetSalt.toString(),
    absDiffHints: [absDx.toString(), absDy.toString(), absDz.toString()],
    jumpTimestamp: jumpTimestamp.toString(),
  }

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    PRESENCE_WASM_URL,
    PRESENCE_ZKEY_URL,
  )

  return {
    proofBytes: snarkjsProofToArkworks(proof as SnarkjsProof),
    publicInputsBytes: publicSignalsToBytes(publicSignals as string[]),
    scoutSalt,
    targetSalt,
  }
}
```

- [ ] **Step 3: Run all tests**

Run: `cd frontend && pnpm exec vitest run`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/constants.ts frontend/src/lib/zk-proof.ts
git commit -m "feat(frontend): add WORLD_PACKAGE_ID, generatePresenceProof"
```

---

## Chunk 4: Frontend — Components + Deploy

### Task 9: CreateListing — On-Chain Event Verification Flow

**Files:**
- Modify: `frontend/src/components/CreateListing.tsx`

- [ ] **Step 1: Add jump event selection state and fetching**

In `CreateListing.tsx`, add new state for jump events and presence proof flow:
- Import `fetchJumpEvents`, `fetchLocationEvent` from `../lib/events`
- Import `generatePresenceProof` from `../lib/zk-proof`
- Import `WORLD_PACKAGE_ID` from `../lib/constants`
- Add state: `jumpEvents`, `selectedJump`, `targetAssemblyId`
- When "Verify Presence" is toggled, fetch the scout's JumpEvents from SUI
- Show a dropdown of recent jumps (system name + timestamp)
- When a jump is selected, fetch the LocationRevealedEvent for the destination gate
- Add a target assembly picker (or text input for assembly ID)
- Generate the unified presence proof using `generatePresenceProof()`
- Submit with `buildCreatePresenceVerifiedListingTx()`

This is the most complex UI change. The exact implementation depends on the existing CreateListing structure — read the file and follow its patterns.

Key flow:
1. Scout toggles "Verify with on-chain data" (replaces the old "Verify Location" toggle)
2. Frontend calls `fetchJumpEvents()` — shows recent jumps in a select dropdown
3. Scout picks a jump → frontend calls `fetchLocationEvent(jumpEvent.destinationGateId)` to get gate coordinates
4. Scout enters target assembly ID (or picks from a list) → frontend fetches target coordinates
5. Frontend calls `generatePresenceProof(scoutCoords, targetCoords, jumpTimestamp)`
6. Proof + jumpTxDigest submitted to contract

- [ ] **Step 2: Run all tests**

Run: `cd frontend && pnpm exec vitest run`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CreateListing.tsx
git commit -m "feat(frontend): on-chain event verification flow in CreateListing"
```

---

### Task 10: InfoModal + Display Updates

**Files:**
- Modify: `frontend/src/components/InfoModal.tsx`
- Modify: `frontend/src/components/ListingBrowser.tsx`

- [ ] **Step 1: Update InfoModal**

In `InfoModal.tsx`, update the Live Features list:
- Add: `<li>On-chain verified intel — ZK proofs backed by SUI blockchain events, not self-signed data</li>`
- Update proximity item to mention per-assembly precision

In the Coming Soon section, add:
- `<dt>"Player Proximity"</dt><dd>Prove distance to another player. Requires CCP to emit player position events on-chain.</dd>`
- `<dt>"Resource Proximity"</dt><dd>Prove distance to rifts, asteroids, or other resources. Requires CCP to publish resource locations on-chain.</dd>`

- [ ] **Step 2: Update ListingBrowser badge for presence-verified listings**

If a listing has a non-empty `jumpTxDigest`, show "Presence Verified" badge instead of just "ZK-Verified":

```tsx
{listing.jumpTxDigest.length > 0 ? (
  <span className="listing-verified-badge">Presence Verified</span>
) : listing.isVerified ? (
  <span className="listing-verified-badge">ZK-Verified</span>
) : null}
```

Apply the same pattern to `MyIntel.tsx`, `MyListings.tsx`, and `RegionPanel.tsx`.

- [ ] **Step 3: Run all tests**

Run: `cd frontend && pnpm exec vitest run`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/InfoModal.tsx frontend/src/components/ListingBrowser.tsx
git add frontend/src/components/MyIntel.tsx frontend/src/components/MyListings.tsx
git add frontend/src/components/RegionPanel.tsx
git commit -m "feat(frontend): presence-verified badge, InfoModal updates"
```

---

### Task 11: Circuit Compilation + Deploy + Constants Update

**Files:**
- Modify: `frontend/src/lib/constants.ts`
- Modify: `contracts/sources/marketplace.move` (PresenceVKey bytes)

This task requires manual offline steps:

- [ ] **Step 1: Compile the circuit (if not done in Task 1)**

Follow Task 1 Steps 2-4. Confirm the circuit compiles and artifacts are in `frontend/public/zk/`.

- [ ] **Step 2: Update PresenceVKey bytes in contract**

Replace the `x"00"` placeholder in `init()` with the actual VKey hex from Task 1 Step 4.

- [ ] **Step 3: Deploy the contract**

```powershell
.sui-bin\sui.exe client publish --gas-budget 500000000 contracts
```

Record:
- Package ID
- PresenceVKey object ID
- LocationVKey object ID
- DistanceVKey object ID

- [ ] **Step 4: Update constants.ts**

```typescript
export const PACKAGE_ID = '<new_package_id>'
export const LOCATION_VKEY_ID = '<new_location_vkey_id>'
export const DISTANCE_VKEY_ID = '<new_distance_vkey_id>'
export const PRESENCE_VKEY_ID = '<new_presence_vkey_id>'
```

- [ ] **Step 5: Run all tests**

Run both test suites:
- `.sui-bin/sui.exe move test --path contracts`
- `cd frontend && pnpm exec vitest run`

- [ ] **Step 6: Commit**

```bash
git add contracts/sources/marketplace.move frontend/src/lib/constants.ts
git add frontend/public/zk/presence-attestation.wasm frontend/public/zk/presence-attestation_final.zkey
git commit -m "feat: deploy Phase 5 — on-chain verified intel with presence proofs"
```

---

## Post-Implementation

### Documentation Updates

After all tasks pass:

1. Update `README.md` — test counts, deploy IDs, move "On-chain verified intel" to Key Features
2. Update `docs/ARCHITECTURE.md` — add presence-attestation circuit, PresenceVKey, SUI event queries
3. Update `CLAUDE.md` — status to "ZK Phase 5 complete"
4. Update `circuits/README.md` — add presence-attestation circuit specs

### Test Count Summary

| Suite | Before | After |
|-------|--------|-------|
| Move contract | 39 | ~42 (39 + 3 new) |
| Frontend (Vitest) | 194 | ~203 (194 + 6 events + 2 parse + 1 transactions) |

### Risk Register

| Risk | Mitigation | Impact if realized |
|------|------------|-------------------|
| CCP's `location_hash` uses Poseidon2 (not Poseidon) | Circuit's `locationHash` check becomes audit-only, not cryptographic binding. Still valuable as a public input. | Medium — reduces trust binding from cryptographic to auditable. Core distance proof still works. |
| CCP redeploys world contracts during hackathon | Verify `WORLD_PACKAGE_ID` before deployment. Update if needed. | Low — just update the constant. |
| SUI RPC rate limit (100 req/30s) blocks event fetching | Cache event data in browser session. Batch queries. | Low — hackathon demo uses small event volumes. |
| Signed coordinate conversion to BN254 introduces bugs | AbsDiff hint pattern already handles this (proven in Phase 2 distance circuit). Use BigInt throughout. | Low — pattern is battle-tested. |

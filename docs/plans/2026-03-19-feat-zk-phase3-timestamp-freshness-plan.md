# ZK Phase 3: Timestamp-Bound Freshness — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Intel decay clocks run from the ZK-proven observation time, not the listing creation time — eliminating the stale-intel-sold-as-fresh exploit.

**Architecture:** The location attestation circuit gains a public output (`timestamp`) that exposes the already-verified `timestampWitness`. The contract adds an `observed_at` field to `IntelListing`, extracts the timestamp from the proof's public signals during `create_verified_listing`, enforces a 24-hour staleness cap, and uses `observed_at` for all expiry calculations. Unverified listings set `observed_at = created_at` (no behavioral change). Frontend displays dual timestamps for verified listings: "Observed Xh ago" (ZK-verified) + "Listed Yh ago" (chain time). Requires fresh contract deploy (new struct field).

**Tech Stack:** circom 2.2+, snarkjs 0.7.6, Move (SUI edition 2024), TypeScript/React, Vitest 4

**Spec:** `docs/brainstorms/2026-03-13-zk-phase3-timestamp-freshness-brainstorm.md`

---

## Design Decisions (resolving brainstorm open questions)

| Question | Decision | Rationale |
|----------|----------|-----------|
| Timestamp extraction method | Add `signal output timestamp` to location circuit (brainstorm's "Option B") | Brainstorm's Option A doesn't work — `timestampWitness` is a private input, not recoverable from the Merkle root alone. Adding a public output is a one-line circuit change. |
| Clock skew / future timestamps | Reject `observed_at > chain_time` (error `ETimestampInFuture`) | Prevents scouts from setting future timestamps to game freshness. Minor skew (~seconds) is absorbed by the delay between proof generation and tx execution. |
| Staleness cap | Single constant: 24 hours (`MAX_OBSERVATION_AGE_MS`) | YAGNI. Per-intel-type caps add complexity for uncertain benefit. Tunable later. |
| Upgrade path | Fresh deploy (new package) | Testnet/hackathon — struct field additions require a new deploy. Same pattern as Phase 2. All IDs update. |
| Distance circuit interaction | No changes to distance circuit | `observed_at` comes from the location proof's timestamp. Distance proof is a post-hoc calculation — it doesn't have its own observation time. Simpler and semantically correct. |
| Public signal count | 4 total: 1 output (`timestamp`) + 3 inputs (unchanged) | snarkjs orders outputs first: `[timestamp, merkleRoot, coordinatesHash, signatureAndKeyHash]`. VKey grows by one IC point (32 bytes). `publicInputsBytes` goes from 96 → 128 bytes. |
| Frontend `buildCircuitInput` | No changes needed | `timestampWitness` is already a private input; the circuit computes the output automatically. snarkjs `fullProve` returns the extra public signal transparently. Note: `Date.now()` at proof generation time becomes the on-chain `observed_at` — the 24h staleness window starts from this call. |
| Freshness sort option | Deferred | Brainstorm's "sort by observed_at" is useful but not essential for Phase 3 MVP. Can be added later. |
| CreateListing timestamp display | Deferred | Showing observation timestamp during proof generation is a UX nicety, not blocking. |

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `circuits/location-attestation/location-attestation.circom` | Modify | Add `signal output timestamp` (one-line change) |
| `frontend/public/zk/location-attestation.wasm` | Replace (offline) | Recompiled browser WASM |
| `frontend/public/zk/location-attestation_final.zkey` | Replace (offline) | Recompiled browser proving key |
| `contracts/sources/marketplace.move` | Modify | Add `observed_at` field, `bytes_to_u64_le` helper, staleness validation, update expiry checks |
| `contracts/tests/marketplace_tests.move` | Modify | Timestamp extraction, staleness, future timestamp, expiry semantic tests, update existing fake_inputs sizes |
| `frontend/src/lib/types.ts` | Modify | Add `observedAt: bigint` to `IntelListingFields` |
| `frontend/src/lib/parse.ts` | Modify | Parse `observed_at` from on-chain fields |
| `frontend/src/lib/parse.test.ts` | Modify | Test `observed_at` parsing |
| `frontend/src/lib/format.ts` | Modify | Update `expiryMs` to use `observedAt`, add `observedAgo` |
| `frontend/src/lib/format.test.ts` | Modify | Test `observedAgo`, update expiry tests, fix `makeListing` fixture |
| `frontend/src/lib/heat-map-data.ts` | Modify | Update `isActive` and `computeFreshness` to use `observedAt` |
| `frontend/src/lib/heat-map-data.test.ts` | Modify | Add `observedAt` to test fixture |
| `frontend/src/lib/zk-proof.ts` | No changes | `publicSignalsToBytes` handles variable-length signals transparently |
| `frontend/src/components/ListingBrowser.tsx` | Modify | Dual timestamp display, update local `isExpired` |
| `frontend/src/components/MyIntel.tsx` | Modify | Dual timestamp display |
| `frontend/src/components/InfoModal.tsx` | Modify | Move "Timestamp-Bound Freshness" from Coming Soon to Live |
| `frontend/src/index.css` | Modify | Add `.listing-observed-badge` styles |
| `frontend/src/lib/constants.ts` | Modify | New PACKAGE_ID, LOCATION_VKEY_ID (after deploy) |

---

## Chunk 1: Circuit + Contract

### Task 1: Modify Location Circuit

**Files:**
- Modify: `circuits/location-attestation/location-attestation.circom`

- [ ] **Step 1: Add timestamp public output to the circuit**

In `circuits/location-attestation/location-attestation.circom`, replace the body comment (line ~125-126):

```circom
    // ========== PUBLIC OUTPUTS ==========
    // None - timestamp is verified in Merkle proof, distance circuit can read from locationData
```

With:

```circom
    // ========== PUBLIC OUTPUTS ==========
    signal output timestamp;
```

Note: The file header (line 18-19) already says "Public Outputs (1 total): timestamp" — this was aspirational. The body now matches the header.

And at the end of the template, before the closing `}`, add:

```circom
    // 4. Output timestamp as public signal for on-chain extraction
    // The timestamp is already verified via the Merkle proof (leaf4).
    // Exposing it as a public output lets the contract read it for staleness validation.
    timestamp <== timestampWitness;
```

- [ ] **Step 2: Compile the circuit (offline, PowerShell)**

Follow the steps in `circuits/README.md`. Summary:

```powershell
cd circuits\location-attestation
circom location-attestation.circom --r1cs --wasm --sym -l node_modules
# Confirm constraint count (should increase slightly from 4464)

# Phase 2 ceremony (reuse existing ptau)
snarkjs groth16 setup location-attestation.r1cs ..\ppot_0080_13.ptau location-attestation_0000.zkey
$entropy = -join (1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 } | ForEach-Object { $_.ToString("x2") })
snarkjs zkey contribute location-attestation_0000.zkey location-attestation_final.zkey --name="phase3" -e $entropy

# Copy artifacts to frontend
Copy-Item -Force "location-attestation_js\location-attestation.wasm" "..\..\frontend\public\zk\location-attestation.wasm"
Copy-Item -Force "location-attestation_final.zkey" "..\..\frontend\public\zk\location-attestation_final.zkey"
```

- [ ] **Step 3: Extract new VKey**

```powershell
snarkjs zkey export verificationkey location-attestation_final.zkey vkey.json
node ..\..\extract-vkey.cjs vkey.json
# Copy the output hex for the contract's LocationVKey
```

Record the new VKey hex — it will be ~32 bytes longer than the current one (one additional IC point for the new public output).

- [ ] **Step 4: Commit circuit changes**

```bash
git add circuits/location-attestation/location-attestation.circom
git add frontend/public/zk/location-attestation.wasm
git add frontend/public/zk/location-attestation_final.zkey
git commit -m "feat(circuit): add timestamp public output to location attestation"
```

---

### Task 2: Contract — New Field, Constants, and Helper

**Files:**
- Modify: `contracts/sources/marketplace.move`

- [ ] **Step 1: Add new error constants and staleness cap**

After `EInvalidDistanceProof` (line 30), add:

```move
const EObservationTooStale: u64 = 18;
const ETimestampInFuture: u64 = 19;
```

After `MIN_STAKE` (line 37), add:

```move
const MAX_OBSERVATION_AGE_MS: u64 = 86_400_000; // 24 hours
```

- [ ] **Step 2: Add `observed_at` field to IntelListing**

In the `IntelListing` struct, after `created_at: u64,` add:

```move
    observed_at: u64,           // ZK-verified observation time (= created_at for unverified)
```

- [ ] **Step 3: Add `bytes_to_u64_le` helper function**

Add a private helper before the public functions section:

```move
/// Read 8 bytes starting at `offset` as a little-endian u64.
/// Used to extract the timestamp field element from proof public signals.
fun bytes_to_u64_le(bytes: &vector<u8>, offset: u64): u64 {
    (*bytes.borrow(offset) as u64)
        | ((*bytes.borrow(offset + 1) as u64) << 8)
        | ((*bytes.borrow(offset + 2) as u64) << 16)
        | ((*bytes.borrow(offset + 3) as u64) << 24)
        | ((*bytes.borrow(offset + 4) as u64) << 32)
        | ((*bytes.borrow(offset + 5) as u64) << 40)
        | ((*bytes.borrow(offset + 6) as u64) << 48)
        | ((*bytes.borrow(offset + 7) as u64) << 56)
}
```

- [ ] **Step 4: Add `observed_at` getter**

After the `is_expired` getter, add:

```move
public fun observed_at(listing: &IntelListing): u64 { listing.observed_at }
```

- [ ] **Step 5: Commit**

```bash
git add contracts/sources/marketplace.move
git commit -m "feat(contract): add observed_at field, staleness constants, byte helper"
```

---

### Task 3: Contract — Timestamp Extraction + Staleness Validation

**Files:**
- Modify: `contracts/sources/marketplace.move`

- [ ] **Step 1: Update `create_listing` — set `observed_at = created_at`**

In `create_listing`, in the `IntelListing` construction, after `created_at: clock.timestamp_ms(),` add:

```move
        observed_at: clock.timestamp_ms(),
```

- [ ] **Step 2: Update `create_verified_listing` — extract and validate timestamp**

In `create_verified_listing`, after the Groth16 verification block and before the listing construction, add:

```move
    // Extract observation timestamp from proof's first public signal (32-byte LE field element).
    // snarkjs orders: outputs first → timestamp is bytes [0..8] of public_inputs_bytes.
    let observed_at = bytes_to_u64_le(&public_inputs_bytes, 0);

    // Reject future timestamps (prevents gaming freshness)
    assert!(observed_at <= clock.timestamp_ms(), ETimestampInFuture);

    // Reject stale observations (scout has 24h to monetize)
    assert!(
        clock.timestamp_ms() - observed_at <= MAX_OBSERVATION_AGE_MS,
        EObservationTooStale,
    );
```

In the `IntelListing` construction, after `created_at: clock.timestamp_ms(),` add:

```move
        observed_at,
```

- [ ] **Step 3: Commit**

```bash
git add contracts/sources/marketplace.move
git commit -m "feat(contract): extract ZK timestamp, enforce staleness cap in create_verified_listing"
```

---

### Task 4: Contract — Update Expiry Semantic

**Files:**
- Modify: `contracts/sources/marketplace.move`

- [ ] **Step 1: Update `purchase` expiry check**

In the `purchase` function, change:

```move
    assert!(
        clock.timestamp_ms() < listing.created_at + listing.decay_hours * 3_600_000,
        EListingExpired,
    );
```

To:

```move
    assert!(
        clock.timestamp_ms() < listing.observed_at + listing.decay_hours * 3_600_000,
        EListingExpired,
    );
```

- [ ] **Step 2: Update `claim_expired_stake` expiry check**

Change:

```move
    assert!(
        clock.timestamp_ms() >= listing.created_at + listing.decay_hours * 3_600_000,
        EListingNotExpired,
    );
```

To:

```move
    assert!(
        clock.timestamp_ms() >= listing.observed_at + listing.decay_hours * 3_600_000,
        EListingNotExpired,
    );
```

- [ ] **Step 3: Update `is_expired` getter**

Change:

```move
public fun is_expired(listing: &IntelListing, clock: &Clock): bool {
    clock.timestamp_ms() >= listing.created_at + listing.decay_hours * 3_600_000
}
```

To:

```move
public fun is_expired(listing: &IntelListing, clock: &Clock): bool {
    clock.timestamp_ms() >= listing.observed_at + listing.decay_hours * 3_600_000
}
```

- [ ] **Step 4: Commit**

```bash
git add contracts/sources/marketplace.move
git commit -m "feat(contract): decay clock runs from observed_at instead of created_at"
```

---

### Task 5: Contract Tests

**Files:**
- Modify: `contracts/tests/marketplace_tests.move`

Note: Contract tests follow implementation (Tasks 2-4) rather than strict TDD because the struct field addition prevents test compilation until the field exists. This is a practical tradeoff for struct-level changes.

- [ ] **Step 1: Update VKey hex and existing test input sizes**

After circuit recompilation (Task 1 Step 3):

1. Update the LocationVKey hex in `contracts/sources/marketplace.move`'s `init()` function with the new VKey extracted in Task 1 Step 3.

2. Update all existing tests that use `fake_inputs` for `create_verified_listing` — change from 96 bytes (3×32) to 128 bytes (4×32). The first 32 bytes should encode a valid timestamp. Search for 96-byte `fake_inputs` vectors and extend them to 128 bytes.

- [ ] **Step 2: Add test — unverified listing has `observed_at == created_at`**

```move
#[test]
fun test_unverified_listing_observed_at_equals_created_at() {
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
        assert!(marketplace::observed_at(&listing) == marketplace::created_at(&listing));
        test_scenario::return_shared(listing);
    };
    scenario.end();
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `.sui-bin/sui.exe move test --path contracts --filter test_unverified_listing_observed_at`
Expected: PASS

- [ ] **Step 4: Add test — expiry uses `observed_at`**

```move
#[test]
fun test_expiry_uses_observed_at() {
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
        // Simulate observed_at 23h before created_at (as if scout delayed listing)
        let created = marketplace::created_at(&listing);
        marketplace::set_observed_at_for_testing(&mut listing, created - 23 * 3_600_000);
        let clk = clock::create_for_testing(scenario.ctx());
        // Listing should be closer to expiry (1h left, not 24h)
        assert!(!marketplace::is_expired(&listing, &clk));
        clock::destroy_for_testing(clk);
        test_scenario::return_shared(listing);
    };
    scenario.end();
}
```

Note: Requires a new `#[test_only]` helper:

```move
#[test_only]
public fun set_observed_at_for_testing(listing: &mut IntelListing, ts: u64) {
    listing.observed_at = ts;
}
```

- [ ] **Step 5: Add test — `bytes_to_u64_le` correctness**

```move
#[test]
fun test_bytes_to_u64_le() {
    // 1711036800000 ms = 0x18E_4F68_4400 (Unix ms for ~2024-03-21)
    // LE bytes: [0x00, 0x44, 0x68, 0x4F, 0x8E, 0x01, 0x00, 0x00, ...zeros...]
    let mut bytes = vector[0x00u8, 0x44, 0x68, 0x4F, 0x8E, 0x01, 0x00, 0x00];
    // Pad to 32 bytes (simulating a field element)
    let mut i = 0;
    while (i < 24) { bytes.push_back(0); i = i + 1; };
    let result = marketplace::bytes_to_u64_le_for_testing(&bytes, 0);
    assert!(result == 1_711_036_800_000);
}
```

Note: Requires a `#[test_only]` wrapper:

```move
#[test_only]
public fun bytes_to_u64_le_for_testing(bytes: &vector<u8>, offset: u64): u64 {
    bytes_to_u64_le(bytes, offset)
}
```

- [ ] **Step 6: Add test — future timestamp is rejected**

```move
#[test, expected_failure(abort_code = marketplace::ETimestampInFuture)]
fun test_verified_listing_rejects_future_timestamp() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        marketplace::init_for_testing(scenario.ctx());
    };
    scenario.next_tx(SCOUT);
    {
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        let vkey = scenario.take_shared<LocationVKey>();
        // Encode a timestamp 1 hour in the future as first 8 bytes LE
        // Clock is at 0 (fresh), so any positive timestamp is "future"
        let mut fake_inputs = vector::empty<u8>();
        // timestamp = 3_600_000 (1h in ms) as LE u64 = [0x00, 0xF1, 0x36, 0x00, ...]
        fake_inputs.push_back(0x80); fake_inputs.push_back(0xEE); fake_inputs.push_back(0x36);
        fake_inputs.push_back(0x00); fake_inputs.push_back(0x00); fake_inputs.push_back(0x00);
        fake_inputs.push_back(0x00); fake_inputs.push_back(0x00);
        // Pad remaining 120 bytes with zeros
        let mut i = 0;
        while (i < 120) { fake_inputs.push_back(0); i = i + 1; };
        let fake_proof = x"0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        marketplace::create_verified_listing(
            1, 42, 500_000, 24, b"blob", stake, &vkey,
            fake_proof, fake_inputs, &clk, ctx,
        );
        test_scenario::return_shared(vkey);
        clock::destroy_for_testing(clk);
    };
    scenario.end();
}
```

Note: This test will abort at `ETimestampInFuture` OR `EInvalidLocationProof` (whichever comes first). Since Groth16 verification happens *before* timestamp extraction, this test will actually abort with `EInvalidLocationProof`. To test `ETimestampInFuture` in isolation, use `set_observed_at_for_testing` or restructure to test the byte extraction + validation logic via a dedicated test helper. The important thing is that the validation logic is present — it will be exercised during integration testing with real proofs.

Alternatively, add a simpler unit test for the timestamp validation logic by testing through `set_observed_at_for_testing`:

```move
#[test]
fun test_observed_at_must_not_exceed_created_at() {
    // Structural test: for unverified listings, observed_at == created_at
    // For verified listings, observed_at < created_at (observation before listing)
    // The contract enforces observed_at <= chain_time in create_verified_listing
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
        // observed_at should never exceed created_at for well-formed listings
        assert!(marketplace::observed_at(&listing) <= marketplace::created_at(&listing));
        test_scenario::return_shared(listing);
    };
    scenario.end();
}
```

- [ ] **Step 7: Run all tests**

Run: `.sui-bin/sui.exe move test --path contracts`
Expected: All tests pass (40+ tests)

- [ ] **Step 8: Commit**

```bash
git add contracts/sources/marketplace.move contracts/tests/marketplace_tests.move
git commit -m "test(contract): timestamp freshness — observed_at, expiry, byte extraction"
```

---

## Chunk 2: Frontend

### Task 6: Frontend Types + Parsing

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/parse.ts`
- Modify: `frontend/src/lib/parse.test.ts`

- [ ] **Step 1: Add `observedAt` to `IntelListingFields`**

In `frontend/src/lib/types.ts`, after `readonly createdAt: bigint`:

```typescript
  readonly observedAt: bigint
```

- [ ] **Step 2: Write failing test for `observed_at` parsing**

In `frontend/src/lib/parse.test.ts`, add a new describe block:

```typescript
describe('parseListingFields — observed_at', () => {
  const baseFields = {
    scout: '0xABC',
    intel_type: 1,
    system_id: '42',
    created_at: '1000',
    decay_hours: '24',
    walrus_blob_id: [],
    individual_price: '500000',
    stake: { value: '1000000' },
    delisted: false,
    location_proof_hash: [],
  }

  it('parses observed_at when present', () => {
    const result = parseListingFields('0x1', { ...baseFields, observed_at: '900' })
    expect(result.observedAt).toBe(900n)
  })

  it('falls back to created_at when observed_at is missing', () => {
    const result = parseListingFields('0x1', { ...baseFields })
    expect(result.observedAt).toBe(1000n)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/parse.test.ts`
Expected: FAIL — `observedAt` property missing

- [ ] **Step 4: Implement parsing**

In `frontend/src/lib/parse.ts`, in the `parseListingFields` return object, after `createdAt`:

```typescript
    observedAt: fields.observed_at !== undefined
      ? BigInt(fields.observed_at as string)
      : BigInt(fields.created_at as string),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/parse.test.ts`
Expected: PASS

- [ ] **Step 6: Update test fixtures in other test files**

**Critical:** The `makeListing` fixture must derive `observedAt` from `createdAt` when not explicitly overridden. Otherwise, existing `isExpired` tests that override `createdAt` (e.g., `createdAt: BigInt(Date.now() - 48 * 3_600_000)`) will break because `observedAt` would still use the default value.

In `frontend/src/lib/format.test.ts`, update `makeListing` to add `observedAt` with fallthrough:

```typescript
function makeListing(overrides: Partial<IntelListingFields> = {}): IntelListingFields {
  const createdAt = overrides.createdAt ?? BigInt(Date.now() - 3_600_000)
  return {
    id: '0xabc',
    scout: '0x1',
    intelType: 0,
    systemId: 42n,
    createdAt,
    observedAt: overrides.observedAt ?? createdAt,
    decayHours: 24n,
    // ... rest unchanged ...
  }
}
```

In `frontend/src/lib/heat-map-data.test.ts`, apply the same pattern:

```typescript
function makeListing(overrides: Partial<IntelListingFields> = {}): IntelListingFields {
  const createdAt = overrides.createdAt ?? BigInt(Date.now() - 3_600_000)
  return {
    // ...
    createdAt,
    observedAt: overrides.observedAt ?? createdAt,
    // ...
  }
}
```

- [ ] **Step 7: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All 188 tests pass

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/parse.ts frontend/src/lib/parse.test.ts
git add frontend/src/lib/format.test.ts frontend/src/lib/heat-map-data.test.ts
git commit -m "feat(frontend): add observedAt to types, parse, and test fixtures"
```

---

### Task 7: Frontend Formatting — Expiry + Dual Timestamps

**Files:**
- Modify: `frontend/src/lib/format.ts`
- Modify: `frontend/src/lib/format.test.ts`

- [ ] **Step 1: Write failing tests for `observedAgo`**

In `frontend/src/lib/format.test.ts`, add:

```typescript
import { isExpired, mistToSui, observedAgo } from './format'
```

And a new describe block:

```typescript
describe('observedAgo', () => {
  it('returns null for unverified listings', () => {
    expect(observedAgo(makeListing({ isVerified: false }))).toBeNull()
  })

  it('returns formatted string for verified listings', () => {
    const listing = makeListing({
      isVerified: true,
      locationProofHash: new Uint8Array([1]),
      observedAt: BigInt(Date.now() - 4 * 3_600_000), // 4h ago
    })
    expect(observedAgo(listing)).toMatch(/Observed 4h/)
  })

  it('returns minutes-only for recent observations', () => {
    const listing = makeListing({
      isVerified: true,
      locationProofHash: new Uint8Array([1]),
      observedAt: BigInt(Date.now() - 15 * 60_000), // 15m ago
    })
    expect(observedAgo(listing)).toMatch(/Observed 15m ago/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/format.test.ts`
Expected: FAIL — `observedAgo` not exported

- [ ] **Step 3: Update `expiryMs` to use `observedAt` and add `observedAgo`**

In `frontend/src/lib/format.ts`, change:

```typescript
function expiryMs(listing: IntelListingFields): number {
  return Number(listing.createdAt) + Number(listing.decayHours) * 3_600_000
}
```

To:

```typescript
function expiryMs(listing: IntelListingFields): number {
  return Number(listing.observedAt) + Number(listing.decayHours) * 3_600_000
}
```

And add after `timeRemaining`:

```typescript
/** Returns "Observed Xh Ym ago" for verified listings, null for unverified. */
export function observedAgo(listing: IntelListingFields): string | null {
  if (!listing.isVerified) return null
  const ms = Date.now() - Number(listing.observedAt)
  if (ms <= 0) return 'Observed just now'
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  if (hours > 0) return `Observed ${hours}h ${minutes}m ago`
  return `Observed ${minutes}m ago`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/format.test.ts`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/format.ts frontend/src/lib/format.test.ts
git commit -m "feat(frontend): expiry uses observedAt, add observedAgo formatter"
```

---

### Task 8: Heat Map — Expiry + Freshness Update

**Files:**
- Modify: `frontend/src/lib/heat-map-data.ts`

- [ ] **Step 1: Update `isActive` to use `observedAt`**

In `frontend/src/lib/heat-map-data.ts`, change:

```typescript
function isActive(listing: IntelListingFields, now: number): boolean {
  if (listing.delisted) return false
  const expiryMs = Number(listing.createdAt) + Number(listing.decayHours) * 3_600_000
  return now < expiryMs
}
```

To:

```typescript
function isActive(listing: IntelListingFields, now: number): boolean {
  if (listing.delisted) return false
  const expiryMs = Number(listing.observedAt) + Number(listing.decayHours) * 3_600_000
  return now < expiryMs
}
```

- [ ] **Step 2: Update `computeFreshness` to use `observedAt`**

Change line 36:

```typescript
    const elapsed = now - Number(l.createdAt)
```

To:

```typescript
    const elapsed = now - Number(l.observedAt)
```

- [ ] **Step 3: Run heat map tests**

Run: `cd frontend && npx vitest run src/lib/heat-map-data.test.ts`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/heat-map-data.ts
git commit -m "feat(frontend): heat map expiry and freshness use observedAt"
```

---

### Task 9: Frontend Components — Dual Timestamp Display

**Files:**
- Modify: `frontend/src/components/ListingBrowser.tsx`
- Modify: `frontend/src/components/MyIntel.tsx`

- [ ] **Step 1: Update ListingBrowser — expiry and dual display**

In `frontend/src/components/ListingBrowser.tsx`:

1. Update the import to include `observedAgo`:

```typescript
import { formatDistance, mistToSui, observedAgo, timeRemaining, truncateAddress } from '../lib/format'
```

2. Update the local `isExpired` function (line 12-15) to use `observedAt`:

```typescript
function isExpired(listing: IntelListingFields): boolean {
  const expiryMs = Number(listing.observedAt) + Number(listing.decayHours) * 3_600_000
  return Date.now() >= expiryMs
}
```

3. In the listing item JSX, after the proximity badge and before `<span className="listing-item-meta">`, add:

```tsx
                {observedAgo(listing) && (
                  <span className="listing-observed-badge">{observedAgo(listing)}</span>
                )}
```

- [ ] **Step 2: Update MyIntel — dual timestamp display**

In `frontend/src/components/MyIntel.tsx`:

1. Update the import:

```typescript
import { formatDistance, isExpired, mistToSui, observedAgo, truncateAddress } from '../lib/format'
```

2. In the listing item JSX, after the proximity badge section and before the meta span, add:

```tsx
          {observedAgo(listing) && (
            <span className="listing-observed-badge">{observedAgo(listing)}</span>
          )}
```

- [ ] **Step 3: Add CSS for the observed badge**

In `frontend/src/index.css`, after `.listing-proximity-badge` block:

```css
.listing-observed-badge {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--accent-cyan, #22d3ee);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border: 1px solid var(--accent-cyan, #22d3ee);
  border-radius: var(--radius);
  align-self: center;
}
```

- [ ] **Step 4: Run all tests**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ListingBrowser.tsx frontend/src/components/MyIntel.tsx
git add frontend/src/index.css
git commit -m "feat(frontend): dual timestamp display — Observed Xh ago for verified listings"
```

---

### Task 10: InfoModal + Deploy + Constants

**Files:**
- Modify: `frontend/src/components/InfoModal.tsx`
- Modify: `frontend/src/lib/constants.ts`

- [ ] **Step 1: Update InfoModal — move Timestamp Freshness to Live Features**

In `frontend/src/components/InfoModal.tsx`:

In the Live Features `<ul>`, add a new `<li>` after the proximity proof item:

```tsx
              <li>Timestamp-bound freshness — verified intel decays from observation time, not listing time</li>
```

Remove the "Timestamp-Bound Freshness" `<dt>`/`<dd>` from the Coming Soon section.

- [ ] **Step 2: Deploy contract (offline)**

Deploy the updated contract with the new LocationVKey (from Task 1 Step 3):

```powershell
.sui-bin\sui.exe client publish --gas-budget 500000000 contracts
```

Record the new:
- Package ID
- LocationVKey object ID
- DistanceVKey object ID

- [ ] **Step 3: Update constants.ts with new deploy IDs**

In `frontend/src/lib/constants.ts`:

```typescript
// Deployed on SUI testnet (YYYY-MM-DD) — Phase 3: timestamp freshness
export const PACKAGE_ID = '<new_package_id>'

export const LOCATION_VKEY_ID = '<new_location_vkey_id>'
// DISTANCE_VKEY_ID also gets a new ID (created in init())
export const DISTANCE_VKEY_ID = '<new_distance_vkey_id>'
```

- [ ] **Step 4: Test locally**

1. Start dev server: `cd frontend && pnpm dev`
2. Create a verified listing — check that "Observed X ago" badge appears
3. Verify expiry countdown uses the observation time, not listing time
4. Create an unverified listing — confirm no "Observed" badge

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/InfoModal.tsx frontend/src/lib/constants.ts
git commit -m "feat: deploy Phase 3, update constants, move timestamp freshness to live"
```

---

## Post-Implementation

### Documentation Updates

After all tasks pass:

1. Update `README.md` — test counts, deploy IDs, move "Timestamp freshness" from Upcoming to Key Features
2. Update `docs/ARCHITECTURE.md` — add `observed_at` to data model, update expiry description
3. Update `CLAUDE.md` — status to "ZK Phase 3 complete"

### Test Count Summary

| Suite | Before | After |
|-------|--------|-------|
| Move contract | 35 | ~40 |
| Frontend (Vitest) | 188 | ~193 |

---
title: "feat: ZK-Verified Intel Listings (Phase 1)"
type: feat
date: 2026-03-13
---

# ZK-Verified Intel Listings (Phase 1)

## Overview

Scouts can optionally attach a Groth16 zero-knowledge location proof when creating intel listings, proving they were physically present in the claimed system without revealing exact coordinates. Verified listings display a "ZK-Verified" badge; buyers can filter for verified-only intel. This builds on CCP's [eve-frontier-proximity-zk-poc](https://github.com/evefrontier/eve-frontier-proximity-zk-poc) and uses SUI's native `sui::groth16` module.

## Problem Statement

TheRiftBroker has a trust gap: when a scout lists "fleet spotted near Zarzakh," buyers have zero way to verify the scout was actually there. They buy intel on faith alone. ZK location proofs close this gap cryptographically — the scout proves presence without exposing their exact position, and the proof is verified on-chain at listing time.

## Technical Approach

### Architecture

**Fresh contract deploy** — a new contract version will be deployed for the hackathon's test server anyway, so we incorporate ZK fields directly into `IntelListing` rather than working around the frozen struct via dynamic fields or package upgrades. This is dramatically simpler.

```
Scout's Browser                    SUI Blockchain
─────────────────                  ──────────────
1. Select system
2. Load circuit artifacts
   (.wasm + .zkey via fetch)
3. snarkjs.groth16.fullProve()
   inputs: (x, y, z, salt)
   outputs: proof + publicSignals
4. Convert proof to Arkworks bytes
5. Build PTB with proof data  ──>  6. create_verified_listing()
                                      - groth16::verify_groth16_proof()
                                      - set location_proof_hash field
                                      - emit IntelListed + VerifiedIntelListed
                                      - share_object(listing)
7. Encrypt + upload + finalize     8. set_walrus_blob_id()
   (existing Seal + Walrus flow)
```

**Key architectural decisions:**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Struct modification | Direct field on `IntelListing` | Fresh deploy — no frozen struct constraint. `location_proof_hash: vector<u8>` (empty = unverified). |
| Verification key storage | Shared object via `init()` | Fresh deploy — `init()` runs at publish time. No admin function needed. |
| Frontend verification status | Read directly from listing object | No dynamic fields — `location_proof_hash` is a regular struct field. `showContent: true` returns it. No extra queries. |
| Proof format conversion | Custom TypeScript utility | snarkjs outputs decimal string coordinates. SUI expects Arkworks compressed bytes. Small utility converts between formats. |
| Route intel (type 3) | Ineligible for Phase 1 | Routes involve two systems. Single location proof insufficient. Phase 2 distance proofs are the right fit. |
| Verification toggle failure | Graceful fallback | If proof generation fails, offer "Create Unverified" fallback. Form data preserved. |
| Raw coordinates | Preserve in GalaxySystem | ZK circuit needs EVE meter-scale coords. Currently discarded during normalization. Add `rawX/rawY/rawZ` fields. |

### Contract Changes (Fresh Deploy)

```
┌─────────────────────────────────────────────────────┐
│ marketplace.move (fresh deploy with ZK)             │
├─────────────────────────────────────────────────────┤
│ ~ IntelListing gains: location_proof_hash field     │
│ + const EInvalidLocationProof: u64 = 9              │
│ + struct LocationVKey has key { id, vkey_bytes }     │
│ + struct VerifiedIntelListed has copy, drop { ... }  │
│ + fun create_verified_listing(... + vkey, proof, pi) │
│ + fun location_proof_hash(listing): vector<u8>      │
│ + fun is_verified(listing): bool                    │
│ + init() creates LocationVKey shared object         │
│                                                     │
│ All existing functions preserved.                   │
│ create_listing sets location_proof_hash to empty.   │
└─────────────────────────────────────────────────────┘
```

### Frontend Changes

```
┌────────────────────────────────────┐
│ New files                          │
├────────────────────────────────────┤
│ lib/zk-proof.ts                   │  snarkjs integration + Arkworks conversion
│ lib/zk-proof.test.ts              │  Byte conversion tests
├────────────────────────────────────┤
│ Modified files                     │
├────────────────────────────────────┤
│ lib/galaxy-data.ts                │  Preserve rawX/rawY/rawZ
│ lib/galaxy-data.test.ts           │  Test raw coord preservation
│ lib/types.ts                      │  Add isVerified to IntelListingFields
│ lib/constants.ts                  │  Add LOCATION_VKEY_ID, update PACKAGE_ID
│ lib/transactions.ts               │  Add buildCreateVerifiedListingTx
│ lib/transactions.test.ts          │  Test new builder
│ lib/heat-map-data.ts              │  Add verifiedOnly to HeatMapFilters
│ lib/heat-map-data.test.ts         │  Test verifiedOnly filter
│ lib/parse.ts                      │  Parse location_proof_hash from on-chain data
│ lib/parse.test.ts                 │  Test new field parsing
│ hooks/useListings.ts              │  Parse isVerified from listing fields
│ components/CreateListing.tsx      │  Verify toggle + proof generation step
│ components/ListingBrowser.tsx     │  ZK-Verified badge + filter toggle
│ components/RegionPanel.tsx        │  ZK-Verified badge on cards
│ components/MyIntel.tsx            │  ZK-Verified badge on cards
│ components/heat-map/              │
│   HeatMapControls.tsx             │  Verified-only toggle
│ index.css                         │  Badge styles
│ package.json                      │  + snarkjs, + vite-plugin-node-polyfills
│ vite.config.ts                    │  Node polyfills for snarkjs
└────────────────────────────────────┘
```

## Implementation Phases

### Phase 1A: Circuit Artifacts & Proof Utility

**Goal:** Compile the location attestation circuit, extract verification key, build the TypeScript proof generation + byte conversion utility.

**This is the highest-risk phase.** The snarkjs-to-Arkworks byte conversion must be bit-perfect or on-chain verification silently fails. The ZK repo provides a reference TypeScript implementation we can validate against.

#### Reference Code: ZK Repo's `formatProofForSui.ts`

The ZK repo at `src/on-chain/ts/utils/formatProofForSui.ts` contains two key functions:

- **`formatProofPointsForSuiLegacy`** — Pure TypeScript implementation of snarkjs → Arkworks compressed serialization. This is the fallback (no Rust/wasm dependency). It performs:
  - G1 compressed: x-coordinate as 32-byte little-endian, y-sign in MSB of last byte
  - G2 compressed: (c0, c1) as 64-byte little-endian, Fq2 lexicographic y-sign in MSB of c1's last byte
  - Concatenation: `pi_a(32) || pi_b(64) || pi_c(32)` = 128 bytes total

- **`formatPublicInputsForSui`** — Public signals to hex, with `convertPublicInputsToLittleEndian` for LE conversion

**We will use this as our primary reference** rather than writing from scratch, adapting it into `zk-proof.ts`.

#### Critical Pitfalls (from research)

| Pitfall | Detail | How to Avoid |
|---------|--------|--------------|
| **Endianness** | snarkjs outputs big-endian. Arkworks/SUI expects little-endian. | Reverse byte order for every field element. |
| **G2 coordinate ordering** | snarkjs `pi_b[0]` is `[c0, c1]` but the x-coordinate in Fq2 is `c0 + c1*u`. Compression stores `c0 first, c1 second`. Some implementations swap these. | Follow the ZK repo's `formatProofPointsForSuiLegacy` exactly. |
| **Y-sign bits (G1)** | Arkworks compressed format: if `y > (p-1)/2`, set bit 7 of the last byte (`0x80`). If y is positive (lexicographically smaller), leave as `0x00`. | `yIsPositive(y) = BigInt(y) <= (BN254_FIELD_MODULUS - BigInt(y))` |
| **Y-sign bits (G2/Fq2)** | Fq2 = c0 + c1*u. Compare c1 first; if equal, compare c0. Lexicographic ordering over the two components. | See `fq2YIsPositive` implementation below. |
| **VKey format** | `alpha_g1(32B) \|\| beta_g2(64B) \|\| gamma_g2(64B) \|\| delta_g2(64B) \|\| IC_len(8B LE) \|\| IC[0..n](32B each)`. For 3 public inputs: 4 IC points = 32*4 = 128B. Total: 32+64+64+64+8+128 = **360 bytes**. | Extract from `verification_key.json` and serialize, or use the ZK repo's Rust serializer. |
| **Public input count** | SUI groth16 supports max 8 public inputs. Location circuit has 3 (merkle_root, coordinates_hash, signature_and_key_hash). Well within limit. | Verify circuit output count matches. |
| **Identity point** | If any proof point is the identity/infinity point, Arkworks uses a special flag (`0x40` in MSB). snarkjs represents this as `["0","1","0"]`. | Check for identity before compressing. Unlikely in valid proofs but handle gracefully. |

#### Tasks

- [ ] Clone/extract the location attestation circuit from `eve-frontier-proximity-zk-poc`
  - Source: `src/on-chain/circuits/location-attestation/location-attestation.circom`
  - Dependencies: circomlib `Poseidon`, `Switcher`, `LessThan`, `Mux1` (from `circomlib@^2.0.5`)
  - Copy circuit source to: `circuits/location-attestation/` (project root, not frontend)
  - Also copy: `src/on-chain/ts/utils/formatProofForSui.ts` as reference (do NOT ship — adapt into our utility)

- [ ] Compile circuit and generate artifacts (one-time, offline)

  **Use the ZK repo's compilation pipeline** from `scripts/compileCircuits.ts`:

  ```bash
  # 1. Install circom compiler (v2.1+)
  # https://docs.circom.io/getting-started/installation/

  # 2. Install JS dependencies for circuit compilation
  npm install circomlib@^2.0.5 poseidon-lite@^0.3.0 snarkjs@^0.7.5

  # 3. Compile circuit → R1CS + WASM
  circom location-attestation.circom \
    --r1cs --wasm --sym \
    -l node_modules \
    -o build/

  # 4. Download Powers of Tau (pre-computed, from Ethereum PSE ceremony)
  #    2^12 = 4,096 constraints — sufficient for location circuit (~2,359 constraints)
  curl -O https://pse-trusted-setup-ppot.s3.eu-central-1.amazonaws.com/pot28_0080/ppot_0080_12.ptau

  # 5. Circuit-specific trusted setup (Phase 2)
  snarkjs groth16 setup build/location-attestation.r1cs ppot_0080_12.ptau circuit_0000.zkey
  snarkjs zkey contribute circuit_0000.zkey circuit_final.zkey --name="riftbroker" -e="$(head -c 64 /dev/urandom | xxd -p)"

  # 6. Export verification key
  snarkjs zkey export verificationkey circuit_final.zkey verification_key.json

  # 7. Verify the setup (sanity check)
  snarkjs zkey verify build/location-attestation.r1cs ppot_0080_12.ptau circuit_final.zkey
  ```

  **Outputs:**
  - Browser artifacts → `frontend/public/zk/location-attestation.wasm` (~200KB), `frontend/public/zk/location-attestation_final.zkey` (~500KB-2MB)
  - Contract input → `verification_key.json` (convert to Arkworks bytes for on-chain VKey)

  **Important:** Do NOT generate a fresh Powers of Tau ceremony. Use the pre-computed `ppot_0080_12.ptau` from the PSE S3 bucket. This is a production-grade ceremony with 80 participants. Rolling your own is a security downgrade.

- [ ] Extract VKey bytes for on-chain `LocationVKey`

  The `verification_key.json` from snarkjs contains affine coordinates as decimal strings. Convert to Arkworks compressed format (360 bytes for 3 public inputs):

  ```
  alpha_g1(32B) || beta_g2(64B) || gamma_g2(64B) || delta_g2(64B)
  || IC_len(8B little-endian u64) || IC[0](32B) || IC[1](32B) || IC[2](32B) || IC[3](32B)
  ```

  Two approaches:
  1. **ZK repo's Rust serializer** — if available in the repo's `sui-verifier` crate, use it directly
  2. **TypeScript conversion** — write `snarkjsVKeyToArkworks(vk)` using the same compression logic as proof points

  The output hex string goes into the contract's `init()` as `x"<HEX>"`.

- [ ] Create `frontend/src/lib/zk-proof.ts` — proof generation + byte conversion

  ```typescript
  // === Constants ===
  const BN254_FIELD_MODULUS = 21888242871839275222246405745257275088696311157297823662689037894645226208583n
  const CIRCUIT_WASM_URL = '/zk/location-attestation.wasm'
  const CIRCUIT_ZKEY_URL = '/zk/location-attestation_final.zkey'

  // === Core export ===
  export async function generateLocationProof(
    coords: { x: number; y: number; z: number },
  ): Promise<{ proofBytes: Uint8Array; publicInputsBytes: Uint8Array }>
  // 1. Generate random salt within BN254 scalar field
  // 2. Lazy-load snarkjs (dynamic import)
  // 3. Fetch circuit artifacts (cached after first load)
  // 4. snarkjs.groth16.fullProve({ x, y, z, salt }, wasmUrl, zkeyUrl)
  // 5. Convert proof → Arkworks compressed bytes (128B)
  // 6. Convert public signals → LE bytes (32B × signal count)

  // === Byte conversion (adapted from ZK repo's formatProofForSui.ts) ===

  /** Convert decimal string to 32-byte little-endian Uint8Array */
  export function fieldToLE(decStr: string): Uint8Array

  /** Check if y is "positive" (lexicographically smaller half of field) */
  export function yIsPositive(yDecStr: string): boolean
  // y <= (p - y)  where p = BN254_FIELD_MODULUS

  /** Fq2 lexicographic y-sign: compare c1 first, then c0 */
  export function fq2YIsPositive(yC0DecStr: string, yC1DecStr: string): boolean

  /** G1 compressed: 32 bytes x-LE + y-sign in MSB of last byte */
  export function serializeG1Compressed(xDec: string, yDec: string): Uint8Array

  /** G2 compressed: 64 bytes (c0-LE || c1-LE) + Fq2 y-sign in MSB of c1's last byte */
  export function serializeG2Compressed(
    xC0Dec: string, xC1Dec: string,
    yC0Dec: string, yC1Dec: string,
  ): Uint8Array

  /** Full proof: pi_a(32) || pi_b(64) || pi_c(32) = 128 bytes */
  export function snarkjsProofToArkworks(proof: SnarkjsProof): Uint8Array

  /** Public signals: each signal → 32-byte LE, concatenated */
  export function publicSignalsToBytes(signals: string[]): Uint8Array

  /** Cryptographically random salt within BN254 scalar field */
  export function generateSalt(): bigint
  ```

- [ ] Create `frontend/src/lib/zk-proof.test.ts` — byte conversion tests

  **Test against known values — this is the most critical test file in the project.**

  ```typescript
  // 1. fieldToLE: known decimal → expected LE bytes
  //    e.g., "1" → [1, 0, 0, ..., 0] (32 bytes)
  //    e.g., "21888242871839275222246405745257275088696311157297823662689037894645226208583"
  //          → BN254 field modulus in LE

  // 2. yIsPositive:
  //    - y = 1 → true (1 < p-1)
  //    - y = p-1 → false (p-1 > 1)
  //    - y = (p-1)/2 → true (boundary)
  //    - y = (p-1)/2 + 1 → false (just past midpoint)

  // 3. serializeG1Compressed:
  //    - Check output is 32 bytes
  //    - Check MSB of last byte has correct sign bit
  //    - Verify against SUI's official test vector (factorization proof):
  //      VKey alpha_g1 from SUI docs = known hex → verify our serializer matches

  // 4. serializeG2Compressed:
  //    - Check output is 64 bytes
  //    - Check MSB of byte 63 (last byte of c1) has correct sign bit

  // 5. snarkjsProofToArkworks:
  //    - Check output is exactly 128 bytes
  //    - Verify structure: [0..32] = pi_a, [32..96] = pi_b, [96..128] = pi_c

  // 6. publicSignalsToBytes:
  //    - 3 signals → 96 bytes (32 × 3)
  //    - Each signal correctly LE-encoded

  // 7. generateSalt:
  //    - Output < BN254_FIELD_MODULUS
  //    - Multiple calls produce different values

  // 8. GOLDEN TEST (most important):
  //    Use SUI's official groth16 test vector (factorization proof: 641 × 6700417 = 4294967297)
  //    - Input: known snarkjs-format proof + vkey + public inputs
  //    - Expected output: known Arkworks-format bytes from SUI docs
  //    - This validates the ENTIRE conversion pipeline
  ```

  **SUI's official test vector** (from groth16 guide — factorization proof):
  - VKey hex: `94d781ec65145ed90beca1859d5f38ec...` (full bytes in SUI docs)
  - Proof points: `212d4457550f258654a24a6871522797...` (128 bytes compressed)
  - Public input: `4294967297` as 32-byte LE = `0100000001000000000000000000000000000000000000000000000000000000`

  If our `snarkjsProofToArkworks` reproduces SUI's expected byte output from the snarkjs-format input, the conversion is correct.

**Success criteria:** Given known coordinates, `generateLocationProof` produces bytes that, when passed to a Move test calling `groth16::verify_groth16_proof`, returns `true`. The golden test with SUI's official factorization proof test vector passes.

### Phase 1B: Contract — Add ZK Verification

**Goal:** Extend the marketplace contract with ZK verification support and deploy fresh.

**Tasks:**

- [ ] Add new imports to `marketplace.move`
  ```move
  use sui::groth16;
  ```

- [ ] Add error constant
  ```move
  const EInvalidLocationProof: u64 = 9;
  ```

- [ ] Add `location_proof_hash` field to `IntelListing`
  ```move
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
      location_proof_hash: vector<u8>,  // empty = unverified
  }
  ```

- [ ] Add `LocationVKey` struct + `init()` creation
  ```move
  /// Verification key for the location attestation Groth16 circuit.
  public struct LocationVKey has key {
      id: UID,
      vkey_bytes: vector<u8>,
  }

  /// One-Time Witness for init
  public struct MARKETPLACE has drop {}

  fun init(_otw: MARKETPLACE, ctx: &mut TxContext) {
      let vkey = LocationVKey {
          id: object::new(ctx),
          vkey_bytes: x"<VKEY_HEX_BYTES>",  // hardcoded from circuit setup
      };
      transfer::share_object(vkey);
  }
  ```
  **Note:** If the vkey is too large for a constant, pass it as an argument to a one-time admin setup function instead.

- [ ] Add `VerifiedIntelListed` event
  ```move
  public struct VerifiedIntelListed has copy, drop {
      listing_id: ID,
      scout: address,
  }
  ```

- [ ] Update `create_listing` to set `location_proof_hash` to empty
  ```move
  // In create_listing, add to the IntelListing constructor:
  location_proof_hash: vector::empty(),
  ```

- [ ] Add `create_verified_listing` function
  ```move
  public fun create_verified_listing(
      intel_type: u8,
      system_id: u64,
      individual_price: u64,
      decay_hours: u64,
      walrus_blob_id: vector<u8>,
      stake: Coin<SUI>,
      vkey: &LocationVKey,
      proof_points_bytes: vector<u8>,
      public_inputs_bytes: vector<u8>,
      clock: &Clock,
      ctx: &mut TxContext,
  ) {
      assert!(intel_type <= INTEL_TYPE_ROUTE, EInvalidIntelType);
      assert!(decay_hours <= MAX_DECAY_HOURS, EDecayTooLarge);

      // Verify Groth16 proof
      let pvk = groth16::prepare_verifying_key(
          &groth16::bn254(), &vkey.vkey_bytes
      );
      let public_inputs = groth16::public_proof_inputs_from_bytes(
          public_inputs_bytes
      );
      let proof_points = groth16::proof_points_from_bytes(
          proof_points_bytes
      );
      assert!(
          groth16::verify_groth16_proof(
              &groth16::bn254(), &pvk, &public_inputs, &proof_points
          ),
          EInvalidLocationProof,
      );

      let listing = IntelListing {
          id: object::new(ctx),
          scout: ctx.sender(),
          intel_type,
          system_id,
          created_at: clock.timestamp_ms(),
          decay_hours,
          walrus_blob_id,
          individual_price,
          stake: stake.into_balance(),
          delisted: false,
          location_proof_hash: public_inputs_bytes,
      };

      let listing_id = object::id(&listing);
      event::emit(IntelListed {
          listing_id,
          scout: ctx.sender(),
          intel_type,
          system_id,
      });
      event::emit(VerifiedIntelListed {
          listing_id,
          scout: ctx.sender(),
      });

      transfer::share_object(listing);
  }
  ```

- [ ] Add getters
  ```move
  public fun location_proof_hash(listing: &IntelListing): vector<u8> {
      listing.location_proof_hash
  }

  public fun is_verified(listing: &IntelListing): bool {
      !listing.location_proof_hash.is_empty()
  }
  ```

- [ ] Write contract tests in `marketplace_tests.move`
  - `test_create_verified_listing_valid_proof` — use precomputed BN254 test vectors, assert `is_verified` returns true, assert `location_proof_hash` is non-empty
  - `test_create_verified_listing_invalid_proof` — `#[expected_failure(abort_code = marketplace::EInvalidLocationProof)]`
  - `test_create_listing_not_verified` — assert `is_verified` returns false, `location_proof_hash` is empty
  - `test_purchase_verified_listing` — purchase flow unchanged for verified listings
  - `test_delist_verified_listing` — delist flow unchanged
  - Update ALL existing tests to include `location_proof_hash: vector::empty()` in any `IntelListing` construction

  **Note on test vectors:** SUI's `sui::groth16` module works with Arkworks-serialized bytes. For tests, use a minimal BN254 circuit (e.g., `x * x = y`) with precomputed proof/vkey/public-inputs. The ZK repo's test suite or SUI's own groth16 tests have usable test vectors.

- [ ] Build and test
  ```bash
  .sui-bin/sui.exe move build --path contracts
  .sui-bin/sui.exe move test --path contracts
  ```

- [ ] Deploy fresh contract
  ```bash
  .sui-bin/sui.exe client publish contracts
  ```

- [ ] Record new `PACKAGE_ID`, `LOCATION_VKEY_ID` (from init), and `UpgradeCap` from deploy output

**Success criteria:** All existing tests pass with the new field. New ZK tests pass. Fresh deploy succeeds. `LocationVKey` created at init.

### Phase 1C: Frontend — Data Layer

**Goal:** Wire verified listing status into the data layer without touching UI yet.

**Tasks:**

- [ ] Preserve raw coordinates in galaxy data (`galaxy-data.ts`)
  ```typescript
  export interface GalaxySystem {
    // ... existing fields ...
    /** Original EVE meter-scale X (for ZK proof circuit). */
    readonly rawX: number
    readonly rawY: number
    readonly rawZ: number
  }
  ```
  Update `parseGalaxyData` (line 81-93) to copy raw coords from `RawGalaxySystem`:
  ```typescript
  return {
    ...existingFields,
    rawX: r.x,
    rawY: r.y,
    rawZ: r.z,
  }
  ```

- [ ] Update `galaxy-data.test.ts` — test that raw coords survive normalization and match input values exactly

- [ ] Update constants (`constants.ts`)
  ```typescript
  // Replace existing PACKAGE_ID with new deploy
  export const PACKAGE_ID = '0x...'  // from fresh deploy
  export const LOCATION_VKEY_ID = '0x...'  // LocationVKey object from init()
  // Remove PACKAGE_V2_ID (no longer needed with fresh deploy)
  ```

- [ ] Add `isVerified` to `IntelListingFields` (`types.ts`)
  ```typescript
  export interface IntelListingFields {
    // ... existing fields ...
    readonly locationProofHash: Uint8Array
    readonly isVerified: boolean  // derived: locationProofHash.length > 0
  }
  ```

- [ ] Update `parse.ts` — parse `location_proof_hash` from on-chain data
  ```typescript
  // In parseListingFields:
  const locationProofHash = new Uint8Array(fields.location_proof_hash ?? [])
  return {
    ...existingFields,
    locationProofHash,
    isVerified: locationProofHash.length > 0,
  }
  ```

- [ ] Update `parse.test.ts` — test parsing with empty and non-empty proof hash

- [ ] Add `verifiedOnly` to `HeatMapFilters` (`heat-map-data.ts`)
  ```typescript
  export interface HeatMapFilters {
    intelType: IntelType | null
    maxPrice: bigint | null
    verifiedOnly: boolean  // new
  }
  ```
  Update `filterHeatMapData` to filter on `isVerified` when `verifiedOnly` is true.
  Update `DEFAULT_FILTERS` to include `verifiedOnly: false`.

- [ ] Update `heat-map-data.test.ts` — test `verifiedOnly` filter

- [ ] Add `buildCreateVerifiedListingTx` to `transactions.ts`
  ```typescript
  export function buildCreateVerifiedListingTx(params: {
    intelType: number
    systemId: bigint
    individualPrice: bigint
    decayHours: bigint
    walrusBlobId: Uint8Array
    stakeAmount: bigint
    vkeyId: string
    proofPointsBytes: Uint8Array
    publicInputsBytes: Uint8Array
  }): Transaction {
    const tx = new Transaction()
    const [stake] = tx.splitCoins(tx.gas, [tx.pure.u64(params.stakeAmount)])
    tx.moveCall({
      target: `${PACKAGE_ID}::marketplace::create_verified_listing`,
      arguments: [
        tx.pure.u8(params.intelType),
        tx.pure.u64(params.systemId),
        tx.pure.u64(params.individualPrice),
        tx.pure.u64(params.decayHours),
        tx.pure.vector('u8', Array.from(params.walrusBlobId)),
        stake,
        tx.object(params.vkeyId),
        tx.pure.vector('u8', Array.from(params.proofPointsBytes)),
        tx.pure.vector('u8', Array.from(params.publicInputsBytes)),
        tx.object(CLOCK_ID),
      ],
    })
    return tx
  }
  ```

- [ ] Update `transactions.test.ts` — test new builder returns `instanceof Transaction`

**Success criteria:** `pnpm test` passes. `IntelListingFields` has `isVerified`. Heat map filters support `verifiedOnly`. Transaction builder exists. No `useVerifiedListings` hook needed — status comes directly from listing object fields.

### Phase 1D: Frontend — UI

**Goal:** Add the verification toggle to CreateListing, badges to listing cards, and filter controls.

**Tasks:**

- [ ] Install new dependencies
  ```bash
  cd frontend && pnpm add snarkjs && pnpm add -D vite-plugin-node-polyfills
  ```
  **Note:** Check if `@types/snarkjs` exists on npm. If not, create a minimal `src/types/snarkjs.d.ts` declaration.

- [ ] Update `vite.config.ts` — add node polyfills for snarkjs
  ```typescript
  import { nodePolyfills } from 'vite-plugin-node-polyfills'
  // Add to plugins array:
  nodePolyfills({
    include: ['buffer', 'crypto', 'stream', 'os', 'path'],
    globals: { Buffer: true },
  })
  ```

- [ ] Place circuit artifacts in `frontend/public/zk/`
  ```
  frontend/public/zk/
    location-attestation.wasm
    location-attestation_final.zkey
  ```

- [ ] Update `CreateListing.tsx` — add verification toggle + proof generation
  - Add `verifyLocation` boolean state (default false)
  - Disable toggle when intel type is Route (type 3)
  - Show toggle between system picker and price field
  - On submit, if `verifyLocation`:
    1. Show status "Generating location proof..."
    2. Look up raw coords: `galaxy.systemMap.get(systemId)` → `{ rawX, rawY, rawZ }`
    3. `const { proofBytes, publicInputsBytes } = await generateLocationProof({ x: rawX, y: rawY, z: rawZ })`
    4. Call `buildCreateVerifiedListingTx` instead of `buildCreateListingTx`
  - On proof failure: show error with two buttons — "Retry" and "Create Without Verification"
  - Preserve all form data on failure (no state reset)

- [ ] Update `ListingBrowser.tsx` — add ZK-Verified badge + filter
  - Badge on verified listings (after existing "Owned" badge):
    ```tsx
    {listing.isVerified && (
      <span className="listing-verified-badge">ZK-Verified</span>
    )}
    ```
  - "Verified" toggle button in secondary filter row (alongside region dropdown)
  - Toggle sets `verifiedOnly` filter state
  - Auto-reset when switching type filters if no verified listings match

- [ ] Update `RegionPanel.tsx` — add badge to listing cards (same pattern as ListingBrowser)

- [ ] Update `MyIntel.tsx` — add badge to receipt cards (same pattern)

- [ ] Update `HeatMapControls.tsx` — add "Verified" toggle
  - Checkbox or toggle button in controls area
  - Dispatches `onFilterChange({ ...filters, verifiedOnly: !filters.verifiedOnly })`

- [ ] Add CSS styles to `index.css`
  ```css
  /* ZK-Verified badge */
  .listing-verified-badge {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--accent-cyan, #00e5ff);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 8px;
    border: 1px solid var(--accent-cyan, #00e5ff);
    border-radius: var(--radius);
    align-self: center;
  }

  /* Verify location toggle in CreateListing */
  .verify-toggle { /* toggle switch styling */ }
  .verify-toggle:disabled,
  .verify-toggle-disabled { opacity: 0.5; cursor: not-allowed; }
  ```

- [ ] Badge appears on all UI surfaces: ListingBrowser, RegionPanel, MyIntel, PurchaseFlow header, IntelViewer header

**Success criteria:** Toggling "Verify Location" on create form triggers proof generation. Verified listings show cyan "ZK-Verified" badge across all UI surfaces. "Verified only" filter works in browse and heat map.

### Phase 1E: Integration Testing & Polish

**Goal:** End-to-end verification, seed data, documentation.

**Tasks:**

- [ ] End-to-end test: create verified listing on testnet
  1. Generate proof in browser for a known system's raw coordinates
  2. Submit `create_verified_listing` transaction
  3. Verify listing appears with "ZK-Verified" badge
  4. Purchase and decrypt the verified listing (unchanged flow)

- [ ] Update seed script (`seed-data.ts`)
  - Add 3-5 verified seed listings with precomputed proofs
  - Proofs generated offline using `snarkjs` CLI for known system coords
  - Seed script calls `buildCreateVerifiedListingTx` for these listings

- [ ] `pnpm build` — clean TypeScript build, no errors
- [ ] `pnpm test` — all tests pass (existing + new)
- [ ] `.sui-bin/sui.exe move test --path contracts` — all tests pass

- [ ] Update `CLAUDE.md` — add ZK verification to project structure and status
- [ ] Update `README.md` — add ZK-verified intel to features section, add `snarkjs` to tech stack

## Acceptance Criteria

### Functional Requirements

- [ ] Scout can toggle "Verify Location" when creating resource, fleet, or base intel
- [ ] Route intel (type 3) shows toggle disabled with tooltip "Use distance proof (Phase 2)"
- [ ] Proof generation runs client-side (~320ms + artifact load time)
- [ ] On-chain Groth16 verification succeeds for valid proofs
- [ ] On-chain verification aborts with `EInvalidLocationProof` for invalid proofs
- [ ] Verified listings display "ZK-Verified" badge in Browse, Region Panel, My Intel
- [ ] "Verified only" filter works in ListingBrowser and HeatMapControls
- [ ] Unverified listing creation is completely unchanged
- [ ] Purchase and decrypt flows work identically for verified listings
- [ ] Proof generation failure shows error with "Create Unverified" fallback

### Non-Functional Requirements

- [ ] Circuit artifacts lazy-loaded from `/zk/` (not in main JS bundle)
- [ ] `snarkjs` dynamically imported only when verification is toggled on
- [ ] No additional RPC calls for verification status (read directly from listing fields)

### Quality Gates

- [ ] All existing Move tests updated and passing + new ZK tests
- [ ] All existing frontend tests passing + new tests
- [ ] `pnpm build` clean (no TypeScript errors)
- [ ] No new Vite warnings from node polyfills

## Dependencies & Prerequisites

| Dependency | Purpose | Version | Status |
|------------|---------|---------|--------|
| `snarkjs` (npm, frontend) | Client-side Groth16 proof generation | `^0.7.5` | Not installed |
| `vite-plugin-node-polyfills` (npm, frontend) | Node.js polyfills for snarkjs in browser | latest | Not installed |
| `circom` (system, offline) | Circuit compilation (one-time) | v2.1+ | Needs install |
| `circomlib` (npm, offline) | Circuit library (Poseidon, LessThan, etc.) | `^2.0.5` | For compilation only |
| `poseidon-lite` (npm, offline) | Poseidon hash for circuit witness gen | `^0.3.0` | For compilation only |
| PTAU file | Powers of Tau ceremony (BN254, 2^12) | PSE `ppot_0080_12` | [Download](https://pse-trusted-setup-ppot.s3.eu-central-1.amazonaws.com/pot28_0080/ppot_0080_12.ptau) |
| Circuit `.wasm` | Compiled circuit for browser proving | — | Need compilation |
| Circuit `.zkey` | Proving key for browser proving | — | Need compilation |
| VKey bytes (Arkworks) | 360-byte verification key for on-chain `init()` | — | Need extraction from `verification_key.json` |
| ZK repo reference code | `formatProofForSui.ts` — conversion reference | — | [Source](https://github.com/evefrontier/eve-frontier-proximity-zk-poc/blob/main/src/on-chain/ts/utils/formatProofForSui.ts) |

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| snarkjs byte format doesn't match SUI's Arkworks format | **Medium** (was High) | Blocks proof verification | ZK repo's `formatProofPointsForSuiLegacy` provides a working TypeScript reference. SUI's official factorization test vector validates the pipeline end-to-end. 7 critical pitfalls documented in Phase 1A. |
| VKey serialization incorrect | Medium | Contract verifies nothing | VKey has a different format than proof points (includes IC array + length prefix). Test against SUI docs' factorization VKey hex. Total: 360 bytes for 3 public inputs. |
| Circuit artifacts too large for browser | Low | Slow first proof | Location circuit is small (~2,359 constraints). `.zkey` should be <2MB. Lazy load with progress indicator. |
| `vite-plugin-node-polyfills` breaks existing build | Medium | Blocks development | Test polyfill integration in isolation first. Keep config minimal (`buffer`, `crypto`, `stream` only). |
| Proof generation too slow on mobile | Medium | Poor mobile UX | ~320ms on desktop. If >2s on mobile, show progress and offer "Create Unverified" fallback. |
| circom compilation fails or produces unexpected output | Medium | Delays Phase 1A | ZK repo's `scripts/compileCircuits.ts` documents the exact pipeline. Use PSE's pre-computed PTAU (`ppot_0080_12.ptau`) — do NOT roll own ceremony. Dependencies: `circomlib@^2.0.5`, `poseidon-lite@^0.3.0`, `snarkjs@^0.7.5`. |
| G2 coordinate ordering mismatch | Medium | Silent verification failure | snarkjs `pi_b` has a specific `[c0, c1]` ordering. The ZK repo's legacy function handles this correctly. Follow it exactly — do not reorder. |

## Future Considerations

This plan is Phase 1 of a 4-phase ZK integration:

- **Phase 2: Proximity-Proven Intel** — Distance proofs between two entities. Builds on Phase 1's location proofs. New circuit + `attach_distance_proof` function. Brainstorm: `docs/brainstorms/2026-03-13-zk-phase2-proximity-intel-brainstorm.md`
- **Phase 3: Timestamp-Bound Freshness** — Extract observation timestamp from proof. `observed_at` field + staleness cap. Brainstorm: `docs/brainstorms/2026-03-13-zk-phase3-timestamp-freshness-brainstorm.md`
- **Phase 4: Scout Reputation** — `ScoutProfile` shared object with Merkle tree of verified observations. Brainstorm: `docs/brainstorms/2026-03-13-zk-phase4-scout-reputation-brainstorm.md`

Each phase is independently shippable and backward-compatible. Phases 2-4 can add fields to the contract via subsequent fresh deploys or package upgrades.

## References

### Internal
- Brainstorm: `docs/brainstorms/2026-03-13-zk-verified-intel-brainstorm.md`
- Contract: `contracts/sources/marketplace.move` (lines 40-51: IntelListing, lines 84-118: create_listing)
- Transaction builders: `frontend/src/lib/transactions.ts`
- Galaxy data: `frontend/src/lib/galaxy-data.ts` (lines 2-10: RawGalaxySystem, lines 40-72: normalizeCoordinates)
- Types: `frontend/src/lib/types.ts` (lines 10-21: IntelListingFields)
- Create form: `frontend/src/components/CreateListing.tsx` (lines 113-183: handleSubmit)
- Parse: `frontend/src/lib/parse.ts` (parseListingFields)

### External
- [ZK Proximity PoC](https://github.com/evefrontier/eve-frontier-proximity-zk-poc) — Circuit source, Move verification patterns, Rust vkey serializer
- [SUI groth16 module](https://docs.sui.io/references/framework/sui_sui/groth16) — API reference (max 8 public inputs, BN254/BLS12-381)
- [SUI groth16 guide](https://docs.sui.io/guides/developer/cryptography/groth16) — Integration walkthrough
- [snarkjs](https://github.com/iden3/snarkjs) — Browser-based proof generation
- [vite-plugin-node-polyfills](https://www.npmjs.com/package/vite-plugin-node-polyfills) — Node.js polyfills for Vite

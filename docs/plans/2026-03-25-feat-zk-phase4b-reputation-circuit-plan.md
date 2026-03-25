# ZK Phase 4b: Reputation Claims Circuit — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Groth16 circuit that lets scouts prove claims about their reputation history ("I have N+ verified listings of badge type X") without revealing their full history. Proofs are verified on-chain, and verified claims are displayed as reputation badges on the scout's profile.

**Architecture:** A new Circom circuit (`reputation-attestation`) takes the scout's Merkle root (public) and N leaf values + sibling paths (private), verifies Merkle inclusion for each, and checks that all N leaves match a claimed badge type. On-chain, a new `ReputationVKey` verifies the proof and stores the claim on `ScoutProfileData`. Same Groth16 pipeline as location/distance/presence circuits.

**Tech Stack:** Circom 2, snarkjs 0.7.6 (Groth16), circomlibjs (Poseidon), Move (`sui::groth16`), TypeScript/React

**Prerequisites:** Phase 4a (counters) and Phase 4a+ (Merkle tree) must be complete.

**Spec:** `docs/brainstorms/2026-03-13-zk-phase4-scout-reputation-brainstorm.md` — Phase 4b section

---

## File Structure

### Circuit
- **Create:** `circuits/reputation-attestation/reputation-attestation.circom` — main circuit
- **Create:** `circuits/reputation-attestation/input.json` — example input for testing
- **Generated:** `circuits/reputation-attestation/reputation-attestation.wasm` (compilation output)
- **Generated:** `circuits/reputation-attestation/reputation-attestation.r1cs` (compilation output)
- **Generated:** `circuits/reputation-attestation/reputation-attestation_final.zkey` (trusted setup output)
- **Copy to:** `frontend/public/zk/reputation-attestation.wasm` + `.zkey` (browser artifacts)

### Contract
- **Modify:** `contracts/sources/marketplace.move`
  - Add: `ReputationVKey` struct (shared object, created in `init()`)
  - Add: `ReputationClaim` struct on `ScoutProfileData` (or dynamic field)
  - Add: `attach_reputation_proof()` function
  - Add: `ReputationClaimVerified` event
- **Modify:** `contracts/tests/marketplace_tests.move` — new tests

### Frontend
- **Modify:** `frontend/src/lib/zk-proof.ts` — add `generateReputationProof()`
- **Modify:** `frontend/src/lib/transactions.ts` — add `buildAttachReputationProofTx()`
- **Modify:** `frontend/src/lib/constants.ts` — add `REPUTATION_VKEY_ID`
- **Modify:** `frontend/src/lib/types.ts` — add reputation claim fields
- **Modify:** `frontend/src/lib/scout-profile.ts` — display verified reputation claims
- **Modify:** `frontend/src/components/ScoutProfilePanel.tsx` — show reputation claims

---

## Chunk 1: Circuit Design + Compilation

### Task 1: Design the reputation attestation circuit

The circuit proves: "I have at least `claimCount` leaves in my Merkle tree whose `badge_type` matches `claimBadgeType`."

**Public inputs (3):**
1. `merkleRoot` — the scout's on-chain Merkle root
2. `claimBadgeType` — the badge type being claimed (e.g., 0 = combat)
3. `claimCount` — minimum number of matching leaves being proven

**Public outputs (0):** None needed — the proof itself IS the claim. The public inputs define what's being proven.

**Private inputs:**
- `leaves[MAX_CLAIM][4]` — each leaf is `[system_id, intel_type, badge_type, timestamp]`
- `siblings[MAX_CLAIM][DEPTH]` — Merkle sibling path for each leaf
- `leafIndices[MAX_CLAIM]` — leaf position in tree (for path direction bits)

**Circuit parameter:** `MAX_CLAIM = 10` (max leaves provable in one proof). Scouts claiming more than 10 submit multiple proofs. This keeps the circuit small.

**Files:**
- Create: `circuits/reputation-attestation/reputation-attestation.circom`

- [ ] **Step 1: Write the circuit**

```circom
pragma circom 2.2.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

// Prove N leaves exist in a Merkle tree with matching badge_type.
// MAX_CLAIM = max leaves per proof, DEPTH = tree depth.
template ReputationAttestation(MAX_CLAIM, DEPTH) {
    // ── Public inputs ──
    signal input merkleRoot;
    signal input claimBadgeType;
    signal input claimCount;

    // ── Private inputs ──
    signal input leaves[MAX_CLAIM][4];        // [systemId, intelType, badgeType, timestamp]
    signal input siblings[MAX_CLAIM][DEPTH];  // Merkle sibling hashes
    signal input leafIndices[MAX_CLAIM];      // leaf position in tree
    signal input active[MAX_CLAIM];           // 1 = this slot is used, 0 = padding

    // ── Constrained active count (signal chain, not var) ──
    signal activeSum[MAX_CLAIM + 1];
    activeSum[0] <== 0;

    for (var i = 0; i < MAX_CLAIM; i++) {
        // Constrain active[i] to binary (0 or 1)
        active[i] * (1 - active[i]) === 0;

        // Accumulate active count via constrained signal chain
        activeSum[i + 1] <== activeSum[i] + active[i];

        // 1. Compute leaf hash: Poseidon(systemId, intelType, badgeType, timestamp)
        component leafHash = Poseidon(4);
        leafHash.inputs[0] <== leaves[i][0];
        leafHash.inputs[1] <== leaves[i][1];
        leafHash.inputs[2] <== leaves[i][2];
        leafHash.inputs[3] <== leaves[i][3];

        // 2. Verify Merkle inclusion
        // Extract index bits once per leaf (not per level)
        component indexBits = Num2Bits(DEPTH);
        indexBits.in <== leafIndices[i];

        signal path[DEPTH + 1];
        path[0] <== leafHash.out;

        component merkleHashers[DEPTH];

        for (var level = 0; level < DEPTH; level++) {
            merkleHashers[level] = Poseidon(2);

            // If bit == 0: hash(current, sibling). If bit == 1: hash(sibling, current).
            signal leftSel, rightSel;
            leftSel <== path[level] * (1 - indexBits.out[level])
                      + siblings[i][level] * indexBits.out[level];
            rightSel <== siblings[i][level] * (1 - indexBits.out[level])
                       + path[level] * indexBits.out[level];

            merkleHashers[level].inputs[0] <== leftSel;
            merkleHashers[level].inputs[1] <== rightSel;
            path[level + 1] <== merkleHashers[level].out;
        }

        // 3. If active, verify root matches AND badge_type matches
        signal rootDiff;
        rootDiff <== (path[DEPTH] - merkleRoot) * active[i];
        rootDiff === 0;  // If active, root must match

        signal typeDiff;
        typeDiff <== (leaves[i][2] - claimBadgeType) * active[i];
        typeDiff === 0;  // If active, badge_type must match claim
    }

    // ── Verify claim count ──
    // activeSum[MAX_CLAIM] >= claimCount
    component gte = GreaterEqThan(32);
    gte.in[0] <== activeSum[MAX_CLAIM];
    gte.in[1] <== claimCount;
    gte.out === 1;
}

component main { public [merkleRoot, claimBadgeType, claimCount] }
    = ReputationAttestation(10, 10);
```

**Note:** The `active` array allows the prover to submit fewer than MAX_CLAIM leaves by setting unused slots to `active=0` with dummy values. The constraint `activeCount >= claimCount` ensures the claim is satisfied.

- [ ] **Step 2: Commit circuit source**

```bash
git add circuits/reputation-attestation/reputation-attestation.circom
git commit -m "feat(circuit): reputation attestation — Merkle inclusion proof for badge claims"
```

### Task 2: Compile circuit and generate keys

- [ ] **Step 1: Install circomlib** (if not already in `circuits/node_modules`)

```bash
cd circuits && npm install circomlib
```

- [ ] **Step 2: Compile circuit**

```bash
circom reputation-attestation/reputation-attestation.circom \
  --r1cs --wasm --sym -o reputation-attestation/
```

- [ ] **Step 3: Generate proving key (Powers of Tau ceremony)**

Use existing `pot_final.ptau` from prior circuit compilations, or generate fresh:

```bash
snarkjs groth16 setup reputation-attestation/reputation-attestation.r1cs \
  pot_final.ptau reputation-attestation/reputation-attestation_0000.zkey

snarkjs zkey contribute reputation-attestation/reputation-attestation_0000.zkey \
  reputation-attestation/reputation-attestation_final.zkey \
  --name="Phase 4b contribution" -v
```

- [ ] **Step 4: Export verification key**

```bash
snarkjs zkey export verificationkey \
  reputation-attestation/reputation-attestation_final.zkey \
  reputation-attestation/verification_key.json
```

- [ ] **Step 5: Extract VKey bytes for Move contract**

```bash
node extract-vkey.cjs reputation-attestation/verification_key.json
```

Capture the hex string output. Record the byte length (depends on number of public signals: 3 inputs + 0 outputs = 3 signals → 4 IC points → 360 bytes).

- [ ] **Step 6: Copy browser artifacts**

```bash
cp reputation-attestation/reputation-attestation_js/reputation-attestation.wasm \
   ../frontend/public/zk/reputation-attestation.wasm

cp reputation-attestation/reputation-attestation_final.zkey \
   ../frontend/public/zk/reputation-attestation_final.zkey
```

- [ ] **Step 7: Commit**

```bash
git add circuits/reputation-attestation/ frontend/public/zk/reputation-attestation.*
git commit -m "feat(circuit): compile reputation attestation, generate keys, copy browser artifacts"
```

---

## Chunk 2: Contract — ReputationVKey + Proof Verification

### Task 3: Add ReputationVKey and verification function

**Files:**
- Modify: `contracts/sources/marketplace.move`

- [ ] **Step 1: Add ReputationVKey struct** (alongside existing VKey structs)

```move
public struct ReputationVKey has key {
    id: UID,
    vkey_bytes: vector<u8>,
}
```

- [ ] **Step 2: Add to init()** — create and share the VKey

```move
let reputation_vkey = ReputationVKey {
    id: object::new(ctx),
    vkey_bytes: x"<hex from extract-vkey.cjs>",
};
transfer::share_object(reputation_vkey);
```

- [ ] **Step 3: Add reputation claim storage to ScoutProfileData**

```move
public struct ScoutProfileData has store, drop {
    // ... existing fields ...
    // Reputation claims: badge_type → proven minimum count
    // Stored as parallel vectors (Move lacks Map with store+drop)
    reputation_claim_types: vector<u8>,
    reputation_claim_counts: vector<u64>,
}
```

Initialize in `get_or_create_profile`:
```move
reputation_claim_types: vector[],
reputation_claim_counts: vector[],
```

- [ ] **Step 4: Add ReputationClaimVerified event**

```move
public struct ReputationClaimVerified has copy, drop {
    scout: address,
    badge_type: u8,
    proven_count: u64,
}
```

- [ ] **Step 5: Add `attach_reputation_proof()` function**

```move
/// Verify a ZK reputation claim and store it on the scout's profile.
/// The proof attests: "I have at least `claim_count` leaves of type `claim_badge_type`
/// in my Merkle tree with root `merkle_root`."
public fun attach_reputation_proof(
    registry: &mut ScoutRegistry,
    vkey: &ReputationVKey,
    proof_points_bytes: vector<u8>,
    public_inputs_bytes: vector<u8>,
    ctx: &TxContext,
) {
    let scout = ctx.sender();
    assert!(has_profile(registry, scout), EProfileNotFound);

    // 1. Verify Groth16 proof
    let pvk = groth16::prepare_verifying_key(&groth16::bn254(), &vkey.vkey_bytes);
    let public_inputs = groth16::public_proof_inputs_from_bytes(public_inputs_bytes);
    let proof_points = groth16::proof_points_from_bytes(proof_points_bytes);
    assert!(
        groth16::verify_groth16_proof(&groth16::bn254(), &pvk, &public_inputs, &proof_points),
        EInvalidReputationProof,
    );

    // 2. Extract public inputs: [merkleRoot, claimBadgeType, claimCount]
    // Each is 32 bytes LE. For u64 values, read first 8 bytes.
    let profile = dynamic_field::borrow_mut<address, ScoutProfileData>(
        &mut registry.id, scout,
    );

    // Verify merkle root matches on-chain root
    let proof_root = bytes_to_u256_le(&public_inputs_bytes, 0);
    assert!(proof_root == profile.merkle_root, EMerkleRootMismatch);

    let badge_type = bytes_to_u64_le(&public_inputs_bytes, 32) as u8;
    let proven_count = bytes_to_u64_le(&public_inputs_bytes, 64);

    // 3. Store or update the claim
    let len = profile.reputation_claim_types.length();
    let mut found = false;
    let mut i = 0;
    while (i < len) {
        if (profile.reputation_claim_types[i] == badge_type) {
            // Update if new proof proves a higher count
            if (proven_count > profile.reputation_claim_counts[i]) {
                *&mut profile.reputation_claim_counts[i] = proven_count;
            };
            found = true;
            break
        };
        i = i + 1;
    };
    if (!found) {
        profile.reputation_claim_types.push_back(badge_type);
        profile.reputation_claim_counts.push_back(proven_count);
    };

    // 4. Emit event
    event::emit(ReputationClaimVerified {
        scout,
        badge_type,
        proven_count,
    });
}
```

Add error constants:
```move
const EInvalidReputationProof: u64 = 28;
const EMerkleRootMismatch: u64 = 29;
```

Add helper (if not already present):
```move
fun bytes_to_u256_le(bytes: &vector<u8>, offset: u64): u256 {
    let mut val: u256 = 0;
    let mut i: u64 = 31;
    loop {
        val = (val << 8) | (bytes[offset + i] as u256);
        if (i == 0) break;
        i = i - 1;
    };
    val
}
```

- [ ] **Step 6: Add getters**

```move
public fun reputation_claims(profile: &ScoutProfileData): (&vector<u8>, &vector<u64>) {
    (&profile.reputation_claim_types, &profile.reputation_claim_counts)
}
```

- [ ] **Step 7: Add test helpers**

```move
#[test_only]
public fun set_merkle_root_for_testing(
    registry: &mut ScoutRegistry,
    scout: address,
    root: u256,
) {
    let profile = dynamic_field::borrow_mut<address, ScoutProfileData>(
        &mut registry.id, scout,
    );
    profile.merkle_root = root;
}
```

- [ ] **Step 8: Build**

Run: `.sui-bin/sui.exe move build --path contracts`

- [ ] **Step 9: Commit**

```bash
git add contracts/sources/marketplace.move
git commit -m "feat(contract): ReputationVKey + attach_reputation_proof with Groth16 verification"
```

---

## Chunk 3: Contract Tests — Reputation Proof

### Task 4: Test reputation proof verification

**Files:**
- Modify: `contracts/tests/marketplace_tests.move`

**Note:** Testing Groth16 verification in Move tests requires real proof bytes. The pattern from existing tests: use `init_for_testing()` which creates VKeys, then pass pre-generated proof/input bytes.

For Phase 4b tests, either:
- (A) Generate a real proof from the circuit and hardcode it in the test
- (B) Test the function plumbing with a mock (set up the profile, call the function, expect the Groth16 verification to fail with known bad bytes)

Option B is pragmatic for the plan — the Groth16 verification itself is tested by SUI's own test suite. We test our plumbing.

- [ ] **Step 1: Test — attach_reputation_proof aborts without profile**

```move
#[test]
#[expected_failure(abort_code = marketplace::EProfileNotFound)]
fun test_reputation_proof_no_profile() {
    // Call attach_reputation_proof for a scout with no profile
    // Should abort with EProfileNotFound
}
```

- [ ] **Step 2: Test — attach_reputation_proof aborts with invalid proof**

```move
#[test]
#[expected_failure(abort_code = marketplace::EInvalidReputationProof)]
fun test_reputation_proof_invalid_proof() {
    // Create a profile (via create_listing)
    // Call attach_reputation_proof with garbage proof bytes
    // Should abort with EInvalidReputationProof
}
```

- [ ] **Step 3: Test — merkle root mismatch aborts** (requires bypassing Groth16 — may need a test-only variant)

If testing root mismatch in isolation is complex due to Groth16, add a `#[test_only]` variant that skips proof verification and tests the claim storage logic directly.

- [ ] **Step 4: Run all tests**

Run: `.sui-bin/sui.exe move test --path contracts`

- [ ] **Step 5: Commit**

```bash
git add contracts/tests/marketplace_tests.move
git commit -m "test(contract): reputation proof verification — abort cases"
```

---

## Chunk 4: Frontend — Proof Generation + UI

### Task 5: Add browser-side reputation proof generation

**Files:**
- Modify: `frontend/src/lib/zk-proof.ts`

- [ ] **Step 1: Add circuit artifact URLs**

```typescript
const REPUTATION_WASM_URL = '/zk/reputation-attestation.wasm'
const REPUTATION_ZKEY_URL = '/zk/reputation-attestation_final.zkey'
```

- [ ] **Step 2: Add `generateReputationProof()` function**

```typescript
export async function generateReputationProof(params: {
  merkleRoot: string           // u256 decimal string
  claimBadgeType: number       // 0=combat, 1=activity, 2=structure, 0xFE=zk, 0xFD=presence
  claimCount: number           // minimum leaves to prove
  leaves: { systemId: string; intelType: number; badgeType: number; timestamp: string }[]
  siblings: string[][]         // sibling hashes per leaf (depth entries each)
  leafIndices: number[]        // leaf positions in tree
}): Promise<{ proofBytes: Uint8Array; publicInputsBytes: Uint8Array }> {
  const snarkjs = await import('snarkjs')

  const MAX_CLAIM = 10
  const DEPTH = 10

  // Pad arrays to MAX_CLAIM with zeros
  const paddedLeaves = Array.from({ length: MAX_CLAIM }, (_, i) =>
    i < params.leaves.length
      ? [params.leaves[i].systemId, params.leaves[i].intelType.toString(),
         params.leaves[i].badgeType.toString(), params.leaves[i].timestamp]
      : ['0', '0', '0', '0'],
  )
  const paddedSiblings = Array.from({ length: MAX_CLAIM }, (_, i) =>
    i < params.siblings.length
      ? params.siblings[i]
      : Array(DEPTH).fill('0'),
  )
  const paddedIndices = Array.from({ length: MAX_CLAIM }, (_, i) =>
    i < params.leafIndices.length ? params.leafIndices[i].toString() : '0',
  )
  const active = Array.from({ length: MAX_CLAIM }, (_, i) =>
    i < params.leaves.length ? '1' : '0',
  )

  const circuitInput = {
    merkleRoot: params.merkleRoot,
    claimBadgeType: params.claimBadgeType.toString(),
    claimCount: params.claimCount.toString(),
    leaves: paddedLeaves,
    siblings: paddedSiblings,
    leafIndices: paddedIndices,
    active,
  }

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    REPUTATION_WASM_URL,
    REPUTATION_ZKEY_URL,
  )

  const proofBytes = snarkjsProofToArkworks(proof)
  const publicInputsBytes = publicSignalsToBytes(publicSignals)

  return { proofBytes, publicInputsBytes }
}
```

- [ ] **Step 3: Commit**

### Task 6: Add transaction builder

**Files:**
- Modify: `frontend/src/lib/transactions.ts`

- [ ] **Step 1: Add `buildAttachReputationProofTx()`**

```typescript
export function buildAttachReputationProofTx(params: {
  registryId: string
  reputationVkeyId: string
  proofPointsBytes: Uint8Array
  publicInputsBytes: Uint8Array
}): Transaction {
  const tx = new Transaction()
  tx.moveCall({
    target: `${PACKAGE_ID}::marketplace::attach_reputation_proof`,
    arguments: [
      tx.object(params.registryId),
      tx.object(params.reputationVkeyId),
      tx.pure.vector('u8', Array.from(params.proofPointsBytes)),
      tx.pure.vector('u8', Array.from(params.publicInputsBytes)),
    ],
  })
  return tx
}
```

- [ ] **Step 2: Add `REPUTATION_VKEY_ID` to constants.ts**

```typescript
export const REPUTATION_VKEY_ID = '' // Set after deploy
```

- [ ] **Step 3: Commit**

### Task 7: Display verified reputation claims

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/scout-profile.ts`
- Modify: `frontend/src/components/ScoutProfilePanel.tsx`

- [ ] **Step 1: Add reputation claim fields to ScoutProfileFields**

```typescript
export interface ScoutProfileFields {
  // ... existing fields ...
  readonly reputationClaimTypes: number[]
  readonly reputationClaimCounts: bigint[]
}
```

- [ ] **Step 2: Update parseScoutProfile**

```typescript
reputationClaimTypes: (fields.reputation_claim_types as number[]) ?? [],
reputationClaimCounts: ((fields.reputation_claim_counts as string[]) ?? []).map(BigInt),
```

- [ ] **Step 3: Add `getVerifiedClaims()` helper to scout-profile.ts**

```typescript
const CLAIM_LABELS: Record<number, string> = {
  0: 'Combat',
  1: 'Activity',
  2: 'Structure',
  0xFD: 'Presence',
  0xFE: 'ZK-Verified',
}

export function getVerifiedClaims(
  p: ScoutProfileFields,
): { label: string; count: bigint }[] {
  return p.reputationClaimTypes
    .map((type, i) => ({
      label: CLAIM_LABELS[type] ?? `Type ${type}`,
      count: p.reputationClaimCounts[i] ?? 0n,
    }))
    .filter(c => c.count > 0n)
}
```

- [ ] **Step 4: Display in ScoutProfilePanel**

Add a "ZK-Proven Claims" section after the badge breakdown:

```tsx
{(() => {
  const claims = getVerifiedClaims(profile)
  if (claims.length === 0) return null
  return (
    <div className="scout-proven-claims">
      <h4>ZK-Proven Claims</h4>
      <ul>
        {claims.map(({ label, count }) => (
          <li key={label}>
            <strong>{count.toString()}+</strong> {label} (ZK-proven)
          </li>
        ))}
      </ul>
    </div>
  )
})()}
```

- [ ] **Step 5: Run all tests**

Run: `cd frontend && npx vitest run`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/zk-proof.ts frontend/src/lib/transactions.ts \
  frontend/src/lib/constants.ts frontend/src/lib/types.ts \
  frontend/src/lib/scout-profile.ts frontend/src/components/ScoutProfilePanel.tsx
git commit -m "feat(frontend): reputation proof generation, transaction builder, claim display"
```

---

## Notes

- **Circuit complexity:** With MAX_CLAIM=10 and DEPTH=10, the circuit has ~10 × (1 Poseidon(4) + 10 Poseidon(2)) = ~110 Poseidon instances. This is within Groth16's practical range but will produce a larger zkey (~20–50 MB). Browser proof generation may take 5–15 seconds.
- **Trusted setup:** Requires a Powers of Tau file large enough for the circuit's constraint count. If the existing `pot_final.ptau` is too small, generate a larger one.
- **Leaf data availability:** For the prover to generate a proof, they need their own leaf values + Merkle sibling paths. Two options:
  - (A) Reconstruct from on-chain events (`ScoutReputationUpdated` events contain all leaf data)
  - (B) Store locally in the browser (localStorage or IndexedDB)
  Option A is trustless but requires event pagination. Option B is faster but lossy on browser clear. For PoC, use Option A.
- **Merkle sibling paths:** The prover needs to reconstruct the tree from all leaves to compute sibling paths. This requires fetching all `ScoutReputationUpdated` events for the scout, rebuilding the tree client-side with circomlibjs Poseidon, then extracting the sibling paths for the claimed leaves.
- **Claim upgrades:** A scout can submit a new reputation proof with a higher count for the same badge type. The contract stores the highest proven count per type.
- **VKey size estimate:** 3 public inputs → 4 IC points → 360 bytes. Same as the distance circuit.
- **Spec coverage:** This circuit covers "I have N+ listings of badge type X" claims (spec bullets 1 and 4). The "distinct regions" claim (bullet 2) and "temporal range" claim (bullet 3) require different circuit designs and are deferred to future work. The single-type count proof provides the majority of the value for the PoC.

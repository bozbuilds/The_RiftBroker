# ZK Phase 4a+: Scout Reputation Merkle Tree — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an append-only Merkle tree to `ScoutProfileData` so each verified listing/badge creates a cryptographic leaf, enabling future ZK reputation claims (Phase 4b). On-chain Poseidon hashing via `sui::poseidon::poseidon_bn254`.

**Architecture:** Incremental Merkle tree (frontier-based) with depth 10 (1,024 max leaves). Each verified event hashes `(system_id, intel_type, badge_type, timestamp)` into a Poseidon leaf. The frontier stores O(depth) intermediate hashes — no Table needed. The Merkle root updates on every verified listing or badge attachment.

**Tech Stack:** Move (SUI edition 2024, `sui::poseidon`), circomlibjs (off-chain precomputation of zero hashes)

**Prerequisite:** Phase 4a (ScoutRegistry + counters) must be complete.

**Spec:** `docs/brainstorms/2026-03-13-zk-phase4-scout-reputation-brainstorm.md` — Phase 4a+ section

---

## File Structure

### Contract
- **Modify:** `contracts/sources/marketplace.move`
  - Add: `merkle_root: u256`, `leaf_count: u64`, `frontier: vector<u256>` fields to `ScoutProfileData`
  - Add: `MERKLE_DEPTH` and `ZERO_HASHES` constants (precomputed off-chain)
  - Add: `insert_leaf()` internal function — incremental Merkle tree insertion
  - Add: `compute_leaf_hash()` internal function — Poseidon(system_id, intel_type, badge_type, timestamp)
  - Modify: all four profile update sites to call `insert_leaf()` after incrementing counters
  - Add: `merkle_root()` getter
- **Modify:** `contracts/tests/marketplace_tests.move` — new Merkle tree tests

### Tooling
- **Create:** `circuits/scripts/compute-zero-hashes.mjs` — precompute 10 zero hashes via circomlibjs Poseidon

### Frontend
- **Modify:** `frontend/src/lib/types.ts` — add `merkleRoot` field to `ScoutProfileFields`
- **Modify:** `frontend/src/lib/scout-profile.ts` — parse the new field
- **Modify:** `frontend/src/lib/scout-profile.test.ts` — update tests

---

## Chunk 1: Precompute Zero Hashes

### Task 1: Compute zero hashes off-chain

The incremental Merkle tree needs precomputed hashes for empty subtrees at each level. These are deterministic and constant — compute once, hardcode in Move.

**Files:**
- Create: `circuits/scripts/compute-zero-hashes.mjs`

- [ ] **Step 1: Write the script**

```javascript
import { buildPoseidon } from 'circomlibjs'

const DEPTH = 10

async function main() {
  const poseidon = await buildPoseidon()
  const F = poseidon.F

  // Level 0: empty leaf = 0
  let current = F.zero
  console.log(`ZERO_HASH[0] = ${F.toObject(current).toString()}`)

  for (let i = 1; i <= DEPTH; i++) {
    current = poseidon([current, current])
    current = F.toObject(current)
    console.log(`ZERO_HASH[${i}] = ${current.toString()}`)
    current = F.e(current)  // back to field element for next iteration
  }
}

main()
```

- [ ] **Step 2: Run the script**

Run: `cd circuits && node scripts/compute-zero-hashes.mjs`

Capture the 11 values (level 0 through 10). These are BN254 field elements (< 2^254).

- [ ] **Step 3: Commit**

```bash
git add circuits/scripts/compute-zero-hashes.mjs
git commit -m "chore: script to precompute Merkle zero hashes via Poseidon"
```

---

## Chunk 2: Contract — Merkle Tree Fields + Insertion

### Task 2: Add Merkle tree fields to ScoutProfileData

**Files:**
- Modify: `contracts/sources/marketplace.move`

- [ ] **Step 1: Add constants**

```move
const MERKLE_DEPTH: u64 = 10;
const MERKLE_MAX_LEAVES: u64 = 1024;  // 2^10

// Precomputed Poseidon hashes of empty subtrees at each level (0..10)
// ZERO_HASHES[0] = Poseidon hash of empty leaf (0)
// ZERO_HASHES[i] = Poseidon(ZERO_HASHES[i-1], ZERO_HASHES[i-1])
// Computed via circuits/scripts/compute-zero-hashes.mjs
const ZERO_HASH_0: u256 = 0;
const ZERO_HASH_1: u256 = <value from script>;
const ZERO_HASH_2: u256 = <value from script>;
// ... through ZERO_HASH_10
```

- [ ] **Step 2: Add `use sui::poseidon` import**

```move
use sui::poseidon;
```

- [ ] **Step 3: Extend ScoutProfileData** — add three new fields

```move
public struct ScoutProfileData has store, drop {
    // ... existing counter fields from Phase 4a ...
    merkle_root: u256,
    leaf_count: u64,
    frontier: vector<u256>,   // MERKLE_DEPTH entries
}
```

- [ ] **Step 4: Update `get_or_create_profile`** — initialize Merkle fields on creation

Add to the `ScoutProfileData` initializer:

```move
merkle_root: ZERO_HASH_10,  // root of empty tree
leaf_count: 0,
frontier: vector[
    ZERO_HASH_0, ZERO_HASH_1, ZERO_HASH_2, ZERO_HASH_3, ZERO_HASH_4,
    ZERO_HASH_5, ZERO_HASH_6, ZERO_HASH_7, ZERO_HASH_8, ZERO_HASH_9,
],
```

### Task 3: Implement leaf hash and tree insertion

- [ ] **Step 1: Add `compute_leaf_hash()` helper**

```move
/// Hash a verified event into a Merkle leaf.
/// Inputs: (system_id, intel_type, badge_type, timestamp) → Poseidon hash.
fun compute_leaf_hash(
    system_id: u64,
    intel_type: u8,
    badge_type: u8,
    timestamp: u64,
): u256 {
    let inputs = vector[
        (system_id as u256),
        (intel_type as u256),
        (badge_type as u256),
        (timestamp as u256),
    ];
    poseidon::poseidon_bn254(&inputs)
}
```

- [ ] **Step 2: Add `zero_hash_at()` helper** (returns precomputed zero hash for a given level)

```move
fun zero_hash_at(level: u64): u256 {
    if (level == 0) ZERO_HASH_0
    else if (level == 1) ZERO_HASH_1
    else if (level == 2) ZERO_HASH_2
    else if (level == 3) ZERO_HASH_3
    else if (level == 4) ZERO_HASH_4
    else if (level == 5) ZERO_HASH_5
    else if (level == 6) ZERO_HASH_6
    else if (level == 7) ZERO_HASH_7
    else if (level == 8) ZERO_HASH_8
    else if (level == 9) ZERO_HASH_9
    else { abort EInvalidMerkleLevel }
}
```

Add error constant: `const EInvalidMerkleLevel: u64 = 26;`
Add error constant: `const EMerkleTreeFull: u64 = 27;`

- [ ] **Step 3: Add `insert_leaf()` — incremental Merkle tree insertion**

```move
/// Append a leaf to the scout's incremental Merkle tree.
/// Updates frontier and recomputes root. O(depth) Poseidon hashes.
fun insert_leaf(profile: &mut ScoutProfileData, leaf: u256) {
    assert!(profile.leaf_count < MERKLE_MAX_LEAVES, EMerkleTreeFull);

    let index = profile.leaf_count;
    let mut current = leaf;
    let mut level: u64 = 0;

    // Walk up the tree. At each level:
    // - If index bit is 0: this is a left child → store in frontier, pair with zero
    // - If index bit is 1: this is a right child → pair with frontier value
    while (level < MERKLE_DEPTH) {
        if ((index >> level) & 1 == 0) {
            // Left child: store in frontier for future right siblings
            *&mut profile.frontier[level] = current;
            // Pair with zero hash to compute parent
            current = poseidon::poseidon_bn254(&vector[current, zero_hash_at(level)]);
        } else {
            // Right child: pair with stored left sibling from frontier
            current = poseidon::poseidon_bn254(&vector[profile.frontier[level], current]);
        };
        level = level + 1;
    };

    profile.merkle_root = current;
    profile.leaf_count = profile.leaf_count + 1;
}
```

**Note:** The above algorithm computes the root after each insertion by pairing with zero hashes at unfilled positions. This gives the correct root for a partially-filled tree of depth MERKLE_DEPTH.

- [ ] **Step 4: Build contract**

Run: `.sui-bin/sui.exe move build --path contracts`
Expected: successful build

- [ ] **Step 5: Commit**

```bash
git add contracts/sources/marketplace.move
git commit -m "feat(contract): incremental Merkle tree with Poseidon — fields, insert, leaf hash"
```

### Task 4: Wire leaf insertion into all verified paths

**Files:**
- Modify: `contracts/sources/marketplace.move`

In each profile update block (Phase 4a), add a `insert_leaf()` call after the counter increment. The `badge_type` value distinguishes the leaf type.

- [ ] **Step 1: In `create_verified_listing` profile update, add:**

```move
let leaf = compute_leaf_hash(system_id, intel_type, 0xFE, observed_at);
insert_leaf(profile, leaf);
```

- [ ] **Step 2: In `create_presence_verified_listing` profile update, add:**

```move
let leaf = compute_leaf_hash(system_id, intel_type, 0xFD, observed_at);
insert_leaf(profile, leaf);
```

- [ ] **Step 3: In `attach_event_badge` profile update, add:**

```move
let leaf = compute_leaf_hash(
    listing.system_id,
    listing.intel_type,
    badge_type,
    clock::timestamp_ms(clock),
);
insert_leaf(profile, leaf);
```

- [ ] **Step 4: `create_listing` (unverified) — NO leaf insertion** (only counter increment, as per spec)

- [ ] **Step 5: Add getter for merkle_root**

```move
public fun merkle_root(profile: &ScoutProfileData): u256 { profile.merkle_root }
public fun leaf_count(profile: &ScoutProfileData): u64 { profile.leaf_count }
```

- [ ] **Step 6: Build and run existing tests**

Run: `.sui-bin/sui.exe move test --path contracts`
Expected: all tests passing (existing tests don't assert Merkle state, so they still pass)

- [ ] **Step 7: Commit**

```bash
git add contracts/sources/marketplace.move
git commit -m "feat(contract): wire Merkle leaf insertion into all verified paths"
```

---

## Chunk 3: Contract Tests — Merkle Tree

### Task 5: Test Merkle tree behavior

**Files:**
- Modify: `contracts/tests/marketplace_tests.move`

- [ ] **Step 1: Test — initial Merkle root is empty tree root**

```move
#[test]
fun test_initial_merkle_root_is_empty() {
    // Create registry, create a single unverified listing
    // Assert: merkle_root == ZERO_HASH_10 (root of empty tree)
    // Assert: leaf_count == 0 (unverified doesn't insert)
}
```

- [ ] **Step 2: Test — verified listing inserts one leaf**

```move
#[test]
fun test_verified_listing_inserts_leaf() {
    // Create verified listing
    // Assert: leaf_count == 1
    // Assert: merkle_root != ZERO_HASH_10 (root changed)
}
```

- [ ] **Step 3: Test — multiple leaves produce different roots**

```move
#[test]
fun test_multiple_leaves_different_roots() {
    // Create 2 verified listings in different systems
    // Capture root after first, root after second
    // Assert: root1 != root2
    // Assert: leaf_count == 2
}
```

- [ ] **Step 4: Test — badge attachment inserts leaf**

```move
#[test]
fun test_badge_inserts_leaf() {
    // Create unverified listing (leaf_count stays 0)
    // Attach combat badge
    // Assert: leaf_count == 1
    // Assert: merkle_root != empty root
}
```

- [ ] **Step 5: Test — tree full aborts at 1024 leaves** (optional stress test)

This test is expensive (1024 insertions with Poseidon). May skip for PoC or test with a smaller depth constant overridden for testing.

- [ ] **Step 6: Run all tests**

Run: `.sui-bin/sui.exe move test --path contracts`
Expected: all passing

- [ ] **Step 7: Commit**

```bash
git add contracts/tests/marketplace_tests.move
git commit -m "test(contract): Merkle tree insertion, root updates, badge leaves"
```

---

## Chunk 4: Frontend — Parse Merkle Root

### Task 6: Update frontend types and parsing

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/scout-profile.ts`
- Modify: `frontend/src/lib/scout-profile.test.ts`

- [ ] **Step 1: Add `merkleRoot` and `leafCount` to ScoutProfileFields**

```typescript
export interface ScoutProfileFields {
  // ... existing fields ...
  readonly merkleRoot: string   // u256 as decimal string
  readonly leafCount: bigint
}
```

- [ ] **Step 2: Update parseScoutProfile**

```typescript
merkleRoot: (fields.merkle_root as string) ?? '0',
leafCount: BigInt(fields.leaf_count as string),
```

- [ ] **Step 3: Update makeProfile test factory**

Add defaults: `merkleRoot: '0', leafCount: 0n`

- [ ] **Step 4: Add parse test for new fields**

```typescript
it('parses merkle_root and leaf_count', () => {
  const fields = { ...baseFields, merkle_root: '12345', leaf_count: '7' }
  const result = parseScoutProfile('0xscout', fields)
  expect(result.merkleRoot).toBe('12345')
  expect(result.leafCount).toBe(7n)
})
```

- [ ] **Step 5: Run tests**

Run: `cd frontend && npx vitest run src/lib/scout-profile.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/scout-profile.ts frontend/src/lib/scout-profile.test.ts
git commit -m "feat(frontend): parse Merkle root + leaf count from ScoutProfileData"
```

---

## Notes

- **Gas cost:** Each `insert_leaf()` does up to 10 Poseidon hashes. Benchmark on testnet before deciding if this is acceptable for production. If too expensive, switch to Option B (off-chain tree, on-chain root only) in a future iteration.
- **Merkle tree depth 10** gives 1,024 max leaves per scout. Sufficient for PoC. A depth of 16 (65K) would require 6 more zero hash constants and 6 more Poseidon hashes per insert — straightforward to increase later.
- **Frontier storage:** 10 × 32 bytes = 320 bytes per scout in dynamic field storage. Negligible.
- **The Merkle root is NOT displayed in the UI** for Phase 4a+ — it exists purely as infrastructure for Phase 4b (ZK reputation claims). The frontend parses it for future use but doesn't render it.

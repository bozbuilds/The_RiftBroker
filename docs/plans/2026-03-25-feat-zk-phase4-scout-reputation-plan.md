# ZK Phase 4a: Scout Reputation — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-scout reputation tracking with per-badge-type counters, displayed in the marketplace UI, so buyers can evaluate scout trustworthiness before purchasing.

**Architecture:** A `ScoutRegistry` shared object (created in `init()`) stores `ScoutProfileData` as dynamic fields keyed by scout address. All listing creation and badge attachment functions take `&mut ScoutRegistry` and auto-create/update profiles. Frontend discovers profiles via `getDynamicFieldObject` on the registry. This is Phase 4a (counters only) — Merkle tree (4a+) and ZK reputation claims (4b) are deferred.

**Tech Stack:** Move (SUI edition 2024, `sui::dynamic_field`), TypeScript/React, `@mysten/sui` JSON-RPC, Vitest 4

**Breaking change:** All four listing/badge functions gain a `registry: &mut ScoutRegistry` parameter. Requires a fresh contract deploy. All existing testnet listings will be orphaned.

**Spec:** `docs/brainstorms/2026-03-13-zk-phase4-scout-reputation-brainstorm.md`

---

## File Structure

### Contract
- **Modify:** `contracts/sources/marketplace.move`
  - Add: `ScoutRegistry` struct (shared object, created in `init()`)
  - Add: `ScoutProfileData` struct (`store + drop`, dynamic field value)
  - Add: `ScoutProfileCreated` + `ScoutReputationUpdated` events
  - Add: `get_or_create_profile()` internal helper
  - Modify: `create_listing()` — new `registry` param, increment `total_unverified`
  - Modify: `create_verified_listing()` — new `registry` param, increment `total_zk_verified`
  - Modify: `create_presence_verified_listing()` — new `registry` param, increment `total_presence_verified`
  - Modify: `attach_event_badge()` — new `registry` param, increment per-badge counter
  - Add: getter functions for `ScoutProfileData` fields
  - Add: `#[test_only]` helpers
- **Modify:** `contracts/tests/marketplace_tests.move`
  - All existing tests updated to pass `&mut ScoutRegistry`
  - New tests for profile creation, counter increments, edge cases

### Frontend
- **Modify:** `frontend/src/lib/types.ts` — add `ScoutProfileFields` interface
- **Create:** `frontend/src/lib/scout-profile.ts` — parse + reputation display helpers
- **Create:** `frontend/src/lib/scout-profile.test.ts` — tests
- **Create:** `frontend/src/hooks/useScoutProfile.ts` — hook to fetch profiles
- **Modify:** `frontend/src/lib/transactions.ts` — all builders gain `registryId` param
- **Modify:** `frontend/src/lib/constants.ts` — add `SCOUT_REGISTRY_ID`, reputation thresholds
- **Modify:** `frontend/src/components/ListingBrowser.tsx` — inline reputation display
- **Create:** `frontend/src/components/ScoutProfilePanel.tsx` — detailed scout profile view
- **Modify:** `frontend/src/scripts/seed.ts` — pass registry to listing creation

---

## Chunk 1: Contract — Structs, Events, Helper, Init

### Task 1: Add ScoutRegistry + ScoutProfileData structs and events

**Files:**
- Modify: `contracts/sources/marketplace.move`

- [ ] **Step 1: Add error constants** (after existing error constants, currently ending at line ~36)

```move
const EProfileNotFound: u64 = 25;
```

- [ ] **Step 1b: Add `use sui::dynamic_field` import** (at the top of marketplace.move, with other imports)

```move
use sui::dynamic_field;
```

- [ ] **Step 2: Add ScoutProfileData struct** (after PurchaseReceipt, around line 120)

```move
/// Per-scout reputation counters, stored as dynamic field on ScoutRegistry.
/// Keyed by scout address. Only updated by listing creation / badge functions.
public struct ScoutProfileData has store, drop {
    total_zk_verified: u64,
    total_presence_verified: u64,
    total_combat_verified: u64,
    total_activity_verified: u64,
    total_structure_verified: u64,
    total_unverified: u64,
    first_verified_at: u64,
    last_verified_at: u64,
}
```

- [ ] **Step 3: Add ScoutRegistry struct** (after ScoutProfileData)

```move
/// Global registry holding all scout profiles as dynamic fields.
/// Created once in init(), shared for concurrent access.
public struct ScoutRegistry has key {
    id: UID,
}
```

- [ ] **Step 4: Add events** (after existing events, around line 161)

```move
public struct ScoutProfileCreated has copy, drop {
    scout: address,
    registry_id: ID,
}

public struct ScoutReputationUpdated has copy, drop {
    scout: address,
    badge_type: u8,
    new_total: u64,
}
```

- [ ] **Step 5: Update init() to create and share the registry**

Add to the end of the existing `init()` function (after PresenceVKey creation):

```move
let registry = ScoutRegistry { id: object::new(ctx) };
transfer::share_object(registry);
```

- [ ] **Step 6: Add internal helper get_or_create_profile**

```move
/// Look up or create a scout's profile in the registry.
/// Returns a mutable reference to the profile data.
fun get_or_create_profile(
    registry: &mut ScoutRegistry,
    scout: address,
    timestamp: u64,
): &mut ScoutProfileData {
    if (!dynamic_field::exists_<address>(&registry.id, scout)) {
        dynamic_field::add<address, ScoutProfileData>(
            &mut registry.id,
            scout,
            ScoutProfileData {
                total_zk_verified: 0,
                total_presence_verified: 0,
                total_combat_verified: 0,
                total_activity_verified: 0,
                total_structure_verified: 0,
                total_unverified: 0,
                first_verified_at: 0,  // set on first verified event, not creation
                last_verified_at: 0,
            },
        );
        event::emit(ScoutProfileCreated {
            scout,
            registry_id: object::id(registry),
        });
    };
    dynamic_field::borrow_mut<address, ScoutProfileData>(&mut registry.id, scout)
}
```

- [ ] **Step 7: Add ScoutProfileData getter functions**

```move
// ── ScoutProfileData getters ─────────────────────────────────────────

public fun total_zk_verified(profile: &ScoutProfileData): u64 { profile.total_zk_verified }
public fun total_presence_verified(profile: &ScoutProfileData): u64 { profile.total_presence_verified }
public fun total_combat_verified(profile: &ScoutProfileData): u64 { profile.total_combat_verified }
public fun total_activity_verified(profile: &ScoutProfileData): u64 { profile.total_activity_verified }
public fun total_structure_verified(profile: &ScoutProfileData): u64 { profile.total_structure_verified }
public fun total_unverified(profile: &ScoutProfileData): u64 { profile.total_unverified }
public fun first_verified_at(profile: &ScoutProfileData): u64 { profile.first_verified_at }
public fun last_verified_at(profile: &ScoutProfileData): u64 { profile.last_verified_at }

/// Total verified listings across all badge types.
public fun total_verified(profile: &ScoutProfileData): u64 {
    profile.total_zk_verified
        + profile.total_presence_verified
        + profile.total_combat_verified
        + profile.total_activity_verified
        + profile.total_structure_verified
}

/// Look up a scout's profile from the registry. Aborts if not found.
public fun borrow_profile(registry: &ScoutRegistry, scout: address): &ScoutProfileData {
    assert!(dynamic_field::exists_<address>(&registry.id, scout), EProfileNotFound);
    dynamic_field::borrow<address, ScoutProfileData>(&registry.id, scout)
}

/// Check whether a scout has a profile in the registry.
public fun has_profile(registry: &ScoutRegistry, scout: address): bool {
    dynamic_field::exists_<address>(&registry.id, scout)
}
```

- [ ] **Step 8: Build contract to verify syntax**

Run: `.sui-bin/sui.exe move build --path contracts`
Expected: successful build (tests will fail until updated in Chunk 2)

- [ ] **Step 9: Commit**

```bash
git add contracts/sources/marketplace.move
git commit -m "feat(contract): ScoutRegistry + ScoutProfileData structs, events, helper, getters"
```

---

## Chunk 2: Contract — Update Listing/Badge Functions + Test Helpers

### Task 2: Update create_listing to track unverified count

**Files:**
- Modify: `contracts/sources/marketplace.move`

- [ ] **Step 1: Add `registry: &mut ScoutRegistry` parameter to `create_listing`**

Update the function signature (add `registry` as the first parameter):

```move
public fun create_listing(
    registry: &mut ScoutRegistry,
    intel_type: u8,
    system_id: u64,
    // ... rest unchanged
```

- [ ] **Step 2: Add profile update at the end of create_listing** (before `transfer::share_object`)

```move
let profile = get_or_create_profile(registry, ctx.sender(), clock::timestamp_ms(clock));
profile.total_unverified = profile.total_unverified + 1;
event::emit(ScoutReputationUpdated {
    scout: ctx.sender(),
    badge_type: 0xFF,  // 0xFF = unverified
    new_total: profile.total_unverified,
});
```

### Task 3: Update create_verified_listing

- [ ] **Step 1: Add `registry: &mut ScoutRegistry` as first parameter**

- [ ] **Step 2: Add profile update** (after the listing is created, before `transfer::share_object`)

```move
let profile = get_or_create_profile(registry, ctx.sender(), observed_at);
profile.total_zk_verified = profile.total_zk_verified + 1;
if (profile.first_verified_at == 0) { profile.first_verified_at = observed_at; };
profile.last_verified_at = observed_at;
event::emit(ScoutReputationUpdated {
    scout: ctx.sender(),
    badge_type: 0xFE,  // 0xFE = zk-verified
    new_total: profile.total_zk_verified,
});
```

Apply the same `first_verified_at` guard to all verified update blocks below.

### Task 4: Update create_presence_verified_listing

- [ ] **Step 1: Add `registry: &mut ScoutRegistry` as first parameter**

- [ ] **Step 2: Add profile update** (same pattern, using `total_presence_verified`)

```move
let profile = get_or_create_profile(registry, ctx.sender(), observed_at);
profile.total_presence_verified = profile.total_presence_verified + 1;
profile.last_verified_at = observed_at;
event::emit(ScoutReputationUpdated {
    scout: ctx.sender(),
    badge_type: 0xFD,  // 0xFD = presence-verified
    new_total: profile.total_presence_verified,
});
```

### Task 5: Update attach_event_badge

- [ ] **Step 1: Add `registry: &mut ScoutRegistry` as first parameter**

- [ ] **Step 2: Add profile update after badge attachment** (before the BadgeAttached event emit)

```move
let profile = get_or_create_profile(registry, ctx.sender(), clock::timestamp_ms(clock));
if (badge_type == BADGE_TYPE_KILLMAIL) {
    profile.total_combat_verified = profile.total_combat_verified + 1;
} else if (badge_type == BADGE_TYPE_DEPOSIT) {
    profile.total_activity_verified = profile.total_activity_verified + 1;
} else {
    profile.total_structure_verified = profile.total_structure_verified + 1;
};
profile.last_verified_at = clock::timestamp_ms(clock);
event::emit(ScoutReputationUpdated {
    scout: ctx.sender(),
    badge_type,
    new_total: if (badge_type == BADGE_TYPE_KILLMAIL) {
        profile.total_combat_verified
    } else if (badge_type == BADGE_TYPE_DEPOSIT) {
        profile.total_activity_verified
    } else {
        profile.total_structure_verified
    },
});
```

**Note:** `attach_event_badge` currently does not take a `clock` parameter. Add `clock: &Clock` as the last parameter (needed for `last_verified_at`).

### Task 6: Add test helpers

- [ ] **Step 1: Add `#[test_only]` helpers**

```move
#[test_only]
public fun create_registry_for_testing(ctx: &mut TxContext): ScoutRegistry {
    ScoutRegistry { id: object::new(ctx) }
}

#[test_only]
public fun destroy_registry_for_testing(registry: ScoutRegistry) {
    std::unit_test::destroy(registry);
}
```

- [ ] **Step 2: Build contract**

Run: `.sui-bin/sui.exe move build --path contracts`
Expected: successful build

- [ ] **Step 3: Commit**

```bash
git add contracts/sources/marketplace.move
git commit -m "feat(contract): update listing/badge functions with ScoutRegistry param"
```

---

## Chunk 3: Contract Tests

### Task 7: Update all existing tests to pass registry

**Files:**
- Modify: `contracts/tests/marketplace_tests.move`

Every existing test that calls `create_listing`, `create_verified_listing`, `create_presence_verified_listing`, or `attach_event_badge` needs to:

1. Create a registry via `create_registry_for_testing(ctx)`
2. Share or pass the registry to the function call
3. Clean up the registry at the end

- [ ] **Step 1: Add registry setup pattern to all 50 existing tests**

In each test's first transaction block, add:

```move
let registry = marketplace::create_registry_for_testing(ctx);
transfer::public_share_object(registry);
```

Wait — `ScoutRegistry` has `key` only (no `store`), so `transfer::share_object` is the right call. But in test context, we need to share it in one tx, then take_shared in subsequent txs.

Pattern for each test:

```move
// First tx: create registry + whatever setup
scenario.next_tx(SCOUT);
{
    let ctx = scenario.ctx();
    let registry = marketplace::create_registry_for_testing(ctx);
    transfer::share_object(registry);
};

// Subsequent txs: take_shared, use, return
scenario.next_tx(SCOUT);
{
    let mut registry = scenario.take_shared<ScoutRegistry>();
    // ... call create_listing(&mut registry, ...)
    test_scenario::return_shared(registry);
};
```

**Important:** This is a mechanical update to all 50 tests. The pattern is the same for every test — add registry creation in the setup tx, take_shared/return_shared around every function that now requires it. For `attach_event_badge`, also add `clock` parameter.

- [ ] **Step 2: Run all existing tests to verify they pass**

Run: `.sui-bin/sui.exe move test --path contracts`
Expected: 50/50 tests passing

- [ ] **Step 3: Commit**

```bash
git add contracts/tests/marketplace_tests.move
git commit -m "test(contract): update all 50 tests with ScoutRegistry param"
```

### Task 8: Add ScoutProfile-specific tests

- [ ] **Step 1: Write test — profile created on first listing**

```move
#[test]
fun test_profile_created_on_first_listing() {
    let mut scenario = test_scenario::begin(SCOUT);
    // Setup: create registry, clock, coin
    scenario.next_tx(SCOUT);
    {
        let ctx = scenario.ctx();
        let registry = marketplace::create_registry_for_testing(ctx);
        transfer::share_object(registry);
    };
    // Create listing
    scenario.next_tx(SCOUT);
    {
        let mut registry = scenario.take_shared<ScoutRegistry>();
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let coin = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(
            &mut registry, 0, 30006118, 100, 24, vector[], coin, &clk, ctx,
        );
        // Assert profile exists
        assert!(marketplace::has_profile(&registry, SCOUT));
        let profile = marketplace::borrow_profile(&registry, SCOUT);
        assert!(marketplace::total_unverified(profile) == 1);
        assert!(marketplace::total_verified(profile) == 0);
        clock::destroy_for_testing(clk);
        test_scenario::return_shared(registry);
    };
    scenario.end();
}
```

- [ ] **Step 2: Run test, verify it passes**

- [ ] **Step 3: Write test — verified listing increments zk_verified counter**

```move
#[test]
fun test_verified_listing_increments_zk_counter() {
    // Setup: registry + init_for_testing (VKeys)
    // Create verified listing
    // Assert total_zk_verified == 1, total_unverified == 0
}
```

- [ ] **Step 4: Write test — attach_event_badge increments correct counter**

```move
#[test]
fun test_badge_increments_correct_counter() {
    // Create listing (total_unverified = 1)
    // Attach killmail badge (total_combat_verified = 1)
    // Attach deposit badge (total_activity_verified = 1)
    // Assert total_verified == 2 (combat + activity)
    // Assert total_unverified == 1
}
```

- [ ] **Step 5: Write test — multiple listings from same scout accumulate**

```move
#[test]
fun test_multiple_listings_accumulate() {
    // Create 3 unverified listings
    // Assert total_unverified == 3
    // Assert first_verified_at and last_verified_at set correctly
}
```

- [ ] **Step 6: Write test — different scouts get separate profiles**

```move
#[test]
fun test_separate_profiles_per_scout() {
    // SCOUT creates a listing → profile with unverified=1
    // BUYER creates a listing → separate profile with unverified=1
    // Assert both profiles exist with correct counts
}
```

- [ ] **Step 7: Write test — has_profile returns false for unknown scout**

```move
#[test]
fun test_has_profile_false_for_unknown() {
    // Fresh registry, no listings
    // Assert has_profile(registry, SCOUT) == false
}
```

- [ ] **Step 8: Write test — borrow_profile aborts for unknown scout**

```move
#[test]
#[expected_failure(abort_code = marketplace::EProfileNotFound)]
fun test_borrow_profile_aborts_unknown() {
    // Fresh registry, call borrow_profile for unknown scout
}
```

- [ ] **Step 9: Run all tests**

Run: `.sui-bin/sui.exe move test --path contracts`
Expected: 57+/57+ tests passing (50 existing + 7 new)

- [ ] **Step 10: Commit**

```bash
git add contracts/tests/marketplace_tests.move
git commit -m "test(contract): ScoutProfile creation, counter increments, edge cases"
```

---

## Chunk 4: Frontend — Types, Parse, Hook, Transaction Builders

### Task 9: Add ScoutProfileFields type

**Files:**
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: Add the type** (after `PurchaseReceiptFields`)

```typescript
export interface ScoutProfileFields {
  readonly scout: string
  readonly totalZkVerified: bigint
  readonly totalPresenceVerified: bigint
  readonly totalCombatVerified: bigint
  readonly totalActivityVerified: bigint
  readonly totalStructureVerified: bigint
  readonly totalUnverified: bigint
  readonly firstVerifiedAt: bigint
  readonly lastVerifiedAt: bigint
}
```

- [ ] **Step 2: Commit**

### Task 10: Create scout-profile parse + display helpers

**Files:**
- Create: `frontend/src/lib/scout-profile.ts`
- Create: `frontend/src/lib/scout-profile.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, it } from 'vitest'
import type { ScoutProfileFields } from './types'
import {
  parseScoutProfile,
  totalVerified,
  verificationRate,
  reputationTier,
  reputationSummary,
} from './scout-profile'

function makeProfile(overrides: Partial<ScoutProfileFields> = {}): ScoutProfileFields {
  return {
    scout: '0xabc',
    totalZkVerified: 0n,
    totalPresenceVerified: 0n,
    totalCombatVerified: 0n,
    totalActivityVerified: 0n,
    totalStructureVerified: 0n,
    totalUnverified: 0n,
    firstVerifiedAt: 1000n,
    lastVerifiedAt: 1000n,
    ...overrides,
  }
}

describe('parseScoutProfile', () => {
  it('parses snake_case dynamic field value', () => {
    const fields = {
      total_zk_verified: '5',
      total_presence_verified: '3',
      total_combat_verified: '2',
      total_activity_verified: '1',
      total_structure_verified: '0',
      total_unverified: '10',
      first_verified_at: '1709000000000',
      last_verified_at: '1709100000000',
    }
    const result = parseScoutProfile('0xscout', fields)
    expect(result.scout).toBe('0xscout')
    expect(result.totalZkVerified).toBe(5n)
    expect(result.totalCombatVerified).toBe(2n)
    expect(result.totalUnverified).toBe(10n)
  })
})

describe('totalVerified', () => {
  it('sums all verified counters', () => {
    const p = makeProfile({
      totalZkVerified: 5n,
      totalPresenceVerified: 3n,
      totalCombatVerified: 2n,
    })
    expect(totalVerified(p)).toBe(10n)
  })

  it('returns 0n for empty profile', () => {
    expect(totalVerified(makeProfile())).toBe(0n)
  })
})

describe('verificationRate', () => {
  it('returns ratio of verified to total', () => {
    const p = makeProfile({ totalZkVerified: 3n, totalUnverified: 7n })
    expect(verificationRate(p)).toBeCloseTo(0.3)
  })

  it('returns 0 for empty profile', () => {
    expect(verificationRate(makeProfile())).toBe(0)
  })
})

describe('reputationTier', () => {
  it('returns null for < 10 verified', () => {
    expect(reputationTier(makeProfile({ totalCombatVerified: 5n }))).toBeNull()
  })

  it('returns bronze for 10+', () => {
    expect(reputationTier(makeProfile({ totalCombatVerified: 10n }))).toBe('bronze')
  })

  it('returns silver for 50+', () => {
    expect(reputationTier(makeProfile({ totalZkVerified: 50n }))).toBe('silver')
  })

  it('returns gold for 100+', () => {
    expect(reputationTier(makeProfile({ totalPresenceVerified: 100n }))).toBe('gold')
  })
})

describe('reputationSummary', () => {
  it('returns highest badge type label', () => {
    const p = makeProfile({ totalCombatVerified: 5n, totalStructureVerified: 3n })
    expect(reputationSummary(p)).toBe('5× Combat')
  })

  it('falls back to next tier if no combat', () => {
    const p = makeProfile({ totalPresenceVerified: 3n })
    expect(reputationSummary(p)).toBe('3× Presence')
  })

  it('returns null for unverified-only profile', () => {
    const p = makeProfile({ totalUnverified: 5n })
    expect(reputationSummary(p)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd frontend && npx vitest run src/lib/scout-profile.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement scout-profile.ts**

```typescript
import type { ScoutProfileFields } from './types'

export function parseScoutProfile(
  scout: string,
  fields: Record<string, unknown>,
): ScoutProfileFields {
  return {
    scout,
    totalZkVerified: BigInt(fields.total_zk_verified as string),
    totalPresenceVerified: BigInt(fields.total_presence_verified as string),
    totalCombatVerified: BigInt(fields.total_combat_verified as string),
    totalActivityVerified: BigInt(fields.total_activity_verified as string),
    totalStructureVerified: BigInt(fields.total_structure_verified as string),
    totalUnverified: BigInt(fields.total_unverified as string),
    firstVerifiedAt: BigInt(fields.first_verified_at as string),
    lastVerifiedAt: BigInt(fields.last_verified_at as string),
  }
}

export function totalVerified(p: ScoutProfileFields): bigint {
  return p.totalZkVerified
    + p.totalPresenceVerified
    + p.totalCombatVerified
    + p.totalActivityVerified
    + p.totalStructureVerified
}

export function verificationRate(p: ScoutProfileFields): number {
  const verified = totalVerified(p)
  const total = verified + p.totalUnverified
  if (total === 0n) return 0
  return Number(verified) / Number(total)
}

export function reputationTier(p: ScoutProfileFields): 'bronze' | 'silver' | 'gold' | null {
  const v = totalVerified(p)
  if (v >= 100n) return 'gold'
  if (v >= 50n) return 'silver'
  if (v >= 10n) return 'bronze'
  return null
}

const BADGE_ORDER: { key: keyof ScoutProfileFields; label: string }[] = [
  { key: 'totalCombatVerified', label: 'Combat' },
  { key: 'totalPresenceVerified', label: 'Presence' },
  { key: 'totalActivityVerified', label: 'Activity' },
  { key: 'totalStructureVerified', label: 'Structure' },
  { key: 'totalZkVerified', label: 'ZK-Verified' },
]

export function reputationSummary(p: ScoutProfileFields): string | null {
  for (const { key, label } of BADGE_ORDER) {
    const count = p[key] as bigint
    if (count > 0n) return `${count}× ${label}`
  }
  return null
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd frontend && npx vitest run src/lib/scout-profile.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/scout-profile.ts frontend/src/lib/scout-profile.test.ts frontend/src/lib/types.ts
git commit -m "feat(frontend): ScoutProfileFields type, parse, reputation helpers with tests"
```

### Task 11: Update transaction builders

**Files:**
- Modify: `frontend/src/lib/transactions.ts`

- [ ] **Step 1: Add `registryId: string` parameter to all builders that call listing/badge functions**

Update `buildCreateListingTx`:
```typescript
export function buildCreateListingTx(params: {
  registryId: string    // ← new
  intelType: number
  // ... rest unchanged
}): Transaction {
  const tx = new Transaction()
  const [stakeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(params.stakeAmount)])
  tx.moveCall({
    target: `${PACKAGE_ID}::marketplace::create_listing`,
    arguments: [
      tx.object(params.registryId),  // ← new, first argument
      tx.pure.u8(params.intelType),
      // ... rest unchanged
    ],
  })
  return tx
}
```

Apply the same pattern to:
- `buildCreateVerifiedListingTx` — add `registryId` as first moveCall argument
- `buildCreatePresenceVerifiedListingTx` — add `registryId` as first moveCall argument
- `buildAttachEventBadgeTx` — add `registryId` as first moveCall argument + add `tx.object(CLOCK_ID)` as last argument (new `clock` param)

- [ ] **Step 2: Add `SCOUT_REGISTRY_ID` to constants.ts** (placeholder until deploy)

```typescript
// Scout reputation registry (created in init)
export const SCOUT_REGISTRY_ID = '' // Set after fresh deploy
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/transactions.ts frontend/src/lib/constants.ts
git commit -m "feat(frontend): update transaction builders with registryId param"
```

### Task 12: Create useScoutProfile hook

**Files:**
- Create: `frontend/src/hooks/useScoutProfile.ts`

- [ ] **Step 1: Implement the hook**

```typescript
import { useSuiClient } from '@mysten/dapp-kit'
import { useQuery } from '@tanstack/react-query'

import { PACKAGE_ID, SCOUT_REGISTRY_ID } from '../lib/constants'
import { parseScoutProfile } from '../lib/scout-profile'
import type { ScoutProfileFields } from '../lib/types'

export function useScoutProfile(scoutAddress: string | null) {
  const suiClient = useSuiClient()
  return useQuery<ScoutProfileFields | null>({
    queryKey: ['scout-profile', scoutAddress],
    enabled: !!scoutAddress && !!SCOUT_REGISTRY_ID,
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!scoutAddress || !SCOUT_REGISTRY_ID) return null
      try {
        const result = await suiClient.getDynamicFieldObject({
          parentId: SCOUT_REGISTRY_ID,
          name: { type: 'address', value: scoutAddress },
        })
        if (!result.data?.content || result.data.content.dataType !== 'moveObject')
          return null
        const fields = result.data.content.fields as Record<string, unknown>
        return parseScoutProfile(scoutAddress, fields)
      } catch {
        return null
      }
    },
  })
}

/** Batch-fetch profiles for a list of scout addresses. */
export function useScoutProfiles(scoutAddresses: string[]) {
  const suiClient = useSuiClient()
  const unique = [...new Set(scoutAddresses)]
  return useQuery<Map<string, ScoutProfileFields>>({
    queryKey: ['scout-profiles', unique.join(',')],
    enabled: unique.length > 0 && !!SCOUT_REGISTRY_ID,
    refetchInterval: 15_000,
    queryFn: async () => {
      const map = new Map<string, ScoutProfileFields>()
      if (!SCOUT_REGISTRY_ID) return map
      const results = await Promise.allSettled(
        unique.map(async (addr) => {
          const result = await suiClient.getDynamicFieldObject({
            parentId: SCOUT_REGISTRY_ID,
            name: { type: 'address', value: addr },
          })
          if (result.data?.content?.dataType === 'moveObject') {
            const fields = result.data.content.fields as Record<string, unknown>
            map.set(addr, parseScoutProfile(addr, fields))
          }
        }),
      )
      return map
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useScoutProfile.ts
git commit -m "feat(frontend): useScoutProfile + useScoutProfiles hooks"
```

---

## Chunk 5: Frontend UI — Reputation Display

### Task 13: Add reputation display to ListingBrowser

**Files:**
- Modify: `frontend/src/components/ListingBrowser.tsx`

- [ ] **Step 1: Import reputation helpers and hook**

```typescript
import { useScoutProfiles } from '../hooks/useScoutProfile'
import { reputationSummary } from '../lib/scout-profile'
```

- [ ] **Step 2: Fetch profiles for all visible scouts**

Inside the component, after `useListings()`:

```typescript
const scoutAddresses = useMemo(
  () => filtered.map(l => l.scout),
  [filtered],
)
const { data: scoutProfiles } = useScoutProfiles(scoutAddresses)
```

- [ ] **Step 3: Display reputation inline on each listing**

After the existing badge display, before the meta line:

```tsx
{(() => {
  const profile = scoutProfiles?.get(listing.scout)
  if (!profile) return null
  const summary = reputationSummary(profile)
  if (!summary) return null
  return <span className="listing-scout-rep">{summary}</span>
})()}
```

- [ ] **Step 4: Add CSS for the reputation label**

In `frontend/src/index.css`, near the other listing badge styles:

```css
.listing-scout-rep {
  font-family: var(--font-display);
  font-size: 0.55rem;
  font-weight: 600;
  color: var(--hud-cyan);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 6px;
  border: 1px solid rgba(212, 168, 83, 0.3);
  border-radius: var(--radius);
  opacity: 0.8;
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ListingBrowser.tsx frontend/src/index.css
git commit -m "feat(frontend): inline scout reputation on listing cards"
```

### Task 14: Create ScoutProfilePanel component

**Files:**
- Create: `frontend/src/components/ScoutProfilePanel.tsx`

- [ ] **Step 1: Implement the panel**

```typescript
import { useScoutProfile } from '../hooks/useScoutProfile'
import { totalVerified, verificationRate, reputationTier } from '../lib/scout-profile'
import { truncateAddress } from '../lib/format'

interface ScoutProfilePanelProps {
  readonly scoutAddress: string
  readonly onClose: () => void
}

export function ScoutProfilePanel({ scoutAddress, onClose }: ScoutProfilePanelProps) {
  const { data: profile, isLoading } = useScoutProfile(scoutAddress)

  if (isLoading) return <p className="loading-text"><span className="loading-spinner" />Loading profile...</p>
  if (!profile) return <p className="empty-state">No reputation data for this scout.</p>

  const verified = totalVerified(profile)
  const rate = verificationRate(profile)
  const tier = reputationTier(profile)

  const rows = [
    { label: 'Combat Verified', count: profile.totalCombatVerified },
    { label: 'Presence Verified', count: profile.totalPresenceVerified },
    { label: 'Activity Verified', count: profile.totalActivityVerified },
    { label: 'Structure Verified', count: profile.totalStructureVerified },
    { label: 'ZK-Verified', count: profile.totalZkVerified },
    { label: 'Unverified', count: profile.totalUnverified },
  ]

  return (
    <section className="scout-profile-panel">
      <h3>{truncateAddress(scoutAddress)}</h3>
      {tier && <span className={`scout-tier scout-tier-${tier}`}>{tier}</span>}
      <div className="scout-stats">
        <span>{verified.toString()} verified</span>
        <span>{(rate * 100).toFixed(0)}% rate</span>
      </div>
      <ul className="scout-badge-breakdown">
        {rows.filter(r => r.count > 0n).map(({ label, count }) => (
          <li key={label}><strong>{count.toString()}</strong> {label}</li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 2: Wire into App.tsx** — add a scout profile panel trigger (clicking scout address in ListingBrowser or a panel state). This depends on how the existing panel system works. The simplest integration: add a `scoutPanel` state to App.tsx and render `ScoutProfilePanel` when set.

- [ ] **Step 3: Add CSS styles for scout profile panel**

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ScoutProfilePanel.tsx frontend/src/index.css
git commit -m "feat(frontend): ScoutProfilePanel component"
```

### Task 14b: Add "Verified scouts" filter to ListingBrowser

**Files:**
- Modify: `frontend/src/components/ListingBrowser.tsx`

- [ ] **Step 1: Add `verifiedScoutsOnly` state**

```typescript
const [verifiedScoutsOnly, setVerifiedScoutsOnly] = useState(false)
```

- [ ] **Step 2: Filter listings by scout reputation** (in the filtering chain)

```typescript
if (verifiedScoutsOnly && scoutProfiles) {
  result = result.filter((l) => {
    const profile = scoutProfiles.get(l.scout)
    return profile && totalVerified(profile) >= 5n
  })
}
```

- [ ] **Step 3: Add toggle button** (near the existing "Verified" filter button)

```tsx
<button
  className={`filter-btn${verifiedScoutsOnly ? ' active' : ''}`}
  onClick={() => setVerifiedScoutsOnly(!verifiedScoutsOnly)}
>
  Trusted Scouts
</button>
```

- [ ] **Step 4: Commit**

### Task 14c: Update transactions.test.ts

**Files:**
- Modify: `frontend/src/lib/transactions.test.ts`

- [ ] **Step 1: Update all transaction builder test calls to include `registryId` parameter**

Add `registryId: '0xregistry'` to all `buildCreateListingTx`, `buildCreateVerifiedListingTx`, `buildCreatePresenceVerifiedListingTx`, and `buildAttachEventBadgeTx` test invocations.

- [ ] **Step 2: Run tests, verify they pass**

Run: `cd frontend && npx vitest run src/lib/transactions.test.ts`

- [ ] **Step 3: Commit**

---

## Chunk 6: Deployment + Seed Update (DEFERRED — deploy once after Phase 4a/4a+/4b are all complete)

**Rationale:** Phase 4a+ (Merkle tree) adds fields to `ScoutProfileData` and Phase 4b (ZK reputation circuit) adds a new VKey. Each would require a fresh deploy. Rather than deploying three times and orphaning testnet listings each time, build and test all Phase 4 sub-phases locally, then do a single fresh deploy at the end.

### Task 15: Deploy and wire up

- [ ] **Step 1: Build contract**

Run: `.sui-bin/sui.exe move build --path contracts`

- [ ] **Step 2: Deploy fresh contract to testnet**

Run: `.sui-bin/sui.exe client publish --path contracts --gas-budget 500000000`

Capture from output:
- New `PACKAGE_ID`
- `LocationVKey` object ID
- `DistanceVKey` object ID
- `PresenceVKey` object ID
- `ScoutRegistry` object ID (new!)

- [ ] **Step 3: Update constants.ts with new IDs**

```typescript
export const PACKAGE_ID = '<new_package_id>'
export const LOCATION_VKEY_ID = '<new_location_vkey_id>'
export const DISTANCE_VKEY_ID = '<new_distance_vkey_id>'
export const PRESENCE_VKEY_ID = '<new_presence_vkey_id>'
export const SCOUT_REGISTRY_ID = '<new_registry_id>'
```

- [ ] **Step 4: Update seed script to pass registry**

In `frontend/src/scripts/seed.ts`, update the `createTx` call to include registry:

```typescript
createTx.moveCall({
  target: `${PACKAGE_ID}::marketplace::create_listing`,
  arguments: [
    createTx.object(SCOUT_REGISTRY_ID),  // ← new, first argument
    createTx.pure.u8(listing.intelType),
    // ... rest unchanged
  ],
})
```

Also update `attach_event_badge` calls to pass registry + clock.

- [ ] **Step 5: Run seed script**

```bash
cd frontend
$env:SUI_PRIVATE_KEY="<key>"; pnpm seed
```

- [ ] **Step 6: Verify in browser** — listings show scout reputation, profile panel works

- [ ] **Step 7: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: all passing

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/constants.ts frontend/src/scripts/seed.ts
git commit -m "deploy: fresh contract with ScoutRegistry, update constants + seed"
```

### Task 16: Update CLAUDE.md

- [ ] **Step 1: Update project status and deployed object IDs**

Add `ScoutRegistry` object ID to deployment section. Update status to reflect Phase 4a completion. Update test counts.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update project status for Phase 4a scout reputation"
```

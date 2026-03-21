# Stackable Event Badges — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three new stackable verification badges (Combat Verified, Activity Verified, Structure Discovery) backed by on-chain SUI event tx digest references, alongside the existing ZK-based Presence Verified badge.

**Architecture:** Scouts attach on-chain event references (tx digests) to listings via a single `attach_event_badge` contract function. The frontend queries SUI events from the Stillness world package, verifies tx digests against actual transactions, and displays color-coded badges. No new ZK circuits — these events are already public.

**Tech Stack:** Move (SUI edition 2024), TypeScript/React, Vitest 4, SUI JSON-RPC (`suix_queryEvents`, `getTransactionBlock`)

**Spec:** `docs/brainstorms/2026-03-20-stackable-event-badges-brainstorm.md`

---

## Design Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Verification mechanism | Tx digest reference (not ZK) | Events are already public on-chain — nothing to hide |
| On-chain vs frontend verification | Frontend-verified, on-chain-referenced | Move can't query historical transactions |
| Contract field structure | Named fields per badge type | Matches existing `jump_tx_digest` pattern |
| Badge attachment | Post-creation via `attach_event_badge` | Badges are optional; keeps creation functions simple |
| Default world package | Stillness for badge queries | Active data flowing (3100+ killmails). Presence proofs pass Utopia explicitly. |
| Character resolution | PlayerProfile primary + CharacterCreatedEvent fallback | Preserves existing behavior, adds Stillness compatibility |

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `contracts/sources/marketplace.move` | Modify | New fields, error constants, `BadgeAttached` event, `attach_event_badge`, getters |
| `contracts/tests/marketplace_tests.move` | Modify | Badge attachment tests |
| `frontend/src/lib/constants.ts` | Modify | Stillness world package ID |
| `frontend/src/lib/events.ts` | Modify | Killmail, inventory, structure query functions + parsers, character resolution fallback |
| `frontend/src/lib/events.test.ts` | Modify | Tests for new parsers and resolveCharacterId fallback |
| `frontend/src/lib/types.ts` | Modify | 3 new `Uint8Array` fields on `IntelListingFields` |
| `frontend/src/lib/parse.ts` | Modify | Parse new digest fields |
| `frontend/src/lib/parse.test.ts` | Modify | Tests for new field parsing |
| `frontend/src/lib/transactions.ts` | Modify | `buildAttachEventBadgeTx` |
| `frontend/src/lib/transactions.test.ts` | Modify | Test for new tx builder |
| `frontend/src/lib/badge-verify.ts` | Create | Badge verification logic (fetch tx, check events, cache) |
| `frontend/src/lib/badge-verify.test.ts` | Create | Tests for verification logic |
| `frontend/src/index.css` | Modify | 3 new badge CSS classes |
| `frontend/src/components/CreateListing.tsx` | Modify | "Attach Evidence" section |
| `frontend/src/components/ListingBrowser.tsx` | Modify | Badge rendering |
| `frontend/src/components/MyIntel.tsx` | Modify | Badge rendering |
| `frontend/src/components/MyListings.tsx` | Modify | Badge rendering |
| `frontend/src/components/RegionPanel.tsx` | Modify | Badge rendering |
| `frontend/src/lib/format.test.ts` | Modify | Update `makeListing` fixture |
| `frontend/src/lib/heat-map-data.test.ts` | Modify | Update `makeListing` fixture |

---

## Chunk 1: Contract

### Task 1: Contract — New Fields, Error Constants, Event, Getters

**Files:**
- Modify: `contracts/sources/marketplace.move`

- [ ] **Step 1: Add error constants**

After `const EInvalidPresenceProof: u64 = 22;` (line 34), add:

```move
const EInvalidBadgeType: u64 = 23;
const EBadgeAlreadyAttached: u64 = 24;
```

- [ ] **Step 2: Add new fields to `IntelListing` struct**

After `jump_tx_digest: vector<u8>,` (line 76), add:

```move
    killmail_tx_digest: vector<u8>,  // KillmailCreatedEvent tx digest (empty for none)
    deposit_tx_digest: vector<u8>,   // ItemDepositedEvent tx digest (empty for none)
    reveal_tx_digest: vector<u8>,    // LocationRevealedEvent tx digest (empty for none)
```

- [ ] **Step 3: Add `BadgeAttached` event struct**

After the `DistanceProofAttached` struct (line 143), add:

```move
public struct BadgeAttached has copy, drop {
    listing_id: ID,
    scout: address,
    badge_type: u8,
}
```

- [ ] **Step 4: Initialize new fields in all creation functions**

In `create_listing`, `create_verified_listing`, and `create_presence_verified_listing` — add after `jump_tx_digest: vector::empty(),` (or the existing `jump_tx_digest` value):

```move
        killmail_tx_digest: vector::empty(),
        deposit_tx_digest: vector::empty(),
        reveal_tx_digest: vector::empty(),
```

Note: `create_presence_verified_listing` passes `jump_tx_digest` as a parameter, not `vector::empty()`. The three new fields are always empty at creation time.

- [ ] **Step 5: Add getters**

After the `jump_tx_digest` getter, add:

```move
public fun killmail_tx_digest(listing: &IntelListing): &vector<u8> { &listing.killmail_tx_digest }
public fun deposit_tx_digest(listing: &IntelListing): &vector<u8> { &listing.deposit_tx_digest }
public fun reveal_tx_digest(listing: &IntelListing): &vector<u8> { &listing.reveal_tx_digest }
```

- [ ] **Step 6: Build and run tests**

Run: `D:/Misc/GitHub/portfolio/EF_intel/.sui-bin/sui.exe move test --path contracts`
Expected: All 42 tests pass (structural additions only, no new logic yet).

- [ ] **Step 7: Commit**

```bash
git add contracts/sources/marketplace.move
git commit -m "feat(contract): add badge fields, error constants, BadgeAttached event, getters"
```

---

### Task 2: Contract — `attach_event_badge` Function

**Files:**
- Modify: `contracts/sources/marketplace.move`

- [ ] **Step 1: Add the function**

After the `attach_distance_proof` function, add:

```move
/// Attach an on-chain event badge to an existing listing.
/// badge_type: 0 = killmail, 1 = deposit, 2 = structure discovery
/// tx_digest: the SUI transaction digest containing the relevant event.
/// No on-chain event verification — the contract stores the digest as an audit trail.
/// The frontend verifies the digest against the actual transaction.
public fun attach_event_badge(
    listing: &mut IntelListing,
    badge_type: u8,
    tx_digest: vector<u8>,
    ctx: &TxContext,
) {
    assert!(listing.scout == ctx.sender(), ENotScout);
    assert!(!listing.delisted, EAlreadyDelisted);
    assert!(badge_type <= 2, EInvalidBadgeType);

    if (badge_type == 0) {
        assert!(listing.killmail_tx_digest.is_empty(), EBadgeAlreadyAttached);
        listing.killmail_tx_digest = tx_digest;
    } else if (badge_type == 1) {
        assert!(listing.deposit_tx_digest.is_empty(), EBadgeAlreadyAttached);
        listing.deposit_tx_digest = tx_digest;
    } else {
        assert!(listing.reveal_tx_digest.is_empty(), EBadgeAlreadyAttached);
        listing.reveal_tx_digest = tx_digest;
    };

    event::emit(BadgeAttached {
        listing_id: object::id(listing),
        scout: listing.scout,
        badge_type,
    });
}
```

- [ ] **Step 2: Build and run tests**

Run: `D:/Misc/GitHub/portfolio/EF_intel/.sui-bin/sui.exe move test --path contracts`
Expected: All 42 tests pass.

- [ ] **Step 3: Commit**

```bash
git add contracts/sources/marketplace.move
git commit -m "feat(contract): add attach_event_badge for stackable badges"
```

---

### Task 3: Contract Tests

**Files:**
- Modify: `contracts/sources/marketplace.move` (test-only helpers)
- Modify: `contracts/tests/marketplace_tests.move`

- [ ] **Step 1: Add test-only helpers**

In `contracts/sources/marketplace.move`, after the existing test-only helpers, add:

```move
#[test_only]
public fun set_killmail_tx_digest_for_testing(listing: &mut IntelListing, digest: vector<u8>) {
    listing.killmail_tx_digest = digest;
}
```

- [ ] **Step 2: Add test — new listings have empty badge digests**

In `contracts/tests/marketplace_tests.move`, add:

```move
#[test]
fun test_new_listing_empty_badge_digests() {
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
        assert!(marketplace::killmail_tx_digest(&listing).is_empty());
        assert!(marketplace::deposit_tx_digest(&listing).is_empty());
        assert!(marketplace::reveal_tx_digest(&listing).is_empty());
        test_scenario::return_shared(listing);
    };
    scenario.end();
}
```

- [ ] **Step 3: Add test — attach_event_badge stores killmail digest**

```move
#[test]
fun test_attach_killmail_badge() {
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
        marketplace::attach_event_badge(&mut listing, 0, b"killmail_digest_abc", scenario.ctx());
        assert!(*marketplace::killmail_tx_digest(&listing) == b"killmail_digest_abc");
        assert!(marketplace::deposit_tx_digest(&listing).is_empty());
        assert!(marketplace::reveal_tx_digest(&listing).is_empty());
        test_scenario::return_shared(listing);
    };
    scenario.end();
}
```

- [ ] **Step 4: Add test — attach_event_badge stores deposit digest**

```move
#[test]
fun test_attach_deposit_badge() {
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
        marketplace::attach_event_badge(&mut listing, 1, b"deposit_digest_xyz", scenario.ctx());
        assert!(marketplace::killmail_tx_digest(&listing).is_empty());
        assert!(*marketplace::deposit_tx_digest(&listing) == b"deposit_digest_xyz");
        test_scenario::return_shared(listing);
    };
    scenario.end();
}
```

- [ ] **Step 5: Add test — attach_event_badge stores reveal digest**

```move
#[test]
fun test_attach_reveal_badge() {
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
        marketplace::attach_event_badge(&mut listing, 2, b"reveal_digest_123", scenario.ctx());
        assert!(*marketplace::reveal_tx_digest(&listing) == b"reveal_digest_123");
        test_scenario::return_shared(listing);
    };
    scenario.end();
}
```

- [ ] **Step 6: Add test — rejects invalid badge type**

```move
#[test, expected_failure(abort_code = marketplace::EInvalidBadgeType)]
fun test_attach_badge_invalid_type() {
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
        marketplace::attach_event_badge(&mut listing, 3, b"bad", scenario.ctx());
        test_scenario::return_shared(listing);
    };
    scenario.end();
}
```

- [ ] **Step 7: Add test — rejects double-attach**

```move
#[test, expected_failure(abort_code = marketplace::EBadgeAlreadyAttached)]
fun test_attach_badge_double_attach() {
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
        marketplace::attach_event_badge(&mut listing, 0, b"first", scenario.ctx());
        marketplace::attach_event_badge(&mut listing, 0, b"second", scenario.ctx());
        test_scenario::return_shared(listing);
    };
    scenario.end();
}
```

- [ ] **Step 8: Add test — rejects non-scout**

```move
#[test, expected_failure(abort_code = marketplace::ENotScout)]
fun test_attach_badge_not_scout() {
    let mut scenario = test_scenario::begin(SCOUT);
    {
        let ctx = scenario.ctx();
        let clk = clock::create_for_testing(ctx);
        let stake = coin::mint_for_testing<SUI>(1_000_000, ctx);
        marketplace::create_listing(1, 42, 500_000, 24, b"blob", stake, &clk, ctx);
        clock::destroy_for_testing(clk);
    };
    scenario.next_tx(BUYER);
    {
        let mut listing = scenario.take_shared<IntelListing>();
        marketplace::attach_event_badge(&mut listing, 0, b"nope", scenario.ctx());
        test_scenario::return_shared(listing);
    };
    scenario.end();
}
```

- [ ] **Step 9: Add test — rejects attach on delisted listing**

```move
#[test, expected_failure(abort_code = marketplace::EAlreadyDelisted)]
fun test_attach_badge_on_delisted() {
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
        marketplace::delist(&mut listing, scenario.ctx());
        test_scenario::return_shared(listing);
    };
    scenario.next_tx(SCOUT);
    {
        let mut listing = scenario.take_shared<IntelListing>();
        marketplace::attach_event_badge(&mut listing, 0, b"too_late", scenario.ctx());
        test_scenario::return_shared(listing);
    };
    scenario.end();
}
```

- [ ] **Step 10: Run all tests**

Run: `D:/Misc/GitHub/portfolio/EF_intel/.sui-bin/sui.exe move test --path contracts`
Expected: **50 tests pass** (42 existing + 8 new).

- [ ] **Step 11: Commit**

```bash
git add contracts/sources/marketplace.move contracts/tests/marketplace_tests.move
git commit -m "test(contract): stackable badge tests — attach, type validation, double-attach, auth, delist"
```

---

## Chunk 2: Frontend — Data Layer

### Task 4: Frontend — Constants (Stillness World Package)

**Files:**
- Modify: `frontend/src/lib/constants.ts`

- [ ] **Step 1: Add Stillness constant and rename existing**

Replace the current `WORLD_PACKAGE_ID` line:
```typescript
/** EVE Frontier world-contracts package ID on Utopia testnet. */
export const WORLD_PACKAGE_ID = '0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75'
```

With:
```typescript
/** EVE Frontier world-contracts package ID — Utopia (sandbox). */
export const WORLD_PACKAGE_UTOPIA = '0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75'

/** EVE Frontier world-contracts package ID — Stillness (live production). */
export const WORLD_PACKAGE_STILLNESS = '0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c'

/** Active world package for event queries (Stillness has active data in Cycle 5). */
export const WORLD_PACKAGE_ID = WORLD_PACKAGE_STILLNESS
```

- [ ] **Step 2: Update imports that reference WORLD_PACKAGE_ID**

In `frontend/src/lib/events.ts`, the existing `import { WORLD_PACKAGE_ID } from './constants'` continues to work unchanged. In `frontend/src/components/CreateListing.tsx`, `WORLD_PACKAGE_ID` is imported — add `WORLD_PACKAGE_UTOPIA` to the import for the presence verification flow:

```typescript
import { ..., WORLD_PACKAGE_ID, WORLD_PACKAGE_UTOPIA, ... } from '../lib/constants'
```

Update the presence verification calls in `handleVerifyPresenceToggle` and `handleJumpSelect` to explicitly use `WORLD_PACKAGE_UTOPIA` instead of `WORLD_PACKAGE_ID` (since JumpEvents are on Utopia, not Stillness):

```typescript
const characterId = await resolveCharacterId(suiClient, trimmed, WORLD_PACKAGE_UTOPIA)
const jumps = await fetchJumpEvents(suiClient, characterId, WORLD_PACKAGE_UTOPIA)
const gateLocations = await fetchLocationEvents(suiClient, gateIds, WORLD_PACKAGE_UTOPIA)
```

And in `handleJumpSelect`:
```typescript
const loc = await fetchLocationEvent(suiClient, jump.destinationGateId, WORLD_PACKAGE_UTOPIA)
```

- [ ] **Step 3: Run all tests**

Run: `cd frontend && pnpm exec vitest run`
Expected: All 210 tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/constants.ts frontend/src/components/CreateListing.tsx
git commit -m "feat(frontend): add Stillness world package, explicit Utopia for presence proofs"
```

---

### Task 5: Frontend — Event Parsers + Query Functions (TDD)

**Files:**
- Modify: `frontend/src/lib/events.ts`
- Modify: `frontend/src/lib/events.test.ts`

- [ ] **Step 1: Write failing tests for killmail parser**

In `frontend/src/lib/events.test.ts`, add:

```typescript
import { parseKillmailEvent, parseInventoryEvent } from './events'

describe('parseKillmailEvent', () => {
  const rawEvent = {
    parsedJson: {
      key: { item_id: '3100', tenant: 'stillness' },
      killer_id: { item_id: '2112081012', tenant: 'stillness' },
      victim_id: { item_id: '2112081029', tenant: 'stillness' },
      reported_by_character_id: { item_id: '2112081012', tenant: 'stillness' },
      loss_type: { '@variant': 'SHIP' },
      kill_timestamp: '1774039974',
      solar_system_id: { item_id: '30016335', tenant: 'stillness' },
    },
    txDigest: 'KM_TX_ABC',
  }

  it('parses killer_id from nested TenantItemId', () => {
    expect(parseKillmailEvent(rawEvent).killerId).toBe('2112081012')
  })

  it('parses victim_id from nested TenantItemId', () => {
    expect(parseKillmailEvent(rawEvent).victimId).toBe('2112081029')
  })

  it('parses solar_system_id from nested TenantItemId', () => {
    expect(parseKillmailEvent(rawEvent).solarSystemId).toBe('30016335')
  })

  it('parses loss_type variant', () => {
    expect(parseKillmailEvent(rawEvent).lossType).toBe('SHIP')
  })

  it('parses kill_timestamp as bigint', () => {
    expect(parseKillmailEvent(rawEvent).killTimestamp).toBe(1774039974n)
  })

  it('parses txDigest', () => {
    expect(parseKillmailEvent(rawEvent).txDigest).toBe('KM_TX_ABC')
  })
})
```

- [ ] **Step 2: Write failing tests for inventory event parser**

```typescript
describe('parseInventoryEvent', () => {
  const rawEvent = {
    parsedJson: {
      assembly_id: '0x3b8f818473557bff',
      assembly_key: { item_id: '1000001408476', tenant: 'stillness' },
      character_id: '0xe0e9cdac5887d7cd',
      character_key: { item_id: '2112077957', tenant: 'stillness' },
      item_id: '1000001711419',
      type_id: '84210',
      quantity: 60,
    },
    txDigest: 'DEP_TX_XYZ',
  }

  it('parses assemblyId', () => {
    expect(parseInventoryEvent(rawEvent).assemblyId).toBe('0x3b8f818473557bff')
  })

  it('parses characterId', () => {
    expect(parseInventoryEvent(rawEvent).characterId).toBe('0xe0e9cdac5887d7cd')
  })

  it('parses quantity as number', () => {
    expect(parseInventoryEvent(rawEvent).quantity).toBe(60)
  })

  it('parses txDigest', () => {
    expect(parseInventoryEvent(rawEvent).txDigest).toBe('DEP_TX_XYZ')
  })
})
```

- [ ] **Step 3: Run tests to verify FAIL**

Run: `cd frontend && pnpm exec vitest run src/lib/events.test.ts`
Expected: FAIL — `parseKillmailEvent` and `parseInventoryEvent` not exported.

- [ ] **Step 4: Add `txDigest` to existing `LocationEvent` interface and parser**

In `frontend/src/lib/events.ts`, add `readonly txDigest: string` to the `LocationEvent` interface, and add `txDigest: raw.txDigest,` to the `parseLocationEvent` return object. This is needed so structure discovery badges can store the tx digest (not the assembly ID).

- [ ] **Step 5: Implement new parsers and interfaces**

In `frontend/src/lib/events.ts`, add the interfaces and parsers:

```typescript
export interface KillmailEvent {
  readonly killerId: string
  readonly victimId: string
  readonly solarSystemId: string
  readonly lossType: string
  readonly killTimestamp: bigint
  readonly txDigest: string
}

export interface InventoryEvent {
  readonly assemblyId: string
  readonly characterId: string
  readonly itemId: string
  readonly typeId: string
  readonly quantity: number
  readonly txDigest: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseKillmailEvent(raw: any): KillmailEvent {
  const json = raw.parsedJson
  return {
    killerId: json.killer_id.item_id,
    victimId: json.victim_id.item_id,
    solarSystemId: json.solar_system_id.item_id,
    lossType: json.loss_type['@variant'],
    killTimestamp: BigInt(json.kill_timestamp),
    txDigest: raw.txDigest,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseInventoryEvent(raw: any): InventoryEvent {
  const json = raw.parsedJson
  return {
    assemblyId: json.assembly_id,
    characterId: json.character_id,
    itemId: json.item_id,
    typeId: json.type_id,
    quantity: Number(json.quantity),
    txDigest: raw.txDigest,
  }
}
```

- [ ] **Step 6: Run tests to verify PASS**

Run: `cd frontend && pnpm exec vitest run src/lib/events.test.ts`
Expected: All pass.

- [ ] **Step 7: Add query functions**

In `frontend/src/lib/events.ts`, add:

```typescript
/** Fetch recent killmails, optionally filtered by character (as killer or victim). */
export async function fetchKillmails(
  suiClient: SuiClient,
  characterId?: string,
  packageId: string = WORLD_PACKAGE_ID,
): Promise<KillmailEvent[]> {
  const { data } = await suiClient.queryEvents({
    query: { MoveEventType: `${packageId}::killmail::KillmailCreatedEvent` },
    order: 'descending',
    limit: 50,
  })
  const all = data.map(parseKillmailEvent)
  if (characterId) return all.filter((e: KillmailEvent) =>
    e.killerId === characterId || e.victimId === characterId
  )
  return all
}

/** Fetch recent inventory deposit events, optionally filtered by character. */
export async function fetchInventoryEvents(
  suiClient: SuiClient,
  characterId?: string,
  packageId: string = WORLD_PACKAGE_ID,
): Promise<InventoryEvent[]> {
  const { data } = await suiClient.queryEvents({
    query: { MoveEventType: `${packageId}::inventory::ItemDepositedEvent` },
    order: 'descending',
    limit: 50,
  })
  const all = data.map(parseInventoryEvent)
  if (characterId) return all.filter((e: InventoryEvent) => e.characterId === characterId)
  return all
}

/** Fetch structures in a specific solar system via LocationRevealedEvent. */
export async function fetchStructuresInSystem(
  suiClient: SuiClient,
  solarSystem: string,
  packageId: string = WORLD_PACKAGE_ID,
): Promise<LocationEvent[]> {
  const { data } = await suiClient.queryEvents({
    query: { MoveEventType: `${packageId}::location::LocationRevealedEvent` },
    order: 'descending',
    limit: 200,
  })
  const parsed = data.map(parseLocationEvent)
  return parsed.filter((e: LocationEvent) => e.solarSystem === Number(solarSystem))
}
```

- [ ] **Step 8: Add CharacterCreatedEvent fallback to resolveCharacterId**

Update the existing `resolveCharacterId` function to add the fallback:

```typescript
export async function resolveCharacterId(
  suiClient: SuiClient,
  walletAddress: string,
  packageId: string = WORLD_PACKAGE_ID,
): Promise<string | null> {
  // Primary: PlayerProfile object lookup (works on Utopia)
  const { data } = await suiClient.getOwnedObjects({
    owner: walletAddress,
    filter: { StructType: `${packageId}::smart_character::PlayerProfile` },
    options: { showContent: true },
    limit: 1,
  })
  if (data.length > 0 && data[0]?.data?.content)
    return extractCharacterId(data[0].data.content, data[0].data.objectId)

  // Fallback: CharacterCreatedEvent lookup (works on Stillness)
  try {
    const { data: events } = await suiClient.queryEvents({
      query: { MoveEventType: `${packageId}::character::CharacterCreatedEvent` },
      order: 'descending',
      limit: 200,
    })
    for (const evt of events) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = (evt as any).parsedJson
      if (json?.character_address === walletAddress)
        return json.character_id
    }
  } catch {
    // Fallback failed — return null
  }

  return null
}
```

- [ ] **Step 9: Run all frontend tests**

Run: `cd frontend && pnpm exec vitest run`
Expected: All tests pass.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/lib/events.ts frontend/src/lib/events.test.ts
git commit -m "feat(frontend): killmail, inventory, structure query functions + character resolution fallback"
```

---

### Task 6: Frontend — Types + Parsing for New Digest Fields (TDD)

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/parse.ts`
- Modify: `frontend/src/lib/parse.test.ts`
- Modify: `frontend/src/lib/format.test.ts`
- Modify: `frontend/src/lib/heat-map-data.test.ts`

- [ ] **Step 1: Write failing tests**

In `frontend/src/lib/parse.test.ts`, add:

```typescript
describe('parseListingFields — event badge digests', () => {
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

  it('parses killmail_tx_digest when present', () => {
    const result = parseListingFields('0x1', { ...baseFields, killmail_tx_digest: [65, 66] })
    expect(result.killmailTxDigest).toEqual(new Uint8Array([65, 66]))
  })

  it('parses deposit_tx_digest when present', () => {
    const result = parseListingFields('0x1', { ...baseFields, deposit_tx_digest: [67, 68] })
    expect(result.depositTxDigest).toEqual(new Uint8Array([67, 68]))
  })

  it('parses reveal_tx_digest when present', () => {
    const result = parseListingFields('0x1', { ...baseFields, reveal_tx_digest: [69, 70] })
    expect(result.revealTxDigest).toEqual(new Uint8Array([69, 70]))
  })

  it('returns empty Uint8Arrays when badge digests missing', () => {
    const result = parseListingFields('0x1', { ...baseFields })
    expect(result.killmailTxDigest).toEqual(new Uint8Array([]))
    expect(result.depositTxDigest).toEqual(new Uint8Array([]))
    expect(result.revealTxDigest).toEqual(new Uint8Array([]))
  })
})
```

- [ ] **Step 2: Run tests to verify FAIL**

Run: `cd frontend && pnpm exec vitest run src/lib/parse.test.ts`
Expected: FAIL — `killmailTxDigest` not in result.

- [ ] **Step 3: Add fields to types.ts**

In `frontend/src/lib/types.ts`, add after `readonly jumpTxDigest: Uint8Array`:

```typescript
  readonly killmailTxDigest: Uint8Array
  readonly depositTxDigest: Uint8Array
  readonly revealTxDigest: Uint8Array
```

- [ ] **Step 4: Add parsing to parse.ts**

In `frontend/src/lib/parse.ts`, in the `parseListingFields` return object, add after `jumpTxDigest,`:

```typescript
    killmailTxDigest: new Uint8Array((fields.killmail_tx_digest as number[] | undefined) ?? []),
    depositTxDigest: new Uint8Array((fields.deposit_tx_digest as number[] | undefined) ?? []),
    revealTxDigest: new Uint8Array((fields.reveal_tx_digest as number[] | undefined) ?? []),
```

- [ ] **Step 5: Update test fixtures**

In `frontend/src/lib/format.test.ts` and `frontend/src/lib/heat-map-data.test.ts`, add to the `makeListing` function (before `...overrides`):

```typescript
    killmailTxDigest: new Uint8Array([]),
    depositTxDigest: new Uint8Array([]),
    revealTxDigest: new Uint8Array([]),
```

- [ ] **Step 6: Run all tests**

Run: `cd frontend && pnpm exec vitest run`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/parse.ts frontend/src/lib/parse.test.ts
git add frontend/src/lib/format.test.ts frontend/src/lib/heat-map-data.test.ts
git commit -m "feat(frontend): add killmail, deposit, reveal digest fields to types and parsing"
```

---

### Task 7: Frontend — Transaction Builder (TDD)

**Files:**
- Modify: `frontend/src/lib/transactions.ts`
- Modify: `frontend/src/lib/transactions.test.ts`

- [ ] **Step 1: Write failing test**

In `frontend/src/lib/transactions.test.ts`, add `buildAttachEventBadgeTx` to the import, then:

```typescript
describe('buildAttachEventBadgeTx', () => {
  it('returns a Transaction', () => {
    const tx = buildAttachEventBadgeTx({
      listingId: '0xLISTING',
      badgeType: 0,
      txDigest: new Uint8Array([65, 66, 67]),
    })
    expect(tx).toBeInstanceOf(Transaction)
  })
})
```

- [ ] **Step 2: Run test to verify FAIL**

- [ ] **Step 3: Implement**

In `frontend/src/lib/transactions.ts`, add:

```typescript
export function buildAttachEventBadgeTx(params: {
  listingId: string
  badgeType: number
  txDigest: Uint8Array
}): Transaction {
  const tx = new Transaction()
  tx.moveCall({
    target: `${PACKAGE_ID}::marketplace::attach_event_badge`,
    arguments: [
      tx.object(params.listingId),
      tx.pure.u8(params.badgeType),
      tx.pure.vector('u8', Array.from(params.txDigest)),
    ],
  })
  return tx
}
```

- [ ] **Step 4: Run all tests**

Run: `cd frontend && pnpm exec vitest run`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/transactions.ts frontend/src/lib/transactions.test.ts
git commit -m "feat(frontend): add buildAttachEventBadgeTx"
```

---

## Chunk 3: Frontend — UI

### Task 8: Badge CSS

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Add badge CSS classes**

After the existing `.listing-presence-badge` rule, add:

```css
/* Combat Verified — killmail-backed, highest trust */
.listing-combat-badge {
  font-size: 0.7rem;
  font-weight: 700;
  color: #ef4444;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 8px;
  border: 1px solid #ef4444;
  border-radius: var(--radius);
  align-self: center;
  margin-left: 8px;
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.3), 0 0 12px rgba(239, 68, 68, 0.1);
}

/* Activity Verified — inventory interaction */
.listing-activity-badge {
  font-size: 0.7rem;
  font-weight: 700;
  color: #10b981;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 8px;
  border: 1px solid #10b981;
  border-radius: var(--radius);
  align-self: center;
  margin-left: 8px;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.3), 0 0 12px rgba(16, 185, 129, 0.1);
}

/* Structure Discovery — location reveal */
.listing-discovery-badge {
  font-size: 0.7rem;
  font-weight: 700;
  color: #0ea5e9;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 8px;
  border: 1px solid #0ea5e9;
  border-radius: var(--radius);
  align-self: center;
  margin-left: 8px;
  box-shadow: 0 0 6px rgba(14, 165, 233, 0.3), 0 0 12px rgba(14, 165, 233, 0.1);
}
```

- [ ] **Step 2: Run all tests**

Run: `cd frontend && pnpm exec vitest run`
Expected: All pass (CSS-only change).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(frontend): combat, activity, discovery badge CSS with glow effects"
```

---

### Task 9: Badge Verification Library (TDD)

**Files:**
- Create: `frontend/src/lib/badge-verify.ts`
- Create: `frontend/src/lib/badge-verify.test.ts`

This module determines which badges a listing should display. It checks on-chain digest fields and, for tx-digest-based badges, verifies the referenced transaction actually contains the expected event type.

- [ ] **Step 1: Write failing tests**

Create `frontend/src/lib/badge-verify.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'

import { getBadges, BADGE_TRUST_ORDER } from './badge-verify'
import type { IntelListingFields } from './types'

function makeListing(overrides: Partial<IntelListingFields> = {}): IntelListingFields {
  return {
    id: '0x1',
    scout: '0x1',
    intelType: 0,
    systemId: 42n,
    createdAt: BigInt(Date.now()),
    observedAt: BigInt(Date.now()),
    decayHours: 24n,
    walrusBlobId: new Uint8Array([]),
    individualPrice: 500_000n,
    stakeValue: 100_000n,
    delisted: false,
    locationProofHash: new Uint8Array([]),
    isVerified: false,
    distanceProofHash: new Uint8Array([]),
    hasDistanceProof: false,
    distanceMeters: null,
    jumpTxDigest: new Uint8Array([]),
    killmailTxDigest: new Uint8Array([]),
    depositTxDigest: new Uint8Array([]),
    revealTxDigest: new Uint8Array([]),
    ...overrides,
  }
}

describe('getBadges', () => {
  it('returns empty array for unverified listing', () => {
    expect(getBadges(makeListing())).toEqual([])
  })

  it('returns ZK-Verified when only locationProofHash is set', () => {
    const badges = getBadges(makeListing({ isVerified: true, locationProofHash: new Uint8Array([1]) }))
    expect(badges).toEqual([{ type: 'zk-verified', label: 'ZK-Verified', className: 'listing-verified-badge' }])
  })

  it('returns Combat Verified for killmail digest', () => {
    const badges = getBadges(makeListing({ killmailTxDigest: new Uint8Array([1, 2]) }))
    expect(badges[0].type).toBe('combat')
  })

  it('returns multiple badges when stacked', () => {
    const badges = getBadges(makeListing({
      jumpTxDigest: new Uint8Array([1]),
      killmailTxDigest: new Uint8Array([2]),
      depositTxDigest: new Uint8Array([3]),
    }))
    expect(badges.length).toBe(3)
  })

  it('does not include ZK-Verified when event badges are present', () => {
    const badges = getBadges(makeListing({
      isVerified: true,
      locationProofHash: new Uint8Array([1]),
      killmailTxDigest: new Uint8Array([2]),
    }))
    expect(badges.find(b => b.type === 'zk-verified')).toBeUndefined()
  })

  it('returns badges in trust order (combat first)', () => {
    const badges = getBadges(makeListing({
      revealTxDigest: new Uint8Array([1]),
      killmailTxDigest: new Uint8Array([2]),
      depositTxDigest: new Uint8Array([3]),
    }))
    expect(badges[0].type).toBe('combat')
    expect(badges[1].type).toBe('activity')
    expect(badges[2].type).toBe('discovery')
  })
})

describe('BADGE_TRUST_ORDER', () => {
  it('has combat as highest trust', () => {
    expect(BADGE_TRUST_ORDER[0]).toBe('combat')
  })
})
```

- [ ] **Step 2: Run tests to verify FAIL**

Run: `cd frontend && pnpm exec vitest run src/lib/badge-verify.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement badge-verify.ts**

Create `frontend/src/lib/badge-verify.ts`:

```typescript
import type { IntelListingFields } from './types'

export interface Badge {
  readonly type: string
  readonly label: string
  readonly className: string
}

/** Trust order: highest first. Used for collapse display. */
export const BADGE_TRUST_ORDER = ['combat', 'presence', 'activity', 'discovery', 'zk-verified'] as const

const BADGE_DEFS: Record<string, { label: string; className: string }> = {
  combat: { label: 'Combat Verified', className: 'listing-combat-badge' },
  presence: { label: 'Presence Verified', className: 'listing-presence-badge' },
  activity: { label: 'Activity Verified', className: 'listing-activity-badge' },
  discovery: { label: 'Structure Discovery', className: 'listing-discovery-badge' },
  'zk-verified': { label: 'ZK-Verified', className: 'listing-verified-badge' },
}

/**
 * Determine which badges a listing should display.
 * Returns badges sorted by trust order (highest first).
 * ZK-Verified is only shown when no event badges are present.
 */
export function getBadges(listing: IntelListingFields): Badge[] {
  const badges: Badge[] = []

  if (listing.killmailTxDigest.length > 0)
    badges.push({ type: 'combat', ...BADGE_DEFS.combat })
  if (listing.jumpTxDigest.length > 0)
    badges.push({ type: 'presence', ...BADGE_DEFS.presence })
  if (listing.depositTxDigest.length > 0)
    badges.push({ type: 'activity', ...BADGE_DEFS.activity })
  if (listing.revealTxDigest.length > 0)
    badges.push({ type: 'discovery', ...BADGE_DEFS.discovery })

  // ZK-Verified fallback: only when no event badges and location proof exists
  if (badges.length === 0 && listing.isVerified)
    badges.push({ type: 'zk-verified', ...BADGE_DEFS['zk-verified'] })

  // Sort by trust order
  badges.sort((a, b) =>
    BADGE_TRUST_ORDER.indexOf(a.type as typeof BADGE_TRUST_ORDER[number])
    - BADGE_TRUST_ORDER.indexOf(b.type as typeof BADGE_TRUST_ORDER[number])
  )

  return badges
}

/** Max badges to display inline. Beyond this, collapse with "+N". */
export const MAX_INLINE_BADGES = 2
```

- [ ] **Step 4: Run tests to verify PASS**

Run: `cd frontend && pnpm exec vitest run src/lib/badge-verify.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/badge-verify.ts frontend/src/lib/badge-verify.test.ts
git commit -m "feat(frontend): badge verification library with trust ordering"
```

---

### Task 10: Badge Display Across Components

**Files:**
- Modify: `frontend/src/components/ListingBrowser.tsx`
- Modify: `frontend/src/components/MyIntel.tsx`
- Modify: `frontend/src/components/MyListings.tsx`
- Modify: `frontend/src/components/RegionPanel.tsx`
- Modify: `frontend/src/components/PurchaseFlow.tsx`

- [ ] **Step 1: Update badge rendering in all five components**

In each component, import `getBadges` and `MAX_INLINE_BADGES` from `../lib/badge-verify`, then replace the existing badge rendering block with:

```tsx
{(() => {
  const badges = getBadges(listing)
  const visible = badges.slice(0, MAX_INLINE_BADGES)
  const overflow = badges.length - visible.length
  return (
    <>
      {visible.map(b => (
        <span key={b.type} className={b.className}>{b.label}</span>
      ))}
      {overflow > 0 && (
        <span className="listing-verified-badge" title={badges.map(b => b.label).join(', ')}>
          +{overflow} more
        </span>
      )}
    </>
  )
})()}
```

Apply this pattern to all five components:
- `ListingBrowser.tsx` — in the listing item render
- `MyIntel.tsx` — in `renderItem`
- `MyListings.tsx` — in `renderListing`
- `RegionPanel.tsx` — in the listing map
- `PurchaseFlow.tsx` — in the purchase confirmation display (if it shows badges)

- [ ] **Step 2: Run all tests**

Run: `cd frontend && pnpm exec vitest run`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ListingBrowser.tsx frontend/src/components/MyIntel.tsx
git add frontend/src/components/MyListings.tsx frontend/src/components/RegionPanel.tsx
git add frontend/src/components/PurchaseFlow.tsx
git commit -m "feat(frontend): stackable badge rendering with collapse across all listing views"
```

---

### Task 11: CreateListing — Attach Evidence Section

**Files:**
- Modify: `frontend/src/components/CreateListing.tsx`

- [ ] **Step 1: Add new state variables**

After the existing presence verification state, add:

```typescript
const [attachCombat, setAttachCombat] = useState(false)
const [attachActivity, setAttachActivity] = useState(false)
const [attachStructure, setAttachStructure] = useState(false)
const [killmails, setKillmails] = useState<KillmailEvent[]>([])
const [inventoryEvents, setInventoryEvents] = useState<InventoryEvent[]>([])
const [structuresInSystem, setStructuresInSystem] = useState<LocationEvent[]>([])
const [selectedKillmail, setSelectedKillmail] = useState<KillmailEvent | null>(null)
const [selectedDeposit, setSelectedDeposit] = useState<InventoryEvent | null>(null)
const [selectedStructure, setSelectedStructure] = useState<LocationEvent | null>(null)
const [badgeSystemId, setBadgeSystemId] = useState<bigint | null>(null)
```

Add imports for the new types and functions:
```typescript
import { fetchKillmails, fetchInventoryEvents, fetchStructuresInSystem } from '../lib/events'
import type { KillmailEvent, InventoryEvent } from '../lib/events'
import { buildAttachEventBadgeTx } from '../lib/transactions'
```

- [ ] **Step 2: Add badge event fetching**

When the in-game wallet lookup runs (in `handleLookupJumps`), also fetch killmails and inventory events in parallel:

```typescript
// After fetching jumps, also fetch badge events
if (characterId || trimmed) {
  const [kms, invs] = await Promise.all([
    fetchKillmails(suiClient, characterId ?? undefined),
    fetchInventoryEvents(suiClient, characterId ?? undefined),
  ])
  setKillmails(kms)
  setInventoryEvents(invs)
}
```

- [ ] **Step 3: Add structure lookup function**

```typescript
async function handleBadgeSystemSelect(sysId: bigint | null) {
  setBadgeSystemId(sysId)
  setStructuresInSystem([])
  setSelectedStructure(null)
  if (!sysId) return
  try {
    const structures = await fetchStructuresInSystem(suiClient, sysId.toString())
    setStructuresInSystem(structures)
  } catch (err) {
    console.error('[fetchStructuresInSystem failed]', err)
  }
}
```

- [ ] **Step 4: Add "Attach Evidence" JSX section**

After the presence verification section and before the Price input, add:

```tsx
{/* Attach Evidence section — always visible when in-game wallet events are loaded */}
{(killmails.length > 0 || inventoryEvents.length > 0) && (
  <div className="form-section">
    <label className="form-label">Attach Evidence (optional)</label>

    {killmails.length > 0 && (
      <div className="form-group">
        <label className="verify-toggle">
          <input
            type="checkbox"
            checked={attachCombat}
            onChange={e => { setAttachCombat(e.target.checked); if (!e.target.checked) setSelectedKillmail(null) }}
          />
          {' Combat Verified'}
        </label>
        {attachCombat && (
          <select
            className="form-select"
            value={selectedKillmail?.txDigest ?? ''}
            onChange={e => {
              const km = killmails.find(k => k.txDigest === e.target.value)
              setSelectedKillmail(km ?? null)
            }}
          >
            <option value="">— Select a killmail —</option>
            {killmails.map(km => (
              <option key={km.txDigest} value={km.txDigest}>
                {new Date(Number(km.killTimestamp) * 1000).toLocaleDateString()} — System {km.solarSystemId} — {km.lossType.toLowerCase()}
              </option>
            ))}
          </select>
        )}
      </div>
    )}

    {inventoryEvents.length > 0 && (
      <div className="form-group">
        <label className="verify-toggle">
          <input
            type="checkbox"
            checked={attachActivity}
            onChange={e => { setAttachActivity(e.target.checked); if (!e.target.checked) setSelectedDeposit(null) }}
          />
          {' Activity Verified'}
        </label>
        {attachActivity && (
          <select
            className="form-select"
            value={selectedDeposit?.txDigest ?? ''}
            onChange={e => {
              const dep = inventoryEvents.find(d => d.txDigest === e.target.value)
              setSelectedDeposit(dep ?? null)
            }}
          >
            <option value="">— Select a deposit —</option>
            {inventoryEvents.map(dep => (
              <option key={dep.txDigest} value={dep.txDigest}>
                SSU {dep.assemblyId.slice(0, 10)}... — {dep.quantity}x item {dep.typeId}
              </option>
            ))}
          </select>
        )}
      </div>
    )}

    <div className="form-group">
      <label className="verify-toggle">
        <input
          type="checkbox"
          checked={attachStructure}
          onChange={e => { setAttachStructure(e.target.checked); if (!e.target.checked) { setSelectedStructure(null); setBadgeSystemId(null) } }}
        />
        {' Structure Discovery'}
      </label>
      {attachStructure && (
        <>
          <SystemPicker
            systems={galaxy?.systems ?? []}
            value={badgeSystemId}
            onChange={handleBadgeSystemSelect}
            label="Structure System"
            required={false}
          />
          {structuresInSystem.length > 0 && (
            <select
              className="form-select"
              value={selectedStructure?.assemblyId ?? ''}
              onChange={e => {
                const s = structuresInSystem.find(s => s.assemblyId === e.target.value)
                setSelectedStructure(s ?? null)
              }}
            >
              <option value="">— Select a structure —</option>
              {structuresInSystem.map(s => (
                <option key={s.assemblyId} value={s.assemblyId}>
                  {s.assemblyId.slice(0, 14)}... — type {s.typeId} — system {s.solarSystem}
                </option>
              ))}
            </select>
          )}
          {badgeSystemId && structuresInSystem.length === 0 && (
            <div className="form-hint">No revealed structures found in this system.</div>
          )}
        </>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 5: Add badge attachment to handleSubmit**

After the listing is created and the blob ID is set, add badge attachment:

```typescript
// Attach event badges (after blob ID is set)
const badgesToAttach: { type: number; digest: Uint8Array }[] = []
if (selectedKillmail)
  badgesToAttach.push({ type: 0, digest: new TextEncoder().encode(selectedKillmail.txDigest) })
if (selectedDeposit)
  badgesToAttach.push({ type: 1, digest: new TextEncoder().encode(selectedDeposit.txDigest) })
if (selectedStructure)
  badgesToAttach.push({ type: 2, digest: new TextEncoder().encode(selectedStructure.txDigest) })

if (badgesToAttach.length > 0) {
  setStatus('Attaching evidence badges...')
  for (const badge of badgesToAttach) {
    const badgeTx = buildAttachEventBadgeTx({
      listingId,
      badgeType: badge.type,
      txDigest: badge.digest,
    })
    const badgeResult = await signAndExecute({ transaction: badgeTx })
    await suiClient.waitForTransaction({ digest: badgeResult.digest })
  }
}
```

- [ ] **Step 6: Run all tests**

Run: `cd frontend && pnpm exec vitest run`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/CreateListing.tsx
git commit -m "feat(frontend): attach evidence section — combat, activity, structure badges"
```

---

## Chunk 4: Deploy

### Task 12: Contract Deploy + Constants Update

**This task requires manual offline steps.**

- [ ] **Step 1: Run all tests**

```bash
# Contract
D:/Misc/GitHub/portfolio/EF_intel/.sui-bin/sui.exe move test --path contracts

# Frontend
cd frontend && pnpm exec vitest run
```

Expected: ~50 contract tests + ~215 frontend tests, all pass.

- [ ] **Step 2: Deploy the contract**

```powershell
.sui-bin\sui.exe client publish --gas-budget 500000000 contracts
```

Record:
- Package ID
- LocationVKey object ID
- DistanceVKey object ID
- PresenceVKey object ID

- [ ] **Step 3: Update constants.ts**

```typescript
export const PACKAGE_ID = '<new_package_id>'
export const LOCATION_VKEY_ID = '<new_location_vkey_id>'
export const DISTANCE_VKEY_ID = '<new_distance_vkey_id>'
export const PRESENCE_VKEY_ID = '<new_presence_vkey_id>'
```

- [ ] **Step 4: Run all tests again**

Both test suites should still pass with the new constants.

- [ ] **Step 5: Commit**

```bash
git add contracts/sources/marketplace.move frontend/src/lib/constants.ts
git commit -m "feat: deploy stackable event badges"
```

---

## Post-Implementation

### Test Count Summary

| Suite | Before | After |
|-------|--------|-------|
| Move contract | 42 | ~50 (42 + 8 new) |
| Frontend (Vitest) | 210 | ~232 (210 + 10 parser + 4 parse + 1 tx + 7 badge-verify) |

### Documentation Updates

After all tasks pass:
1. Update `CLAUDE.md` — status, test counts, deploy IDs
2. Update `README.md` — test counts, new badges in Key Features
3. Update `docs/ARCHITECTURE.md` — add event badge section, update ER diagram

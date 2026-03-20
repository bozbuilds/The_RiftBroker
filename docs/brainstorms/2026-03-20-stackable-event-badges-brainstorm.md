# Stackable Event Badges — Design Spec

*Date: 2026-03-20*
*Status: Approved — ready for implementation planning*

---

## Problem

RiftBroker's current trust model relies on ZK presence proofs backed by JumpEvents. But JumpEvents only fire for gate-to-gate travel, gates aren't always deployed (Cycle 5 has zero gates), and many scouts prove their presence through other on-chain activity — combat, SSU interaction, or structure discovery. The marketplace needs richer, multi-source verification to reflect the full spectrum of on-chain evidence available to scouts.

## Solution

Four stackable verification badges, each backed by a different SUI on-chain event source. Scouts attach whichever evidence they have — a listing can earn multiple badges simultaneously. Two verification mechanisms: ZK circuits for coordinate-sensitive proofs, plain tx digest references for events that are already public.

---

## Badge System

### Badge Definitions

| Badge | Event Source | Trust Level | What It Proves | Visual |
|-------|-------------|-------------|----------------|--------|
| **Presence Verified** | `JumpEvent` | High | Scout jumped through a gate in/near this system | Purple glow `#a78bfa` |
| **Combat Verified** | `KillmailCreatedEvent` | Highest | Scout was in combat in this system | Red glow `#ef4444` |
| **Activity Verified** | `ItemDepositedEvent` | High | Scout physically interacted with an SSU | Green glow `#10b981` |
| **Structure Discovery** | `LocationRevealedEvent` | Medium | Scout identified a structure at known coordinates | Cyan glow `#0ea5e9` |

### Trust Hierarchy (highest to lowest)

1. Combat Verified — killmails can't be faked, proves physical presence in combat
2. Presence Verified — on-chain gate jump record
3. Activity Verified — physical interaction with a structure
4. Structure Discovery — knowledge of a structure's existence and location

### Stackability

- A listing can have 0 to 4 badges simultaneously
- Each badge is independent — the scout attaches whichever evidence they have
- When more than 2 badges are present, display collapses to the 2 highest-trust badges plus a "+N more" indicator
- Tooltip on hover reveals all badges with verification details

### Verification Split

| Badge | Mechanism | Why |
|-------|-----------|-----|
| Presence Verified | Full Groth16 ZK circuit (existing) | Coordinates and distance are private — need zero-knowledge proof |
| Combat Verified | On-chain tx digest reference, frontend-verified | Killmails are already public on-chain — nothing to hide |
| Activity Verified | On-chain tx digest reference, frontend-verified | Inventory events are already public on-chain |
| Structure Discovery | On-chain tx digest reference, frontend-verified | Location reveals are already public on-chain |

---

## Contract Changes

### New Fields on `IntelListing`

```move
killmail_tx_digest: vector<u8>,   // KillmailCreatedEvent tx digest (empty for none)
deposit_tx_digest: vector<u8>,    // ItemDepositedEvent tx digest (empty for none)
reveal_tx_digest: vector<u8>,     // LocationRevealedEvent tx digest (empty for none)
```

All initialized to `vector::empty()` in every creation function (`create_listing`, `create_verified_listing`, `create_presence_verified_listing`).

### New Entry Function

```move
/// Attach an on-chain event badge to an existing listing.
/// badge_type: 0 = killmail, 1 = deposit, 2 = structure discovery
/// tx_digest: the SUI transaction digest containing the relevant event
public fun attach_event_badge(
    listing: &mut IntelListing,
    badge_type: u8,
    tx_digest: vector<u8>,
    ctx: &TxContext,
)
```

**Guards:**
- `listing.scout == ctx.sender()` — only the scout can attach
- `!listing.delisted` — can't attach to a delisted listing
- Target field must be empty — no double-attach
- `badge_type` must be 0-2

**No on-chain event verification.** The contract stores the digest as an audit trail. The frontend verifies the digest against the actual transaction. This avoids the "can't query historical txs from Move" limitation.

### New Event

```move
public struct BadgeAttached has copy, drop {
    listing_id: ID,
    scout: address,
    badge_type: u8,
}
```

Emitted by `attach_event_badge` for frontend event query consistency (matches `DistanceProofAttached` pattern).

### New Error Constants

```move
const EInvalidBadgeType: u64 = 23;
const EBadgeAlreadyAttached: u64 = 24;
```

### New Getters

```move
public fun killmail_tx_digest(listing: &IntelListing): &vector<u8>
public fun deposit_tx_digest(listing: &IntelListing): &vector<u8>
public fun reveal_tx_digest(listing: &IntelListing): &vector<u8>
```

---

## Frontend Data Layer

### New Event Query Functions (`events.ts`)

**`fetchKillmails(suiClient, characterId?, packageId?)`**
- Queries `KillmailCreatedEvent` from the world package
- Filters by `killer_id` OR `victim_id` matching the character (client-side)
- Returns: `{ killerId, victimId, solarSystemId, lossType, killTimestamp, txDigest }`
- Note: on-chain fields are nested `TenantItemId` objects (e.g., `killer_id: { item_id, tenant }`). Parser must extract `item_id` from each.

**`fetchInventoryEvents(suiClient, characterId?, packageId?)`**
- Queries `ItemDepositedEvent` from the world package
- Filters by `character_id` matching the scout (client-side)
- Returns: `{ assemblyId, characterId, itemId, typeId, quantity, txDigest }`

**`fetchStructuresInSystem(suiClient, solarSystem, packageId?)`**
- Queries `LocationRevealedEvent` filtered by `solarsystem` (client-side)
- Returns: `{ assemblyId, solarSystem, x, y, z, locationHash, typeId, txDigest }`
- Used for system picker → structure selector flow

### Character ID Resolution

Add a Stillness-compatible fallback to the existing `resolveCharacterId`. The current `PlayerProfile` object lookup remains the primary path (working on Utopia). A new fallback queries `CharacterCreatedEvent` by `character_address` field — this covers Stillness where `PlayerProfile` objects may not be accessible.

```typescript
// Primary: existing PlayerProfile object lookup (unchanged)
// Fallback: query CharacterCreatedEvent, filter by character_address == walletAddress
```

This is an additive change, not a replacement. Existing behavior is preserved.

### Stillness Integration

```typescript
export const WORLD_PACKAGE_UTOPIA = '0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75'
export const WORLD_PACKAGE_STILLNESS = '0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c'
export const WORLD_PACKAGE_ID = WORLD_PACKAGE_STILLNESS  // active environment for event badges
```

All event query functions already accept `packageId` as a parameter with `WORLD_PACKAGE_ID` as the default.

**Note on environment switch:** Changing the default to Stillness means new badge queries (killmails, deposits, structures) hit Stillness where data is active. However, the existing Presence Verified flow (JumpEvent) will return empty results on Stillness because no gates exist in Cycle 5. Presence verification should pass `WORLD_PACKAGE_UTOPIA` explicitly until gates deploy on Stillness. The `packageId` parameter pattern supports this — no code change needed beyond the default switch.

**Note on Utopia package ID:** The v2 research doc lists a different Utopia world package ID (`0x2ff3e06b...`). The `0xd12a70c...` value in `constants.ts` has been working for existing JumpEvent queries, suggesting it may be an older deployment that's still valid. Both should be tested; the existing value is retained since it's proven functional.

### New Types (`types.ts`)

```typescript
readonly killmailTxDigest: Uint8Array
readonly depositTxDigest: Uint8Array
readonly revealTxDigest: Uint8Array
```

Added to `IntelListingFields`, parsed from on-chain fields in `parse.ts`.

---

## Frontend UX

### CreateListing — "Attach Evidence" Section

Appears below the existing verification toggles. Always visible (optional by nature, no toggle needed).

```
━━━ Attach Evidence (optional) ━━━

In-Game Wallet Address: [0x...]     ← shared with presence verification

☐ Combat Verified
  → [Dropdown: recent killmails — "3/20, System 30016335, killed 2112081029"]

☐ Activity Verified
  → [Dropdown: recent deposits — "3/20, SSU 0x3b8f... in System 30014589, 60x item 84210"]

☐ Structure Discovery
  → [System picker] → [Dropdown: structures in system — "SSU 0x431c..., type 88092"]
```

**Flow:**
1. Scout enters in-game wallet (if not already entered for presence verification)
2. On blur, fetch killmails + inventory events for their character (parallel queries)
3. Scout checks whichever badges they want, selects the specific event from each dropdown
4. Badge preview pills appear inline showing what the listing will display
5. On submit, listing is created first, then `attach_event_badge` called for each selected badge (sequential PTB commands in one atomic transaction)

### Badge Verification on Listing Load

When the frontend encounters non-empty digest fields:

1. Parse tx digest from listing's on-chain fields
2. Fetch transaction via `suiClient.getTransactionBlock({ digest, options: { showEvents: true } })`
3. Confirm the transaction's events contain the expected event type
4. Extract key details (system, character, timestamp) for tooltip display
5. Cache the result — no re-verification on every render

**Unverified digests:** If a scout submits a bogus digest (tx doesn't exist or doesn't contain the claimed event), the badge silently doesn't render. The on-chain field still has data, but the frontend won't vouch for it.

### Badge Display Across Components

All five listing views (ListingBrowser, RegionPanel, MyIntel, MyListings, PurchaseFlow) show badges consistently using the same rendering logic.

**Collapse behavior:** When more than 2 badges are present, show the 2 highest-trust badges plus a "+N" indicator. Full list available in a tooltip.

### Badge CSS

Each badge follows the existing `listing-presence-badge` pattern:

| Badge | Class | Color | Glow |
|-------|-------|-------|------|
| Presence Verified | `listing-presence-badge` (existing) | `#a78bfa` | `rgba(167,139,250,0.3)` |
| Combat Verified | `listing-combat-badge` | `#ef4444` | `rgba(239,68,68,0.3)` |
| Activity Verified | `listing-activity-badge` | `#10b981` | `rgba(16,185,129,0.3)` |
| Structure Discovery | `listing-discovery-badge` | `#0ea5e9` | `rgba(14,165,233,0.3)` |

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Badge verification mechanism | Hybrid: ZK for coordinates, tx digest for public events | No value in ZK-proving information that's already public on-chain |
| On-chain vs frontend verification | Frontend-verified, on-chain-referenced | Move contracts can't query historical transactions |
| Contract field structure | Named fields per badge type | Matches existing pattern, explicit, only 3-4 badge types foreseeable |
| Badge attachment | Post-creation via `attach_event_badge` | Badges are optional; keeps creation functions simple |
| Stackability | Stackable with 2+ collapse | Shows maximum trust signals without visual clutter |
| Character resolution | `PlayerProfile` primary + `CharacterCreatedEvent` fallback | Preserves existing behavior, adds Stillness compatibility |
| Default environment | Stillness for badge queries | Active data flowing there (3100+ killmails, inventory events, location reveals). Presence verification uses Utopia explicitly until gates deploy on Stillness. |
| Structure discovery input | System picker → structure dropdown | Scouts think in systems, not hex IDs |
| Structure discovery trust level | Medium (no interaction required) | Knowing a structure exists is valuable but doesn't prove physical presence |

---

## Data Dependencies

### Available Now (Stillness, active in Cycle 5)

- `KillmailCreatedEvent` — 3100+ events, critical intel
- `ItemDepositedEvent` — active inventory flow
- `LocationRevealedEvent` — structure coordinates
- `CharacterCreatedEvent` — wallet-to-character mapping

### Available When Gates Deploy

- `JumpEvent` — gate-to-gate movement (existing presence proof)

### Requires CCP Future Work

- Player ship coordinates — needed for "Player Proximity" badge
- Resource/rift locations — needed for "Resource Proximity" badge
- `PriorityListUpdatedEvent` data — turret targeting as proximity signal (turrets exist but no targeting data in Cycle 5)

---

## Scope & Non-Goals

**In scope:**
- Contract: new fields, `attach_event_badge`, getters, tests
- Frontend: event query functions, badge verification, CreateListing UX, badge display across all components
- Constants: Stillness world package ID, dual-environment support
- CSS: 3 new badge styles

**Not in scope (future work):**
- Automated intel generation from event patterns
- Buyer-side intelligence (event-driven purchase suggestions)
- Scout reputation system derived from badge history
- Event indexer/caching service for high-volume queries

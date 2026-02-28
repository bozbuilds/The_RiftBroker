---
title: "feat: Listing display & create UX improvements"
type: feat
date: 2026-02-27
brainstorm: docs/brainstorms/2026-02-27-listing-display-and-create-ux-brainstorm.md
---

# Listing Display & Create UX Improvements

## Overview

Two categories of pre-submission UX polish:

1. **System obfuscation** — Replace raw `system_id` numbers with region hints ("Core (4 systems)") in listing browser and My Intel. Exact system revealed only after decryption.
2. **Create form overhaul** — System dropdown, MIST/SUI conversion hints, "Quality Deposit" labeling with help text, and structured payload fields replacing raw JSON.

## Problem Statement

- Listing browser shows `System 30004759` — this reveals the exact intel location, undermining the value of the encrypted payload
- Price input in MIST gives no reference (1 SUI = 1,000,000,000 MIST)
- "Stake Amount" has no explanation of purpose
- "Intel Payload (JSON)" requires hand-writing JSON — hostile to players

## Proposed Solution

### Part A: System Obfuscation

Add helpers to `systems.ts` for region lookup and display. Replace system ID display in `ListingBrowser` and `MyIntel` with `obfuscatedLocation()`.

### Part B: Deposit Trust Signal on Listings

Add `stakeValue` to the parsed listing type. Display on listings in browse view as a trust signal.

### Part C: Create Form UX

Overhaul `CreateListing.tsx`:
- System dropdown (20 demo systems, grouped by region)
- MIST → SUI live preview on price and stake fields
- Stake relabeled to "Quality Deposit" with help text
- Type-specific structured fields replace JSON textarea

## Technical Approach

### Step 1: Region helpers in `systems.ts`

Add to `systems.ts`:

```typescript
// Pre-computed region → count map
export const REGION_SYSTEM_COUNTS: Record<string, number>

// Lookup: systemId → "Core (4 systems)" or "Unknown Region"
export function obfuscatedLocation(systemId: bigint): string
```

Uses the existing `SYSTEM_MAP` for O(1) lookup. Falls back to `'Unknown Region'` for IDs not in demo set.

### Step 2: Add `stakeValue` to listing type + parser

**`types.ts`** — Add `readonly stakeValue: bigint` to `IntelListingFields`.

**`parse.ts`** — Extract from `fields.stake`. SUI's `Balance<SUI>` serializes as `{ value: "amount" }` in the RPC response:

```typescript
stakeValue: BigInt((fields.stake as { value: string }).value)
```

**`parse.test.ts`** — Add test with `stake: { value: '50000000' }` fixture.

### Step 3: MIST/SUI conversion helper

Add to `format.ts`:

```typescript
export function mistToSui(mist: string): string | null
```

Returns `null` for empty/invalid input. Formats to up to 9 decimal places, strips trailing zeros. E.g., `'1000000000'` → `'1'`, `'500000000'` → `'0.5'`.

### Step 4: Obfuscate system in ListingBrowser + MyIntel

Replace `System {listing.systemId.toString()}` with `obfuscatedLocation(listing.systemId)` in both components.

Add deposit display: `{listing.stakeValue > 0n && <span>deposit: ...</span>}` using `mistToSui`.

### Step 5: Create form — system dropdown

Replace the System ID text input with a `<select>` grouped by region.

Options generated from `DEMO_SYSTEMS`, sorted by region then name. Each option shows `G-M4GK — Core`.

**Route type special case:** Routes span two systems. When `intelType === 3`, hide the main system dropdown. The route-specific payload fields will have their own origin/destination dropdowns. The on-chain `system_id` is set to the origin system.

### Step 6: Create form — MIST/SUI preview + deposit labeling

Add a `FormHint` inline component — small muted text below an input showing the SUI conversion. Used on both price and deposit fields.

Rename "Stake Amount (MIST)" label to "Quality Deposit (MIST)". Add help text below: *"Locked while your listing is active. Higher deposits signal confidence in your intel. Post-MVP: buyers can dispute bad intel to claim this deposit."*

### Step 7: Create form — structured payload fields

This is the largest change. Replace the JSON textarea with type-specific field groups.

**Shared state approach:** One `useState` per payload field (flat, not nested). On submit, build the payload object from state, validate with `intelPayloadSchema`, then proceed with existing encrypt/upload flow.

**Fields by type:**

| Type | Fields | Input | Notes |
|------|--------|-------|-------|
| Resource | resourceType | text | e.g., "Veldspar" |
| | yieldEstimate | number | positive integer |
| | coordinates x, y, z | 3 number inputs | inline row |
| Fleet | fleetSize | number | positive integer |
| | shipTypes | text | comma-separated, split on submit |
| | heading | text | optional |
| | observedAt | datetime-local | defaults to now |
| Base | structureType | text | e.g., "Smart Storage Unit" |
| | defenseLevel | number (0-10) | `type="range"` or number |
| | ownerTribe | text | optional |
| Route | originSystem | select (system dropdown) | replaces main system dropdown |
| | destSystem | select (system dropdown) | second system dropdown |
| | threatLevel | number (0-10) | |
| | gateCamps | 1-3 entries: system text + description | "Add gate camp" button |

**`systemId` in payload** auto-fills from the system dropdown selection (or `originSystemId` for Route). No manual entry needed.

**On submit**, the structured fields are assembled into an `IntelPayload` object matching the Zod schema, JSON-stringified, and fed into the existing encrypt → upload → set-blob flow. The existing `intelPayloadSchema.safeParse()` validates the assembled payload before proceeding.

### Step 8: CSS additions

```css
.form-hint { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }
.form-hint-value { color: var(--accent-green); }
.form-row { display: flex; gap: 8px; }
.form-row .form-group { flex: 1; }
.form-section { border-top: 1px solid var(--border); padding-top: 12px; margin-top: 4px; }
.deposit-badge { font-size: 0.75rem; color: var(--text-muted); }
```

### Step 9: Verify

- `pnpm test` — existing + new parser tests pass
- `pnpm build` — clean TypeScript build
- Browse: listings show region hint + deposit amount instead of system ID
- My Intel: same obfuscation
- Create form: system dropdown, SUI preview, structured fields, deposit help text

## Acceptance Criteria

- [ ] Listing browser shows "Core (4 systems)" instead of raw system ID
- [ ] My Intel shows same obfuscated location
- [ ] Deposit amount visible on listings (trust signal)
- [ ] Create form: system dropdown with 20 demo systems grouped by region
- [ ] Create form: price and deposit fields show live MIST → SUI conversion
- [ ] Create form: deposit field labeled "Quality Deposit" with help text
- [ ] Create form: intel type selection shows structured fields (no JSON textarea)
- [ ] Create form: Route type shows origin/dest dropdowns instead of single system
- [ ] Create form: assembled payload passes existing Zod validation
- [ ] All existing tests pass + new parser tests for stakeValue
- [ ] Clean TypeScript build

## Files Summary

| File | Action | What |
|------|--------|------|
| `src/lib/systems.ts` | Modify | Add `REGION_SYSTEM_COUNTS`, `obfuscatedLocation()` |
| `src/lib/types.ts` | Modify | Add `stakeValue: bigint` to `IntelListingFields` |
| `src/lib/parse.ts` | Modify | Extract `stake.value` for `stakeValue` |
| `src/lib/parse.test.ts` | Modify | Add stake parsing test |
| `src/lib/format.ts` | Modify | Add `mistToSui()` |
| `src/components/CreateListing.tsx` | Rewrite | System dropdown, structured fields, deposit UX, SUI preview |
| `src/components/ListingBrowser.tsx` | Modify | Obfuscated location, deposit badge |
| `src/components/MyIntel.tsx` | Modify | Obfuscated location |
| `src/index.css` | Modify | Hint, row, section, badge styles |

## Dependencies & Risks

- **No contract changes** — all changes are frontend-only
- **`Balance<SUI>` serialization** — need to verify `{ value: "..." }` shape against actual testnet RPC response. If the shape differs, `parseListingFields` needs adjustment.
- **Route type UX** — gate camp entries add form complexity. Capped at 3 entries to keep it manageable.

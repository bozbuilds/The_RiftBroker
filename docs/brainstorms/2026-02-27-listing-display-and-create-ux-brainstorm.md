# Listing Display & Create UX Improvements

**Date:** 2026-02-27
**Status:** Ready for planning

## What We're Building

Two categories of UX fixes before hackathon submission:

### 1. System Obfuscation in Listings

**Problem:** Listing browser and My Intel show the raw `system_id` (e.g., "30004759"). If this identifies the actual system containing the intel, showing it publicly undermines the intel's value — buyers already know *where* before paying.

**Decision:** Show **region + system count** instead of system ID (e.g., "Core (4 systems)"). The exact system is only revealed after purchase and decryption — it's already inside the encrypted payload.

**Scope:**
- ListingBrowser: replace `System {systemId}` with region label + count
- MyIntel: same treatment (pre-decrypt display)
- HeatMap: already shows system names on the map — this is fine since the map is a general overview, not tied to a specific listing's location. Consider whether heat map nodes should be grouped by region rather than pinpointing systems. (Decision: leave heat map as-is for now — it shows aggregate intel density, not individual listing locations.)
- IntelViewer (post-decrypt): continues showing exact system — this is the paid content

**Note:** `system_id` is stored on-chain in plaintext. UI-level obfuscation is sufficient for hackathon. A production version would store only a region hint on-chain and keep the exact system inside the encrypted payload only.

### 2. Create Listing Form UX

Four fields need improvement:

#### Price — MIST with SUI preview
- Keep input in MIST (precise for power users)
- Add live conversion hint below: "= 0.005 SUI" (1 SUI = 1,000,000,000 MIST)

#### System ID — Searchable dropdown
- Replace raw text input with dropdown of the 20 demo systems
- Each option shows: `G-M4GK — Core`
- Auto-fills the `system_id` bigint value
- Removes need for players to know numeric IDs

#### Stake Amount — Trust signal with future hint
- Rename label to "Quality Deposit (MIST)"
- Add help text: "Locked while your listing is active. Higher deposits signal confidence in your intel. Post-MVP: buyers can dispute bad intel to claim this deposit."
- Add same MIST → SUI conversion hint as price field
- Show deposit amount on listings in browser as a trust indicator

#### Intel Payload — Structured form fields
- Replace raw JSON textarea with specific fields per intel type
- When user selects intel type, show the relevant fields:
  - **Resource:** resource type, yield estimate, coordinates (x, y, z)
  - **Fleet:** fleet size, ship types (comma-separated), heading (optional), observed at
  - **Base:** structure type, defense level (1-10), owner tribe (optional)
  - **Route:** origin system, destination system, threat level (1-10), gate camps
- Auto-generate the JSON payload from structured inputs
- System ID within payload auto-filled from the system dropdown selection

## Why This Approach

- **Region obfuscation** preserves intel value while still giving buyers enough context to decide relevance
- **MIST + SUI preview** avoids breaking the existing contract interface while helping users understand value
- **Dropdown for systems** eliminates a common error source (typos) and leverages the existing `systems.ts` data
- **Trust signal framing for stake** is honest about current state while communicating the roadmap intent
- **Structured form** dramatically lowers the barrier — no player should have to write JSON

## Key Decisions

1. Region + system count for location hints (not region-only, not partial name reveal)
2. MIST input with SUI conversion preview (not SUI-first input)
3. Structured form fields for payload (not template-based JSON)
4. Stake as "Quality Deposit" trust signal with dispute teaser (not hidden, not enforced)
5. Searchable system dropdown (not raw text input)

## Open Questions

- Should the deposit amount be visible on listings in the browse view? (Leaning yes — it's a trust signal.)
- Heat map: leave as-is or group by region? (Decided: leave as-is for hackathon.)
- Post-MVP: reputation system design — how dispute windows, slashing math, and scout ratings interact with the deposit. Separate brainstorm needed.

## Stake / Reputation Roadmap (Post-MVP)

The quality deposit is the seed for a full reputation system:
- **Dispute window:** Buyers get N hours after purchase to dispute intel quality
- **Slashing:** Disputed + confirmed-bad intel causes scout to lose deposit (partially or fully)
- **Incentive design:** Stakes must be high enough to deter bad intel but not so high that scouts won't participate. The ratio between price and required deposit needs game-theory analysis.
- **Reputation score:** Accumulated successful sales (no disputes) build scout reputation, potentially reducing required deposit over time.

This is explicitly deferred — the contract already has the `Balance<SUI>` storage; the enforcement logic (`slash`, `dispute`, `resolve`) will be added in a future phase.

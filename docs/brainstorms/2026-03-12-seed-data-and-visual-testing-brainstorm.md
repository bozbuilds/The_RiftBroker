---
date: 2026-03-12
topic: seed-data-refresh-and-visual-testing
---

# Seed Data Refresh + Visual Testing

## What We're Building

Two things: (1) refresh the 15 seed listing definitions to use spatially diverse real galaxy systems — a dense cluster in one region plus scattered singles across 6 other regions — and (2) run screenshot-driven visual testing of the star map with the new seed data to verify the galaxy refactor renders correctly.

## Why This Approach

The current seed data uses 20 system IDs that happen to exist in the real galaxy data, but they cluster in only 2-3 actual regions. This doesn't exercise the map's ability to show intel spread across the disc. A mix of a dense hotspot + scattered singles tests both heat map aggregation (cluster) and camera auto-orient / region zone rendering (spatial spread).

Screenshot-driven testing catches visual regressions that unit tests can't: particle cloud shape, SystemDot visibility above particles, region zone wireframes, camera positioning, SVG fallback layout.

## Key Decisions

### Seed Data Layout

**Dense cluster — `869-Y-51` region (146 systems, galactic angle -150°):**
6 listings, all 4 intel types represented. Systems:
- `30006118` OJG-K03 — Resource (type 0)
- `30006094` IHK-745 — Resource (type 0)
- `30006070` ABT-MT2 — Fleet (type 1)
- `30006045` ILG-F13 — Fleet (type 1)
- `30006021` OB1-7J3 — Base (type 2)
- `30005997` I53-P81 — Base (type 2)

**Scattered singles — 6 distinct regions across the galaxy disc:**

| Region | Angle | System ID | Name | Intel Type |
|--------|-------|-----------|------|------------|
| K4T-Y | -180° | 30021737 | EQ6-V9N | Route (type 3) |
| PJ1-Y-33 | -87° | 30018133 | I75-7RC | Resource (type 0) |
| 877-Y-L1 | -1° | 30017833 | ETT-73N | Fleet (type 1) |
| L74-Y-21 | 71° | 30009437 | E71-QGJ | Base (type 2) |
| 398-6Y-J | 140° | 30001167 | OS7-VMC | Fleet (type 1) |
| R62-Y-04 | -169° | 30014670 | IG1-NV6 | Resource (type 0) |

Plus 3 route intel listings connecting systems across regions (origin in one scattered region, dest in another).

**Total: 15 listings** — same count as current, better geographic coverage.

### Visual Testing Checklist

After seeding, verify with screenshots:

1. **Galaxy particle cloud** — 24K background points visible, disc-shaped, two-tier core/frontier color
2. **Intel-active SystemDots** — visible as glowing colored spheres above the particle cloud
3. **Dense cluster rendering** — 869-Y-51 cluster shows overlapping glow rings + region zone wireframe
4. **Camera auto-orient** — camera is pointed toward the centroid of active systems on load
5. **Region zone wireframes** — at least 2-3 regions have convex hull wireframes visible
6. **SVG heat map fallback** — the 2D fallback tab renders nodes with correct spread
7. **SystemPicker** — typing a real system name produces correct search results
8. **Listing browser** — listings show real region names via `obfuscatedLocation`

## Open Questions

- Should we re-deploy the updated seeds to testnet or just test locally with mock data? (Deployment requires SUI testnet faucet and wallet interaction — separate step)

## Next Steps

1. `/workflows:plan` — implementation plan for seed data update + visual testing script
2. Update `seed-data.ts` and `seed-data.test.ts` with new system IDs
3. Run dev server and capture screenshots

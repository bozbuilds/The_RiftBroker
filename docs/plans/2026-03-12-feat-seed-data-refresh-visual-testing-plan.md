# Seed Data Refresh + Visual Testing

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 15 seed listings with spatially diverse real galaxy systems — a dense 6-listing cluster in one region plus scattered singles and cross-region routes — then deploy to testnet and verify the star map renders correctly via screenshot-driven visual testing.

**Architecture:** Update `seed-data.ts` in place with new system IDs from `galaxy.json`. All 18 referenced system IDs (15 listing systemIds + 3 route destinations) were verified to exist in the real dataset. Route listings strategically place origin systems in scattered-single regions to create multi-system regions that render convex hull wireframes.

**Tech Stack:** TypeScript, Vitest, SUI testnet (pnpm seed), browser screenshots

---

## Seed Data Layout

**Dense cluster — `869-Y-51` region (galactic angle -150°):**

| System ID | Name | Intel Type |
|-----------|------|------------|
| 30006118 | OJG-K03 | Resource (0) |
| 30006094 | IHK-745 | Resource (0) |
| 30006070 | ABT-MT2 | Fleet (1) |
| 30006045 | ILG-F13 | Fleet (1) |
| 30006021 | OB1-7J3 | Base (2) |
| 30005997 | I53-P81 | Base (2) |

**Scattered singles — 6 distinct regions:**

| Region | System ID | Name | Intel Type |
|--------|-----------|------|------------|
| K4T-Y | 30021737 | EQ6-V9N | Resource (0) |
| PJ1-Y-33 | 30018133 | I75-7RC | Resource (0) |
| 877-Y-L1 | 30017833 | ETT-73N | Fleet (1) |
| L74-Y-21 | 30009437 | E71-QGJ | Base (2) |
| 398-6Y-J | 30001167 | OS7-VMC | Fleet (1) |
| R62-Y-04 | 30014670 | IG1-NV6 | Resource (0) |

**Route intel — 3 cross-region routes (origin systemId in same region as a scattered single, dest in another):**

| Origin (systemId) | Origin Region | Dest | Dest Region |
|-------------------|---------------|------|-------------|
| 30021734 O5K-KCN | K4T-Y | 30018130 O3C-8LF | PJ1-Y-33 |
| 30017830 UTK-J3N | 877-Y-L1 | 30001164 I8J-DFD | 398-6Y-J |
| 30014667 I55-6J7 | R62-Y-04 | 30009434 O35-SMH | L74-Y-21 |

**Result:** 15 listings, 4 intel types, 7 regions with intel activity, 4 regions with wireframes (869-Y-51 polygon + 3 line wireframes from route-doubled regions).

---

### Task 1: Update Seed Data (TDD)

**Files:**
- Modify: `frontend/src/scripts/seed-data.ts`
- Modify: `frontend/src/scripts/seed-data.test.ts`

**Step 1: Update KNOWN_SYSTEM_IDS in the test file**

In `seed-data.test.ts`, replace the `KNOWN_SYSTEM_IDS` set with the 18 new system IDs:

```typescript
// Known real system IDs referenced by seed listings (verified in galaxy.json)
const KNOWN_SYSTEM_IDS = new Set([
  // Dense cluster — 869-Y-51
  30006118n, 30006094n, 30006070n, 30006045n, 30006021n, 30005997n,
  // Scattered singles
  30021737n, 30018133n, 30017833n, 30009437n, 30001167n, 30014670n,
  // Route origins (same region as a scattered single, different system)
  30021734n, 30017830n, 30014667n,
  // Route destinations
  30018130n, 30001164n, 30009434n,
])
```

**Step 2: Run tests — should fail**

Run: `cd frontend && pnpm test --run`
Expected: FAIL — seed listing system IDs no longer in KNOWN_SYSTEM_IDS.

**Step 3: Replace SEED_LISTINGS in seed-data.ts**

Replace the entire `SEED_LISTINGS` array with the 15 new listings. Keep the same interface, same price/stake/decay ranges, same payload structures.

```typescript
export const SEED_LISTINGS: readonly SeedListing[] = [
  // ── Dense cluster — 869-Y-51 region ──────────────────────────────────────

  // Resource: OJG-K03
  {
    intelType: 0,
    systemId: 30006118n,
    price: 100_000_000n,
    decayHours: 168n,
    stakeAmount: 30_000_000n,
    payload: {
      type: 0,
      systemId: '30006118',
      nearbyBody: 'Planet 3 Moon 1',
      resourceType: 'Feldspar Crystals',
      yieldTier: 'mid',
      notes: 'Stable deposit, low traffic area',
    },
  },
  // Resource: IHK-745
  {
    intelType: 0,
    systemId: 30006094n,
    price: 150_000_000n,
    decayHours: 336n,
    stakeAmount: 40_000_000n,
    payload: {
      type: 0,
      systemId: '30006094',
      nearbyBody: 'P2-M1',
      resourceType: 'Hydrated Sulfide Matrix',
      yieldTier: 'high',
    },
  },
  // Fleet: ABT-MT2
  {
    intelType: 1,
    systemId: 30006070n,
    price: 120_000_000n,
    decayHours: 168n,
    stakeAmount: 35_000_000n,
    payload: {
      type: 1,
      systemId: '30006070',
      fleetSize: 12,
      shipTypes: ['Frigate', 'Destroyer'],
      heading: 'NW toward Core',
      observedAt: '2026-03-12T10:30:00Z',
    },
  },
  // Fleet: ILG-F13
  {
    intelType: 1,
    systemId: 30006045n,
    price: 200_000_000n,
    decayHours: 504n,
    stakeAmount: 50_000_000n,
    payload: {
      type: 1,
      systemId: '30006045',
      fleetSize: 25,
      shipTypes: ['Frigate', 'Cruiser', 'Battleship', 'Destroyer'],
      heading: 'Stationary — gate camp',
      observedAt: '2026-03-12T08:00:00Z',
    },
  },
  // Base: OB1-7J3
  {
    intelType: 2,
    systemId: 30006021n,
    price: 150_000_000n,
    decayHours: 720n,
    stakeAmount: 40_000_000n,
    payload: {
      type: 2,
      systemId: '30006021',
      structureType: 'Smart Storage Unit',
      defenseLevel: 7,
      ownerTribe: 'Iron Guard',
    },
  },
  // Base: I53-P81
  {
    intelType: 2,
    systemId: 30005997n,
    price: 180_000_000n,
    decayHours: 504n,
    stakeAmount: 45_000_000n,
    payload: {
      type: 2,
      systemId: '30005997',
      structureType: 'Smart Turret',
      defenseLevel: 9,
    },
  },

  // ── Scattered singles — 6 distinct regions ────────────────────────────────

  // Resource: EQ6-V9N (K4T-Y)
  {
    intelType: 0,
    systemId: 30021737n,
    price: 200_000_000n,
    decayHours: 720n,
    stakeAmount: 50_000_000n,
    payload: {
      type: 0,
      systemId: '30021737',
      nearbyBody: 'P4-M2',
      resourceType: 'Deep-Core Carbon',
      yieldTier: 'high',
    },
  },
  // Resource: I75-7RC (PJ1-Y-33)
  {
    intelType: 0,
    systemId: 30018133n,
    price: 80_000_000n,
    decayHours: 240n,
    stakeAmount: 20_000_000n,
    payload: {
      type: 0,
      systemId: '30018133',
      nearbyBody: 'Planet 1',
      resourceType: 'Ice Shards',
      yieldTier: 'low',
      notes: 'Contested — hostiles seen in system',
    },
  },
  // Fleet: ETT-73N (877-Y-L1)
  {
    intelType: 1,
    systemId: 30017833n,
    price: 90_000_000n,
    decayHours: 168n,
    stakeAmount: 25_000_000n,
    payload: {
      type: 1,
      systemId: '30017833',
      fleetSize: 8,
      shipTypes: ['Frigate', 'Interceptor'],
      heading: 'S toward Southern Expanse',
      observedAt: '2026-03-12T14:15:00Z',
    },
  },
  // Base: E71-QGJ (L74-Y-21)
  {
    intelType: 2,
    systemId: 30009437n,
    price: 130_000_000n,
    decayHours: 720n,
    stakeAmount: 35_000_000n,
    payload: {
      type: 2,
      systemId: '30009437',
      structureType: 'Smart Storage Unit',
      defenseLevel: 6,
      ownerTribe: 'Void Runners',
    },
  },
  // Fleet: OS7-VMC (398-6Y-J)
  {
    intelType: 1,
    systemId: 30001167n,
    price: 180_000_000n,
    decayHours: 336n,
    stakeAmount: 45_000_000n,
    payload: {
      type: 1,
      systemId: '30001167',
      fleetSize: 5,
      shipTypes: ['Cruiser', 'Battleship'],
      observedAt: '2026-03-11T18:00:00Z',
    },
  },
  // Resource: IG1-NV6 (R62-Y-04)
  {
    intelType: 0,
    systemId: 30014670n,
    price: 70_000_000n,
    decayHours: 336n,
    stakeAmount: 20_000_000n,
    payload: {
      type: 0,
      systemId: '30014670',
      nearbyBody: 'P1-M3',
      resourceType: 'Compressed Regolith',
      yieldTier: 'mid',
    },
  },

  // ── Route intel — cross-region ────────────────────────────────────────────

  // Route: K4T-Y → PJ1-Y-33
  {
    intelType: 3,
    systemId: 30021734n,
    price: 160_000_000n,
    decayHours: 504n,
    stakeAmount: 40_000_000n,
    payload: {
      type: 3,
      originSystemId: '30021734',
      destSystemId: '30018130',
      threatLevel: 8,
      gateCamps: [
        { systemId: '30021735', description: 'Bubble camp on O5K-KCN gate' },
      ],
    },
  },
  // Route: 877-Y-L1 → 398-6Y-J
  {
    intelType: 3,
    systemId: 30017830n,
    price: 50_000_000n,
    decayHours: 240n,
    stakeAmount: 20_000_000n,
    payload: {
      type: 3,
      originSystemId: '30017830',
      destSystemId: '30001164',
      threatLevel: 3,
      gateCamps: [],
    },
  },
  // Route: R62-Y-04 → L74-Y-21
  {
    intelType: 3,
    systemId: 30014667n,
    price: 110_000_000n,
    decayHours: 336n,
    stakeAmount: 30_000_000n,
    payload: {
      type: 3,
      originSystemId: '30014667',
      destSystemId: '30009434',
      threatLevel: 6,
      gateCamps: [
        { systemId: '30014668', description: 'Gate camp at I55-6J7 Smart Gate' },
      ],
    },
  },
]
```

**Step 4: Run tests — should pass**

Run: `cd frontend && pnpm test --run`
Expected: all 7 seed-data tests pass + all other tests still pass.

**Step 5: Run build**

Run: `cd frontend && pnpm build`
Expected: clean TypeScript build.

**Step 6: Commit**

```
data: refresh seed listings with spatially diverse galaxy systems
```

---

### Task 2: Re-Seed to SUI Testnet

**Prerequisites:** SUI_PRIVATE_KEY in `frontend/.env` or `.env.local`, testnet faucet balance.

**Step 1: Check wallet balance**

Run: `.sui-bin/sui.exe client gas`
Verify sufficient balance for 15 listings (each listing = 3 transactions).

**Step 2: Run the seed script**

Run: `cd frontend && pnpm seed`
Expected: 15/15 created, 0 failed. Each listing logs:
- Created listing object ID
- Encrypted payload
- Uploaded blob to Walrus
- Set blob ID

**Step 3: Verify listings appear on-chain**

Run the dev server and browse listings:
```bash
cd frontend && pnpm dev
```

Open `http://localhost:5173` — listings should appear in Browse view with real system names via `obfuscatedLocation`.

**Step 4: Commit (no code changes — deployment only)**

No commit needed — this is a deployment step.

---

### Task 3: Screenshot-Driven Visual Testing

After seeding, verify the star map renders correctly with the new spatially diverse data.

**Step 1: Start dev server**

Run: `cd frontend && pnpm dev`

**Step 2: Open the app and navigate to the 3D star map tab**

Navigate to `http://localhost:5173` and select the "Map" view.

**Visual Checklist — capture screenshots and verify each:**

1. **Galaxy particle cloud** — 24K background points visible, disc-shaped, two-tier core/frontier color gradient
2. **Intel-active SystemDots** — visible as glowing colored spheres above the particle cloud. Should see dots in 7+ regions across the disc.
3. **Dense cluster rendering** — the 869-Y-51 cluster (6 dots close together) shows overlapping glow rings + a convex hull wireframe polygon
4. **Camera auto-orient** — on page load, the camera is pointed toward the centroid of active systems (should be biased toward the cluster at -150° but pulled somewhat by scattered singles)
5. **Region zone wireframes** — at least 3 regions show convex hull wireframe outlines (869-Y-51 polygon + K4T-Y, 877-Y-L1, R62-Y-04 line wireframes from route doubles)
6. **SVG heat map fallback** — switch to the 2D tab. Nodes should render with correct spatial spread across the map. Cluster nodes should be visibly grouped.
7. **SystemPicker** — in Create Listing, type "OJG" or "EQ6" — should produce correct search results matching real system names
8. **Listing browser** — listings in Browse view show real region names (e.g. "869-Y-51", "K4T-Y") via `obfuscatedLocation`

**Step 3: Document results**

Note any visual regressions or issues found during screenshot review.

---

## Verification Checklist

After all tasks:

- [ ] `pnpm test --run` — all tests pass (142+)
- [ ] `pnpm build` — clean TypeScript build
- [ ] 15 seed listings use 18 verified real galaxy system IDs
- [ ] All 4 intel types represented
- [ ] Dense cluster (6 listings in 869-Y-51) + scattered singles (6 regions) + routes (3 cross-region)
- [ ] Testnet deployment successful (15/15 created)
- [ ] 3D star map: particle cloud, SystemDots, wireframes, camera orient all render
- [ ] SVG fallback: spatially correct node layout
- [ ] SystemPicker returns real system names
- [ ] ListingBrowser shows real region names

# HANDOVER.md

## What We Worked On

This session completed **Phase 2** of The Dark Net — an encrypted intel marketplace for the EVE Frontier x SUI Hackathon. Phase 2 covers the full frontend lib layer, React hooks, components, and the Seal/Walrus integration functions in the Move contract.

### What Got Done

**Move contract additions** (17/17 tests, zero warnings):
- `seal_approve` — Seal policy entry function. Validates that the caller owns the receipt AND the receipt matches the requested listing ID (via BCS address decoding).
- `seal_approve_scout` — Seal policy for scouts to decrypt their own intel.
- `set_walrus_blob_id` — Two-step listing creation support. Allows scout to set the Walrus blob ID after listing creation (one-time, scout-only).
- Error constants: `ENotBuyer`, `EWrongListing`, `EBlobIdAlreadySet`.
- `#[test_only] transfer_receipt_for_testing` — workaround for key-only object transfer restriction in tests.

**Frontend lib modules** (21/21 vitest tests):
- `intel-schemas.ts` — Zod 4 discriminated union for 4 intel types (resource, fleet, base, route). 8 tests.
- `transactions.ts` — Pure PTB builders: `buildCreateListingTx`, `buildSetBlobIdTx`, `buildPurchaseTx`, `buildBatchPurchaseTx`. 6 tests.
- `walrus.ts` — `uploadBlob` (PUT to publisher), `downloadBlob` (GET from aggregator). 5 tests.
- `seal.ts` — `encryptIntel`, `decryptIntel`. Thin wrappers around SealClient. 2 tests.

**React hooks** (no dedicated tests — thin adapters):
- `useListings` — Queries `IntelListed` events, fetches listing objects, parses fields.
- `usePurchase` — Builds and executes purchase transactions.
- `useDecrypt` — Full decrypt lifecycle: download blob, build seal_approve tx, decrypt, Zod validate.

**React components**:
- `CreateListing` — Two-step flow: create listing (empty blob) -> encrypt -> upload to Walrus -> set blob ID.
- `ListingBrowser` — Filter by intel type, show time remaining, click to select.
- `PurchaseFlow` — Confirm purchase with price display.
- `IntelViewer` — Switch-renders by payload type (Resource/Fleet/Base/Route views).
- `App.tsx` — Browse/Create nav with full listing -> purchase -> decrypt flow.

---

## What Worked

- **Strict TDD** for all lib modules and contract functions. Red-green-refactor caught issues early.
- **Zod 4** is API-compatible with Zod 3 patterns (`z.object`, `z.discriminatedUnion`, `z.literal`).
- **Vitest 4** configured easily via `/// <reference types="vitest/config" />` in vite.config.ts.
- **PTB builders as pure functions** — easy to test without any SUI client dependency.
- **Two-step listing creation** cleanly resolves the Seal identity chicken-and-egg problem.

## What Didn't Work (and How It Was Fixed)

1. **`transfer::transfer` is module-restricted for key-only objects**
   - `PurchaseReceipt` has `key` only (no `store`), so `transfer::transfer` can only be called from the defining module.
   - Fix: Added `#[test_only] transfer_receipt_for_testing` helper in marketplace.move.

2. **`SealClientOptions` uses `serverConfigs`, not `serverObjectIds`**
   - The Seal 1.0 API changed from the spike doc's 0.6.0 assumptions.
   - Fix: Read actual `.d.mts` type definitions in node_modules and changed to `serverConfigs: []`.

3. **Seal `EncryptOptions.id` is a hex string, NOT Uint8Array**
   - Original code used `bcs.Address.serialize(listingId).toBytes()` which produced Uint8Array.
   - SDK source shows `createFullId(packageId, id)` calls `fromHex(id)` internally.
   - Fix: Pass the listing hex address string directly. SDK hex-decodes it to 32 bytes, which matches BCS-encoded address that `bcs::peel_address` expects in Move.

4. **`Uint8Array` not assignable to `BodyInit` with strict DOM types**
   - Fix: Use `data.buffer as ArrayBuffer` for the fetch body in `uploadBlob`.

5. **Test body copy-paste error in `seal_approve_scout_non_scout_aborts`**
   - An edit accidentally left the wrong test body (had the delisted listing test logic).
   - Fix: Caught by reading test output carefully, replaced with correct body.

---

## Key Decisions

| Decision | Why |
|----------|-----|
| **Two-step listing creation** (create empty -> encrypt -> upload -> set blob) | Seal encryption identity requires the listing address, which only exists after creation. This avoids the chicken-and-egg problem. |
| **Listing address as Seal inner identity** | Per-listing access control. `bcs::peel_address` in Move recovers the address from the raw bytes that Seal passes to `seal_approve`. |
| **`seal_approve` validates both buyer AND listing ID** | Without listing ID validation, a buyer with receipt for listing A could decrypt listing B. The `id` parameter from Seal key servers must match `receipt.listing_id`. |
| **`key` only (no `store`) for PurchaseReceipt** | Makes receipts non-transferable (soulbound). Prevents receipt trading that would undermine the marketplace. |
| **Hooks without dedicated tests** | Pragmatic exception for hackathon speed. Hooks are thin adapters around tested lib functions. Testing would require extensive React provider mocking for minimal value. |
| **Zod validation on decrypt** | Defense in depth. Even after Seal decryption, validate the payload against the schema before rendering. |

---

## Lessons Learned / Gotchas

- **Always read SDK type definitions from node_modules** before assuming APIs from docs or spike research. The Seal 1.0 API differs from the 0.6.0 spike in several ways.
- **BCS encoding of a SUI address is just the raw 32 bytes** (no length prefix). This means `fromHex(hexAddress)` produces the same bytes as `bcs::to_bytes(&address)`, making hex strings the natural bridge between TS and Move for Seal identity.
- **`transfer::transfer` restriction** is a common gotcha with `key`-only objects. Plan for `#[test_only]` transfer helpers in test modules.
- **Vitest `vi.stubGlobal('fetch', ...)`** works cleanly for testing HTTP-based modules like walrus.ts.
- **`data.buffer as ArrayBuffer`** is needed when passing Uint8Array to fetch body under strict DOM TypeScript types.

---

## Clear Next Steps

1. **Commit Phase 2 work** — Large uncommitted diff across contract and frontend.
2. **Update the plan document** — Mark Phase 2 items as complete, add implementation notes.
3. **Phase 3: Heat Map + Polish** (per plan):
   - Intel heat map visualization overlaid on star system data
   - CSS/styling pass (currently bare-bones inline styles)
   - Error handling polish
   - Responsive layout
4. **Phase 4: Deploy + Submit**:
   - Deploy contract to SUI testnet
   - Configure real Seal key server configs (currently empty array)
   - Set correct `PACKAGE_ID` in constants.ts
   - Build and deploy frontend
   - Hackathon submission materials

---

## Important Files Map

```
contracts/
  sources/marketplace.move         # Core contract (224 lines, 7 error constants, 3 entry fns)
  tests/marketplace_tests.move     # 17 tests covering all contract functions

frontend/src/
  lib/
    constants.ts                   # PACKAGE_ID, CLOCK_ID (placeholders)
    types.ts                       # IntelListingFields, INTEL_TYPES
    intel-schemas.ts               # Zod discriminated union (4 intel types)
    intel-schemas.test.ts          # 8 tests
    transactions.ts                # PTB builders (create, setBlobId, purchase, batch)
    transactions.test.ts           # 6 tests
    walrus.ts                      # uploadBlob, downloadBlob (HTTP API)
    walrus.test.ts                 # 5 tests
    seal.ts                        # encryptIntel, decryptIntel (Seal SDK wrappers)
    seal.test.ts                   # 2 tests
  hooks/
    useListings.ts                 # Event query -> object fetch -> parse
    usePurchase.ts                 # Sign+execute purchase tx
    useDecrypt.ts                  # Download -> seal_approve tx -> decrypt -> validate
  components/
    CreateListing.tsx              # Two-step creation form
    ListingBrowser.tsx             # Filterable listing list
    PurchaseFlow.tsx               # Purchase confirmation
    IntelViewer.tsx                # Type-switched intel renderer
  App.tsx                          # Root component with Browse/Create nav
  main.tsx                         # React entry point
  providers/AppProviders.tsx       # SuiClientProvider + WalletProvider + QueryClient

docs/
  plans/2026-02-12-*.md            # Full implementation plan (Phases 0-4)
  seal-spike.md                    # Seal research findings
  walrus-spike.md                  # Walrus research findings
  ARCHITECTURE.md                  # System architecture overview
```

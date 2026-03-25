# Project Gotchas

## SUI Dynamic Field Parsing
`getDynamicFieldObject` returns a `{type, fields}` wrapper inside `value`. Need two levels of unwrap:
```typescript
const wrapper = result.data.content.fields as Record<string, unknown>
const valueObj = (wrapper.value ?? wrapper) as Record<string, unknown>
const fields = (valueObj.fields ?? valueObj) as Record<string, unknown>
```

## Seeding (PowerShell)
`SUI_PRIVATE_KEY=value command` doesn't work in PowerShell. Use:
```powershell
$env:SUI_PRIVATE_KEY="suiprivkey1..."; cd frontend; pnpm seed
```

## scripts/ and tsconfig
`frontend/src/scripts/` is excluded from `tsconfig.json` — tsx handles its own TS compilation for CLI scripts.

## Proximity Proof Limitations
Presence proofs use per-assembly coordinates from on-chain `LocationRevealedEvent` (gates + structures only). Player and resource proximity require CCP Games to emit additional position events — circuit supports it, data isn't available yet.

## Two-Step Listing Creation
Create listing with empty blob → encrypt with listing ID → upload to Walrus → `set_walrus_blob_id`. Required because the listing ID (used as Seal encryption identity) doesn't exist until after the first tx.

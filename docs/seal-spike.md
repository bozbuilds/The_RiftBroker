# Seal Spike: Conditional Decryption for Intel Marketplace

**Date**: 2026-02-13
**Status**: Research complete. Hands-on verification pending (testnet).
**SDK**: `@mysten/seal@1.0.1`
**Verdict**: Viable. PurchaseReceipt-based access control maps to the subscription pattern.

---

## Architecture

Seal is Mysten Labs' decentralized secrets management (DSM) for SUI. Three layers:

1. **Client-side encryption** — IBE (Boneh-Franklin on BLS12-381) encrypts against a policy, not a person
2. **On-chain policies** — Move modules with `seal_approve` functions define access rules
3. **Key servers** — Off-chain federation (t-of-n threshold) releases decryption key shares only when `seal_approve` passes

**Critical insight**: Encryption is local (no server call). Decryption requires key server cooperation. The `seal_approve` transaction is *simulated* by key servers, never actually executed on-chain (no gas for decryption auth).

---

## Key Answers

**Q: Does the policy live on-chain or off-chain?**
A: **On-chain.** A Move package with `seal_approve` function(s). The package ID is the identity namespace.

**Q: How does Seal verify a PurchaseReceipt exists?**
A: The buyer passes their owned `PurchaseReceipt` as an argument to `seal_approve`. Key servers simulate the transaction; if it doesn't abort, they release key shares. The `seal_approve` function checks `receipt.buyer == ctx.sender()` and `receipt.listing_id` matches the requested identity.

**Q: Can `seal_approve` accept owned objects?**
A: The subscription example uses the same pattern (owned `Subscription` NFT). Highly likely yes, but **must verify on testnet**.

---

## seal_approve Rules

1. Name must start with `seal_approve`
2. First parameter must be `id: vector<u8>` (the inner identity)
3. Must be side-effect free (cannot modify state)
4. Abort = access denied; success = key share released
5. Can accept additional params: `&Clock`, shared objects, owned objects

---

## Our seal_approve Implementation

Add to `marketplace.move`:

```move
/// Seal policy: approve decryption if caller owns a valid PurchaseReceipt
entry fun seal_approve(
    id: vector<u8>,
    receipt: &PurchaseReceipt,
    ctx: &TxContext,
) {
    assert!(receipt.buyer == ctx.sender(), ENotBuyer);

    // id encodes the listing ID as BCS-serialized address bytes
    let mut bcs_id = bcs::new(id);
    let listing_addr = bcs::peel_address(&mut bcs_id);
    assert!(object::id_to_address(&receipt.listing_id) == listing_addr, EWrongListing);
}

/// Seal policy: scout can always decrypt their own intel
entry fun seal_approve_scout(
    id: vector<u8>,
    listing: &IntelListing,
    ctx: &TxContext,
) {
    assert!(listing.scout == ctx.sender(), ENotScout);
}
```

---

## Encrypt Flow (Scout Side)

```typescript
import { SealClient, getAllowlistedKeyServers } from '@mysten/seal'
import { bcs } from '@mysten/sui/bcs'

// 1. Scout creates listing on-chain first, gets listingId
// 2. Compute inner identity from listing ID
const innerId = bcs.Address.serialize(listingId).toBytes()

// 3. Encrypt locally (no server call)
const { encryptedObject } = await sealClient.encrypt({
  threshold: 2,
  packageId: PACKAGE_ID,
  id: innerId,
  data: intelPayload,  // Uint8Array
})

// 4. Upload to Walrus
const blobId = await uploadToWalrus(encryptedObject)
```

---

## Decrypt Flow (Buyer Side)

```typescript
// 1. Create session key (one wallet popup per session)
const sessionKey = await SessionKey.create({
  address: buyerAddress,
  packageId: PACKAGE_ID,
  ttlMin: 10,
  signer: ephemeralKeypair,
  suiClient,
})

// 2. Build seal_approve tx (simulated, never executed)
const tx = new Transaction()
tx.moveCall({
  target: `${PACKAGE_ID}::marketplace::seal_approve`,
  arguments: [
    tx.pure.vector('u8', innerIdBytes),
    tx.object(purchaseReceiptId),
  ],
})
const txBytes = await tx.build({
  client: suiClient,
  onlyTransactionKind: true,  // critical: simulation only
})

// 3. Download from Walrus + decrypt
const encryptedData = await downloadFromWalrus(blobId)
const plaintext = await sealClient.decrypt({
  data: encryptedData,
  sessionKey,
  txBytes,
})
```

---

## Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Owned object in seal_approve doesn't work | Medium | Test on testnet day 1. Fallback: allowlist pattern |
| SDK v1.0.1 (recently graduated) | Low | Pin version |
| Key servers down during judging | Low | Use threshold 2-of-3+ for redundancy |
| Session key UX (wallet popup) | Low | One popup per 10-min session |

---

## Fallback: Allowlist Pattern

If owned `PurchaseReceipt` doesn't work in simulation, add `buyers: Table<address, bool>` to `IntelListing`. On purchase, add buyer to table. `seal_approve` checks table membership instead of receipt ownership. This is the official Seal example pattern.

---

## Next Steps

1. ~~`pnpm add @mysten/seal` in frontend~~ Done (`@mysten/seal@1.0.1`)
2. Add `seal_approve` function to marketplace.move (TDD: test first)
3. Deploy marketplace.move to testnet with `seal_approve`
4. Test encrypt → purchase → decrypt round-trip
5. If owned object works: ship as-is. If not: switch to allowlist fallback.

---

## Sources

- [Seal Design.md](https://github.com/MystenLabs/seal/blob/main/Design.md)
- [Seal Documentation](https://seal-docs.wal.app/)
- [Seal Examples](https://github.com/MystenLabs/seal/tree/main/examples)
- [@mysten/seal npm](https://www.npmjs.com/package/@mysten/seal)
- [Seal SDK TypeDoc](https://sdk.mystenlabs.com/typedoc/modules/_mysten_seal.html)

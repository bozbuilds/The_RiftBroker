# Walrus Spike: Decentralized Blob Storage for Intel Payloads

**Date**: 2026-02-13
**Status**: Research complete. Hands-on verification pending (testnet).
**SDK**: `@mysten/walrus` (via `$extend(walrus())` pattern)
**Verdict**: Viable. Simple upload/download API. HTTP fallback available.

---

## Architecture

Walrus is Mysten Labs' decentralized storage protocol. Mainnet since March 2025.

- **SUI (on-chain)**: Blob metadata, storage resource ownership, availability certificates
- **Storage nodes (off-chain)**: ~103 nodes storing erasure-coded slivers (~4-5x replication)
- **Red Stuff encoding**: Custom erasure coding. Reconstruct from any 1/3 of shards.

**Key property**: Content-addressed blob IDs. Same content = same blob ID (deterministic).

---

## TypeScript SDK

### Installation

```bash
pnpm add @mysten/walrus @mysten/sui
```

### Client Setup

```typescript
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc'
import { walrus } from '@mysten/walrus'

const client = new SuiJsonRpcClient({
  url: getJsonRpcFullnodeUrl('testnet'),
  network: 'testnet',
}).$extend(
  walrus({
    uploadRelay: {
      host: 'https://upload-relay.testnet.walrus.space',
    },
  }),
)
```

### Upload

```typescript
const data = new TextEncoder().encode(JSON.stringify(intelPayload))

const { blobId } = await client.walrus.writeBlob({
  blob: data,
  deletable: false,
  epochs: 3,        // ~6 weeks
  signer: keypair,
})
// blobId: "guaJi9QLJOeoH8zZg11dtmbtWN4YmXRlDyxXCgMT5fo"
```

### Download

```typescript
const blob: Uint8Array = await client.walrus.readBlob({ blobId })
const intel = JSON.parse(new TextDecoder().decode(blob))
```

---

## HTTP API Alternative (Simpler)

For browser clients avoiding WASM overhead:

```typescript
// Upload
const res = await fetch(
  'https://publisher.walrus-testnet.walrus.space/v1/blobs?epochs=3',
  { method: 'PUT', body: encryptedPayload },
)
const { newlyCreated, alreadyCertified } = await res.json()
const blobId = newlyCreated?.blobObject?.blobId
  ?? alreadyCertified?.blobId

// Download
const blob = await fetch(
  `https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`
).then(r => r.arrayBuffer()).then(b => new Uint8Array(b))
```

**Testnet endpoints**:
- Publisher: `https://publisher.walrus-testnet.walrus.space`
- Aggregator: `https://aggregator.walrus-testnet.walrus.space`
- 10 MiB upload limit on public publishers

---

## Size Limits and Costs

| Metric | Value |
|--------|-------|
| Max blob size | 13.6 GiB |
| Public publisher HTTP limit | 10 MiB |
| Storage unit | 1.00 MiB |
| Encoded overhead | ~5x un-encoded size |
| Max epochs | 53 (~1.5 years) |

**Cost for small intel payloads** (< 1 KB): Dominated by fixed write fee (~20,000 FROST per blob). Negligible for hackathon.

---

## Blob ID Format

- **Type**: Content-addressed hash (base64url-encoded string)
- **On-chain Move type**: `u256` in the `Blob` struct
- **Our storage**: `vector<u8>` in `IntelListing.walrus_blob_id` (store the UTF-8 bytes of the base64url string)

---

## Serialization: JSON → Uint8Array

```typescript
// Encode (before Seal encryption + Walrus upload)
function serializeIntel(payload: IntelPayload): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload))
}

// Decode (after Walrus download + Seal decryption)
function deserializeIntel(blob: Uint8Array): IntelPayload {
  return JSON.parse(new TextDecoder().decode(blob))
}
```

JSON chosen for: human-debuggability, zero dependencies, negligible overhead at < 1 KB.

---

## Integration with Seal

The full pipeline:

```
Scout: JSON → Uint8Array → Seal.encrypt() → Walrus.upload() → blobId
                                                                  ↓
                                                    IntelListing { walrus_blob_id }
                                                                  ↓
Buyer: Walrus.download(blobId) → Seal.decrypt(sessionKey) → Uint8Array → JSON
```

Walrus stores ciphertext. Seal controls decryption. SUI enforces payment.

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| WASM bundle size in browser | Low | Use upload relay (offloads encoding) or HTTP API |
| Blob expiry after N epochs | Low | Intel is ephemeral by design (decay_hours) |
| Content-address dedup | Low | Include nonce in payload before encryption |
| Testnet WAL faucet limits | Low | Small blobs = negligible cost |

---

## Next Steps

1. ~~`pnpm add @mysten/walrus` in frontend~~ Done (`@mysten/walrus@1.0.3`)
2. Test upload/download round-trip on testnet (HTTP API first, then SDK)
3. Confirm blob ID format matches what we store in `walrus_blob_id`
4. Integrate with Seal encrypt/decrypt pipeline

---

## Sources

- [Walrus Docs](https://docs.wal.app/)
- [Walrus SDK](https://sdk.mystenlabs.com/walrus)
- [Walrus HTTP API](https://docs.walrus.site/usage/web-api.html)
- [@mysten/walrus npm](https://www.npmjs.com/package/@mysten/walrus)
- [Walrus Cost Calculator](https://costcalculator.wal.app/)

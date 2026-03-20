---
date: 2026-03-20
topic: zk-onchain-verified-intel
---

# ZK Phase 5 — On-Chain Verified Intel

> **Phase renumbering note:** The original ZK Phase 4 was "Scout Reputation" (see `2026-03-13-zk-phase4-scout-reputation-brainstorm.md`). This feature is being inserted as Phase 5; scout reputation becomes Phase 6. The on-chain verification work here is more foundational and should precede reputation scoring.

## What We're Building

Replace the self-signed galaxy.json trust model with on-chain SUI events as the source of truth for ZK proofs. Scouts prove system presence via `JumpEvent` and structure proximity via `LocationRevealedEvent` — both publicly queryable on the SUI blockchain without authentication. ZK proofs remain the verification mechanism: the contract verifies a single Groth16 proof instead of doing coordinate lookups.

## The Problem Today

Current flow:
1. Scout generates a ZK proof using coordinates from `galaxy.json` (a static file bundled at build time)
2. The Merkle root is self-signed — we are the trust anchor, not CCP
3. Coordinates are solar system centroids — one point per system, not per-object
4. There's no proof the scout was actually *in* the claimed system

This means:
- A scout could claim to be in system X without ever being there
- Proximity is limited to system-level granularity (~light-years)
- The trust model relies on our own Merkle tree, not game data

## Interaction with Phase 3 (Timestamp Freshness)

Phase 3 added `signal output timestamp` to the location circuit and `observed_at` to the contract with a 24-hour staleness cap (`MAX_OBSERVATION_AGE_MS`). This phase builds on that:

- **Phase 3's `timestampWitness`** (currently `Date.now()` at proof generation) is replaced by the **JumpEvent's block timestamp** — a CCP-determined time, not self-reported
- **`observed_at` extraction** from the proof's public signals stays the same mechanism
- **`MAX_OBSERVATION_AGE_MS`** still applies — jump must be within 24h to be accepted
- The existing Phase 3 code (contract staleness checks, frontend `observedAgo` display) works unchanged

## How On-Chain Events Fix This

EVE Frontier emits SUI events for gate jumps and assembly deployments. These are immutable, publicly queryable, and don't require authentication:

### JumpEvent — Presence Proof
```move
// Source: evefrontier/world-contracts — contracts/world/sources/assemblies/gate.move
public struct JumpEvent has copy, drop {
    source_gate_id: ID,
    destination_gate_id: ID,
    character_id: ID,
    character_key: TenantItemId,
    source_gate_key: TenantItemId,
    destination_gate_key: TenantItemId,
}
```
Proves: "Character C jumped through gate G at time T." Queryable via `suix_queryEvents` with the world package ID. Verified live on Utopia testnet — 8 real JumpEvents from 3 players confirmed.

### LocationRevealedEvent — Per-Assembly Coordinates
```move
// Source: evefrontier/world-contracts — contracts/world/sources/primitives/location.move
public struct LocationRevealedEvent has copy, drop {
    assembly_id: ID,
    assembly_key: TenantItemId,
    solarsystem: u64,
    x: String, y: String, z: String,  // Signed decimal strings (Move has no signed integers)
    location_hash: vector<u8>,         // 32-byte Poseidon2 hash
    type_id: String,
    owner_cap_id: ID,
}
```
Provides exact coordinates for gates, SSUs, turrets, and network nodes. This is the **per-object precision** we've been deferring since ZK Phase 2. Verified live — 15+ events on Utopia, 50+ on Stillness.

### Trust Model Comparison

| Aspect | Current (galaxy.json) | New (SUI events) |
|--------|----------------------|-------------------|
| Trust anchor | Self-signed Merkle tree | Blockchain immutability |
| Granularity | Solar system centroid | Per-assembly coordinates |
| Freshness | Static file (stale) | Live on-chain events |
| Presence proof | None | JumpEvent with timestamp |
| Auth required | None | None |
| Data availability | Always (bundled) | Requires SUI RPC |

## Architecture

```
SUI Blockchain (trust anchor)
    │
    ├── suix_queryEvents("JumpEvent")          → scout's gate jumps
    ├── suix_queryEvents("LocationRevealed")   → assembly coordinates
    │
    ▼
Frontend (proof generation)
    │
    ├── Fetch JumpEvent for scout's character
    ├── Fetch LocationRevealedEvent for source gate + target assembly
    ├── Join: JumpEvent.destination_gate_id == LocationRevealedEvent.assembly_id
    ├── Store JumpEvent tx digest for on-chain auditability
    │
    ▼
ZK Circuit (compact proof + distance computation)
    │
    ├── Private inputs: gate coords, target coords, jump timestamp
    ├── Verifies: Poseidon(gate_coords) == location_hash (binds coords to on-chain hash)
    ├── Computes: distance from gate to target structure
    ├── Outputs: distance, timestamp, coordinatesHash (public)
    │
    ▼
Move Contract (on-chain verification)
    │
    ├── groth16::verify(proof, public_inputs, vkey)
    └── Listing stores tx_digest for independent JumpEvent verification
```

## Key Decisions

### 1. On-chain events as circuit inputs (not PODs)

The scout fetches JumpEvent and LocationRevealedEvent data from the SUI blockchain. These are passed as private inputs to the ZK circuit. The circuit proves statements about this data, and the contract verifies the Groth16 proof.

**Why not PODs?** PODs require CCP's REST API (legacy, may be decommissioned) and the jump POD endpoint needs authentication we can't obtain. On-chain events are public, permanent, and don't depend on a legacy API.

**Trade-off:** On-chain events don't have EdDSA signatures like PODs, but blockchain immutability is an even stronger trust guarantee — you can't forge a SUI event.

### 2. Trust binding: tx digest + location hash verification

**The core trust question:** the circuit can't verify that events exist on-chain. How do we bind circuit inputs to on-chain reality?

**Decision: Two-layer trust binding.**

- **Layer 1 (cryptographic):** The `LocationRevealedEvent` includes a `location_hash` (32-byte Poseidon2 hash of coordinates). The circuit verifies that `Poseidon(scoutGateCoords) == location_hash`. This hash is on-chain and independently verifiable — a scout cannot fabricate coordinates that match a real gate's location hash without breaking Poseidon.

- **Layer 2 (auditability):** The listing stores the JumpEvent's **transaction digest** as a field. Anyone can look up this transaction on-chain to verify the jump actually happened. This is not enforced in the circuit (that would require the circuit to verify SUI transaction proofs, which is infeasible), but it provides a public audit trail.

Together: the ZK proof guarantees the math is correct (distance computation), the location hash binds coordinates to on-chain data, and the tx digest lets anyone verify the jump occurred.

### 3. Scout position = gate coordinates

When a scout jumps through a gate, their position is the gate's coordinates (from LocationRevealedEvent). This is an approximation — the scout could be elsewhere in the system — but it's the best position data available on-chain.

**Implication:** Proximity proofs show "distance from the gate I entered through to the target structure," not the scout's exact in-system position. This is still dramatically more precise than the current solar system centroid approach.

### 4. Galaxy.json replaced for proof generation

Scouts must fetch live on-chain event data when creating verified listings. Galaxy.json is still used for 3D map rendering and UI display, but no longer for ZK proof generation.

**If the SUI RPC is down:** The scout waits and lists later. No fallback to galaxy.json — the whole point is replacing the self-signed trust model.

### 5. Character ID linking via PlayerProfile

The contract needs to know the scout's wallet address maps to a `character_id` in JumpEvents. EVE Frontier stores `PlayerProfile` objects on-chain, owned by the player's wallet address, containing the `character_id`. The frontend queries `getOwnedObjects` filtered by the `PlayerProfile` type to resolve this mapping.

### 6. Existing verified listings remain valid

Listings verified under the previous trust model (self-signed Merkle root) keep their "ZK-Verified" badge. The proof was valid at creation time under the then-current VKey. After the new VKey is deployed, only new listings use the on-chain event trust model. No migration of existing listings is needed — the contract is redeployed (fresh package, fresh state) per the hackathon deployment model.

## Circuit Design

### Event Join Logic

The circuit must verify consistency between two event sources:

1. **JumpEvent** provides `destination_gate_id` (the gate the scout arrived at)
2. **LocationRevealedEvent** provides `assembly_id` + coordinates for that gate

The circuit verifies this join cryptographically:
- Input: `scoutGateCoords[3]` (private), `locationHash` (private, from LocationRevealedEvent)
- Constraint: `Poseidon(scoutGateCoords[0], scoutGateCoords[1], scoutGateCoords[2]) === locationHash`
- This ensures the coordinates match a real on-chain assembly's Poseidon2 hash

### Signed Coordinate Handling

On-chain coordinates are signed decimal strings (e.g., `"-21127680483892550000"`). The current location circuit treats coordinates as unsigned u64. This phase must handle signed values.

**Approach:** Reuse the AbsDiff hint pattern from the distance attestation circuit (`circuits/distance-attestation/distance-attestation.circom`). Signed coordinates are converted to BN254 field elements in JavaScript (negative values become large field elements). The distance computation uses the existing `AbsDiff` template which handles this correctly via `hint² == diff²` verification.

### Public Signals (5 total)

| Signal | Type | Purpose |
|--------|------|---------|
| `distance` | output | Manhattan distance between scout gate and target (meters) |
| `timestamp` | output | Jump timestamp for staleness validation |
| `coordinatesHash` | input | Poseidon hash of scout's gate coordinates |
| `targetHash` | input | Poseidon hash of target assembly coordinates |
| `locationHash` | input | On-chain Poseidon2 hash from LocationRevealedEvent (trust binding) |

### Private Inputs

| Input | Source |
|-------|--------|
| `scoutGateCoords[3]` | From LocationRevealedEvent for the scout's gate |
| `targetCoords[3]` | From LocationRevealedEvent for the target assembly |
| `absDiffHints[3]` | Off-chain computed `|scout - target|` per axis (existing pattern) |
| `jumpTimestamp` | Block timestamp of the JumpEvent transaction |

### Constraint Estimate

| Operation | Estimated constraints |
|-----------|----------------------|
| Poseidon hash (locationHash verification) | ~250 |
| Poseidon hash (coordinatesHash) | ~250 |
| Poseidon hash (targetHash) | ~250 |
| AbsDiff × 3 (hint² == diff² + Num2Bits) | ~600 |
| Manhattan distance sum | ~50 |
| Distance squaring | ~50 |
| Timestamp output | ~1 |
| **Total** | **~1,450** |

This is actually **smaller** than the current location circuit (~4,465 constraints) because we remove the 4-leaf Merkle tree verification and replace it with direct hash checks. The `.zkey` file should be similar size or smaller.

## Contract Changes

### New error constants
```move
const EInvalidLocationHash: u64 = 20;   // locationHash doesn't match proof
const EJumpTooOld: u64 = 21;            // jump timestamp exceeds staleness cap
```

### Modified `create_verified_listing`

```move
public fun create_verified_listing(
    intel_type: u8,
    system_id: u64,
    individual_price: u64,
    decay_hours: u64,
    walrus_blob_id: vector<u8>,
    stake: Coin<SUI>,
    vkey: &LocationVKey,
    proof_points_bytes: vector<u8>,
    public_inputs_bytes: vector<u8>,  // Now 160 bytes (5 × 32)
    jump_tx_digest: vector<u8>,       // Transaction digest for audit trail
    clock: &Clock,
    ctx: &mut TxContext,
)
```

### New listing field
```move
    jump_tx_digest: vector<u8>,  // SUI tx digest of the JumpEvent (audit trail)
```

### Timestamp extraction (unchanged from Phase 3)

The `bytes_to_u64_le` helper extracts `observed_at` from the proof's timestamp output. The `MAX_OBSERVATION_AGE_MS` staleness check still applies — the JumpEvent must be within 24 hours.

## Frontend Changes

### New: SUI event queries (`lib/events.ts`)
```typescript
async function fetchJumpEvents(suiClient, characterId, packageId): Promise<JumpEvent[]>
async function fetchLocationEvents(suiClient, assemblyId, packageId): Promise<LocationEvent>
async function resolveCharacterId(suiClient, walletAddress, packageId): Promise<string>
```

### Modified: Proof generation (`lib/zk-proof.ts`)
- New `generatePresenceProof()` using on-chain event data
- Replaces galaxy.json Merkle tree with live SUI queries
- Converts signed decimal string coordinates to BN254 field elements

### Modified: Constants (`lib/constants.ts`)
```typescript
export const WORLD_PACKAGE_ID_UTOPIA = '0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75'
```

### UI changes
- "Verified at gate X in system Y" display (instead of just "verified in system Y")
- Jump event selector if scout has multiple recent jumps

### Testing strategy
- Unit tests use recorded event fixtures (snapshot of real SUI event data)
- No live SUI RPC calls in Vitest — all event data mocked
- Integration testing against Utopia testnet done manually

## World Package IDs

Confirmed via EVE Frontier Discord (March 20, 2026):
- **Utopia (active):** `0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75`
- **Stillness:** `0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c`

Utopia has active gate infrastructure and jump events. Stillness has location data but no gate/jump activity. **These IDs should be verified at implementation time** via `suix_queryEvents` — CCP could redeploy during the hackathon.

## CCP's Approach (for reference)

CCP's own ZK POC lives at `projectawakening/pod-flow`. Key architectural differences:

| Aspect | CCP (pod-flow) | RiftBroker (this design) |
|--------|---------------|--------------------------|
| Circuit type | GPC (generic, parameterized) | Custom circom (purpose-built) |
| Trust anchor | CCP EdDSA signature on PODs | SUI blockchain events |
| Data source | REST API → signed PODs | SUI RPC → on-chain events |
| On-chain verification | Solidity (Ethereum L2) | Move (SUI) |
| Coordinate format | 2-limb (high/low 63-bit) | Signed decimal strings |
| Distance computation | Off-chain (in POD generation) | In-circuit (ZK-proven) |

Our approach is complementary — we use the same game data but via a different (arguably more robust) trust path. CCP computes distance off-chain and signs it; we compute distance in-circuit and prove it. Our approach doesn't require trusting CCP for the distance calculation itself.

## What's Achievable Now vs Future

### ✅ Buildable Now
- **System presence proof:** JumpEvent proves scout was in system X at time T
- **Structure proximity proof:** Distance from scout's gate to any deployed assembly (SSU, gate, turret, network node) with exact per-object coordinates

### ❌ Future (requires CCP to emit additional events/data)
- **Player proximity proof:** Player ship positions are not on-chain. No event records "player X is at coordinates (x,y,z)." Players only leave on-chain traces when they interact with structures (jump through gates, use SSUs, etc.). If CCP ever emits player position events or PODs, this architecture supports them with minimal changes — the circuit just takes different coordinate inputs.
- **Resource proximity proof:** Resource locations (rifts, asteroid types) are game-server-side data, not published to the blockchain. If CCP exposes resource PODs or on-chain resource events in the future, the same ZK distance proof circuit handles them — only the data source changes.

## Open Questions

1. **Event pagination and data volume:** `suix_queryEvents` is paginated and rate-limited (100 req/30s). If a scout has hundreds of jumps, the UI needs a strategy for selecting the relevant JumpEvent. Options: show most recent jumps, filter by system, or let the scout paste a tx digest directly.

2. **Gate coordinate freshness:** LocationRevealedEvent has a block timestamp. Should the circuit enforce that the gate's coordinates haven't changed since the jump? Gates are stationary structures in EVE Frontier, so this is likely unnecessary. If CCP ever implements gate movement, this would need revisiting.

3. **Coordinate format precision:** On-chain coordinates like `"-21127680483892550000"` exceed JavaScript's `Number.MAX_SAFE_INTEGER`. Must use `BigInt` throughout the conversion pipeline. The `snarkjs` library handles BigInt inputs natively.

4. **Circuit artifact size:** The new circuit is estimated at ~1,450 constraints (actually smaller than current ~4,465). The `.zkey` file should be comparable or smaller. No browser download concerns.

## References

- EVE Frontier World Contracts: `https://github.com/evefrontier/world-contracts`
  - Gate + JumpEvent: `contracts/world/sources/assemblies/gate.move`
  - Location + LocationRevealedEvent: `contracts/world/sources/primitives/location.move`
- CCP ZK POC: `https://github.com/projectawakening/pod-flow`
- POD library: `@pcd/pod` (v0.5.1)
- SUI testnet RPC: `https://fullnode.testnet.sui.io:443`
- EVE Frontier docs: `https://docs.evefrontier.com`
- Scetrov community docs: `https://frontier.scetrov.live`
- World API auth research: `docs/research/worldapi_auth.md`
- EVE Frontier World API (legacy): `https://world-api-stillness.live.tech.evefrontier.com/docs/index.html`
- CCP POD signing key: `4MbZYmZ1n1+qGH8sQjHr4jAeT8rk6MHo5RU2OXQHGS4` (from `/config`)

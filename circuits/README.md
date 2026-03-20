# ZK Circuit Compilation

One-time offline workflow to compile Groth16 circuits and generate artifacts for TheRiftBroker.

## Circuits

| Circuit | Source | Constraints | Public Signals | Purpose |
|---------|--------|-------------|----------------|---------|
| `location-attestation` | CCP's [eve-frontier-proximity-zk-poc](https://github.com/evefrontier/eve-frontier-proximity-zk-poc) | ~4465 | 3 inputs + 1 output | Prove coordinate knowledge via Poseidon Merkle tree + timestamp freshness |
| `distance-attestation` | Custom (TheRiftBroker) | ~1200 | 2 inputs + 1 output | Prove Manhattan distance between two coordinate sets |
| `presence-attestation` | Custom (TheRiftBroker) | ~1063 | 3 inputs + 2 outputs | Unified presence + proximity: on-chain event binding + Manhattan distance + timestamp |

## Prerequisites

Set up a temporary working directory with the required tooling:

```powershell
mkdir zk-compile; cd zk-compile

# Install circom compiler (v2.2+)
# https://docs.circom.io/getting-started/installation/

# Install JS dependencies
npm install circomlib@^2.0.5 snarkjs@^0.7.5

# Download Powers of Tau (BN254, 2^13 = 8192 constraint capacity)
# DO NOT generate a custom ceremony — use this production-grade PSE ceremony.
Invoke-WebRequest -Uri "https://pse-trusted-setup-ppot.s3.eu-central-1.amazonaws.com/pot28_0080/ppot_0080_13.ptau" -OutFile ppot_0080_13.ptau
```

Use `npx snarkjs` if `snarkjs` isn't on PATH.

## Compilation Workflow

These steps apply to **any** circuit. Replace `<circuit-name>` with `location-attestation` or `distance-attestation`.

### Step 1: Compile circuit

```powershell
# Copy the .circom file into the working directory, then:
mkdir build -ErrorAction SilentlyContinue
circom <circuit-name>.circom --r1cs --wasm --sym -l node_modules -o build/
```

### Step 2: Trusted setup (Phase 2)

```powershell
npx snarkjs groth16 setup build/<circuit-name>.r1cs ppot_0080_13.ptau circuit_0000.zkey

# Generate random entropy
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 64
$rng.GetBytes($bytes)
$entropy = [Convert]::ToBase64String($bytes)

# Contribute entropy (generates circuit_final.zkey)
npx snarkjs zkey contribute circuit_0000.zkey circuit_final.zkey --name="riftbroker-<circuit-name>" -e="$entropy"

# Verify the setup
npx snarkjs zkey verify build/<circuit-name>.r1cs ppot_0080_13.ptau circuit_final.zkey
```

### Step 3: Export verification key

```powershell
npx snarkjs zkey export verificationkey circuit_final.zkey verification_key.json
```

### Step 4: Extract VKey bytes for the Move contract

Use the extraction script at `circuits/extract-vkey.cjs`:

```powershell
node circuits\extract-vkey.cjs verification_key.json
```

This outputs the Arkworks compressed VKey hex string. Copy the `x"..."` value into the contract's `init()` function in `contracts/sources/marketplace.move`.

**VKey byte layout:**
```
alpha_g1(32B) || beta_g2(64B) || gamma_g2(64B) || delta_g2(64B)
|| IC_len(8B little-endian u64) || IC[0..N](32B each)
```

IC array has `N+1` elements where `N` = number of public signals (inputs + outputs).

| Circuit | Public Signals | IC Points | VKey Size |
|---------|---------------|-----------|-----------|
| location-attestation | 4 | 5 | 392 bytes |
| distance-attestation | 3 | 4 | 360 bytes |
| presence-attestation | 5 | 6 | 424 bytes |

### Step 5: Copy browser artifacts

```powershell
# WASM (witness generator for browser proof generation)
Copy-Item -Force build\<circuit-name>_js\<circuit-name>.wasm frontend\public\zk\

# Proving key
Copy-Item -Force circuit_final.zkey frontend\public\zk\<circuit-name>_final.zkey
```

### Step 6: Deploy and update constants

1. Update VKey hex in `contracts/sources/marketplace.move` `init()`
2. Clear `contracts\Published.toml` if present (remove `[published.testnet]` block)
3. Deploy: `.sui-bin\sui.exe client publish contracts`
4. Record from deploy output:
   - Package ID
   - LocationVKey object ID (`rift_broker::marketplace::LocationVKey`)
   - DistanceVKey object ID (`rift_broker::marketplace::DistanceVKey`)
   - PresenceVKey object ID (`rift_broker::marketplace::PresenceVKey`)
   - UpgradeCap object ID
5. Update `frontend/src/lib/constants.ts`:
   - `PACKAGE_ID`
   - `LOCATION_VKEY_ID`
   - `DISTANCE_VKEY_ID`
   - `PRESENCE_VKEY_ID`

## Circuit-Specific Notes

### location-attestation

- Source: CCP's `eve-frontier-proximity-zk-poc` repo
- 3 public inputs: `merkleRoot`, `coordinatesHash`, `signatureAndKeyHash`
- 1 public output: `timestamp` (observation time exposed for on-chain staleness validation)
- Currently uses self-consistent dummy Merkle tree (Phase 1). Real POD integration planned when CCP exposes POD data.

### distance-attestation

- Custom circuit for TheRiftBroker
- 2 public inputs: `coordinatesHash1`, `coordinatesHash2`
- 1 public output: `distanceSquared` (Manhattan distance squared)
- Uses algebraic `AbsDiff` template (hint² == diff²) instead of `LessThan(64)` to handle negative EVE coordinates that become large BN254 field elements
- The `absDiffHints[3]` private inputs are computed off-chain by the witness generator and verified in-circuit via square equality + Num2Bits(64)

### presence-attestation

- Custom unified circuit for TheRiftBroker (Phase 5)
- 3 public inputs: `coordinatesHash`, `targetHash`, `locationHash`
- 2 public outputs: `distanceSquared` (Manhattan distance²), `timestamp` (JumpEvent block time)
- Combines location binding + distance computation + timestamp in a single proof
- Uses the same algebraic `AbsDiff` hint pattern as `distance-attestation` for signed EVE coordinates
- `locationHash` is a public input for audit purposes — CCP's on-chain `location_hash` uses a different Poseidon variant than circomlibjs, so the equality constraint was removed. The hash remains as an unconstrained public input for verifiers to inspect.
- Trust anchor: SUI blockchain events (JumpEvent + LocationRevealedEvent) instead of self-signed galaxy.json data

## extract-vkey.cjs

The VKey extraction script at `circuits/extract-vkey.cjs` converts snarkjs `verification_key.json` (affine coordinates as decimal strings) to Arkworks compressed byte format. It handles:

- G1 point compression (32 bytes LE + y-sign bit in MSB of last byte)
- G2 point compression (64 bytes: c0 LE || c1 LE + Fq2 y-sign bit)
- IC array length as 8-byte LE u64

Works for any BN254 Groth16 circuit regardless of public signal count.

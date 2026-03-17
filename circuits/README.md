# ZK Circuit Compilation

One-time offline workflow to compile the location attestation circuit and generate artifacts for TheRiftBroker.

## Source

Circuit from CCP's official ZK repo: `https://github.com/evefrontier/eve-frontier-proximity-zk-poc`

- Circuit: `src/on-chain/circuits/location-attestation/location-attestation.circom`
- Reference utility: `src/on-chain/ts/utils/formatProofForSui.ts`

Copy the `.circom` file (and any includes it references) into `circuits/location-attestation/`.

## Prerequisites

```bash
# 1. Install circom compiler (v2.1+)
# https://docs.circom.io/getting-started/installation/

# 2. Install JS tooling for witness generation and zkey setup
npm install circomlib@^2.0.5 poseidon-lite@^0.3.0 snarkjs@^0.7.5
```

## Compilation

```bash
cd circuits/location-attestation

# Compile circuit → R1CS + WASM witness generator
circom location-attestation.circom \
  --r1cs --wasm --sym \
  -l ../../node_modules \
  -o build/

# Download Powers of Tau (BN254, 2^13 = 8192 constraints — circuit has 4464 constraints)
# DO NOT generate a custom ceremony. Use this pre-computed production-grade one.
curl -O https://pse-trusted-setup-ppot.s3.eu-central-1.amazonaws.com/pot28_0080/ppot_0080_13.ptau

# Circuit-specific trusted setup (Phase 2)
snarkjs groth16 setup build/location-attestation.r1cs ppot_0080_13.ptau circuit_0000.zkey
snarkjs zkey contribute circuit_0000.zkey circuit_final.zkey --name="riftbroker" \
  -e="$(head -c 64 /dev/urandom | xxd -p)"

# Verify the setup
snarkjs zkey verify build/location-attestation.r1cs ppot_0080_13.ptau circuit_final.zkey

# Export verification key JSON (convert this to Arkworks bytes for the contract)
snarkjs zkey export verificationkey circuit_final.zkey verification_key.json
```

## Output Artifacts

| File | Destination | Purpose |
|------|-------------|---------|
| `build/location-attestation_js/location-attestation.wasm` | `frontend/public/zk/location-attestation.wasm` | Browser proof generation |
| `circuit_final.zkey` | `frontend/public/zk/location-attestation_final.zkey` | Browser proving key |
| `verification_key.json` | (kept local) | Source for on-chain VKey bytes |

## Extract VKey Bytes for Contract

The `verification_key.json` from snarkjs contains affine coordinates as decimal strings.
Convert to Arkworks compressed format (360 bytes for 3 public inputs):

```
alpha_g1(32B) || beta_g2(64B) || gamma_g2(64B) || delta_g2(64B)
|| IC_len(8B little-endian u64) || IC[0](32B) || IC[1](32B) || IC[2](32B) || IC[3](32B)
```

Use `frontend/src/lib/zk-proof.ts` conversion functions (`serializeG1Compressed`, `serializeG2Compressed`)
to build a `snarkjsVKeyToArkworks(vk)` utility, then encode as hex.

Update `contracts/sources/marketplace.move` `init()`:
```move
vkey_bytes: x"<360-byte hex>",
```

Update `frontend/src/lib/constants.ts` `LOCATION_VKEY_ID` after fresh deploy.

## Proof Generation Test

```bash
# Generate a test proof for known coordinates
node -e "
const snarkjs = require('snarkjs')
snarkjs.groth16.fullProve(
  { x: '1000000', y: '2000000', z: '3000000', salt: '12345' },
  'build/location-attestation_js/location-attestation.wasm',
  'circuit_final.zkey'
).then(({ proof, publicSignals }) => {
  console.log('proof:', JSON.stringify(proof, null, 2))
  console.log('signals:', publicSignals)
})
"
```

## VKey Format Notes

- Location circuit has **3 public inputs** (merkle_root, coordinates_hash, signature_and_key_hash)
- IC array has **4 elements** (IC[0] + one per public input)
- Total VKey: 32 + 64 + 64 + 64 + 8 + (4 × 32) = **360 bytes**
- SUI's groth16 supports max 8 public inputs — well within limit

// BN254 (alt_bn128) prime field modulus
export const BN254_FIELD_MODULUS = 21888242871839275222246405745257275088696311157297823662689037894645226208583n

// snarkjs proof output shape
interface SnarkjsProof {
  pi_a: [string, string, string]
  pi_b: [[string, string], [string, string], [string, string]]
  pi_c: [string, string, string]
}

// Circuit artifact URLs — snarkjs fastFile reads these directly via fetch
const CIRCUIT_WASM_URL = '/zk/location-attestation.wasm'
const CIRCUIT_ZKEY_URL = '/zk/location-attestation_final.zkey'

/**
 * Convert a decimal field element string to a 32-byte little-endian Uint8Array.
 * snarkjs outputs big-endian field elements as decimal strings; Arkworks expects LE.
 */
export function fieldToLE(decStr: string): Uint8Array {
  let val = BigInt(decStr)
  const out = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    out[i] = Number(val & 0xffn)
    val >>= 8n
  }
  return out
}

/**
 * A G1 y-coordinate is "positive" (canonical) if y <= (p - 1) / 2.
 * In Arkworks compressed G1, bit 7 of the most-significant byte (byte 31 in LE)
 * is set when the point is "negative" (i.e. y > half).
 */
export function yIsPositive(yDecStr: string): boolean {
  const y = BigInt(yDecStr)
  const half = (BN254_FIELD_MODULUS - 1n) / 2n
  return y <= half
}

/**
 * G2 y is an Fq2 element (c0, c1). Arkworks canonicity:
 * Compare c1 with its negation (p - c1). If c1 < (p - c1), positive.
 * If c1 > (p - c1), negative. If equal (c1 == 0), fall back to comparing c0.
 */
export function fq2YIsPositive(yC0DecStr: string, yC1DecStr: string): boolean {
  const c0 = BigInt(yC0DecStr)
  const c1 = BigInt(yC1DecStr)
  // Guard: (0,0) is the G2 point at infinity — not a valid y-coordinate in a real proof
  if (c0 === 0n && c1 === 0n) throw new Error('G2 point at infinity has no canonical sign')
  const negC1 = c1 === 0n ? 0n : BN254_FIELD_MODULUS - c1
  if (c1 < negC1) return true
  if (c1 > negC1) return false
  // c1 == 0 (c1 === negC1 only when c1 = 0 mod p): compare c0
  const negC0 = BN254_FIELD_MODULUS - c0
  return c0 <= negC0
}

/**
 * Serialize a G1 affine point to 32-byte Arkworks compressed format.
 * x is stored little-endian; if y is "negative", bit 7 of byte 31 is set.
 */
export function serializeG1Compressed(xDec: string, yDec: string): Uint8Array {
  const out = fieldToLE(xDec)
  // out is 32 bytes — index 31 is always within bounds
  if (!yIsPositive(yDec)) out[31] = (out[31] ?? 0) | 0x80
  return out
}

/**
 * Serialize a G2 affine point to 64-byte Arkworks compressed format.
 * snarkjs stores x as [c0, c1]; we write c0 LE (bytes 0–31) then c1 LE (bytes 32–63).
 * The sign flag goes into bit 7 of byte 63 (MSB of c1 in LE).
 */
export function serializeG2Compressed(
  xC0Dec: string,
  xC1Dec: string,
  yC0Dec: string,
  yC1Dec: string,
): Uint8Array {
  const c0Bytes = fieldToLE(xC0Dec)
  const c1Bytes = fieldToLE(xC1Dec)
  const out = new Uint8Array(64)
  out.set(c0Bytes, 0)
  out.set(c1Bytes, 32)
  // out is 64 bytes — index 63 is always within bounds
  if (!fq2YIsPositive(yC0Dec, yC1Dec)) out[63] = (out[63] ?? 0) | 0x80
  return out
}

/**
 * Convert a full snarkjs Groth16 proof to the 128-byte Arkworks compressed serialization
 * expected by sui::groth16::proof_points_from_bytes.
 *
 * Layout: G1(pi_a, 32 bytes) | G2(pi_b, 64 bytes) | G1(pi_c, 32 bytes)
 *
 * snarkjs pi_b[i] = [c0, c1] — do NOT reorder.
 */
export function snarkjsProofToArkworks(proof: SnarkjsProof): Uint8Array {
  const piA = proof.pi_a
  const piB = proof.pi_b
  const piC = proof.pi_c

  // piA[2], piC[2] are always '1' (affine Z=1). piB[2] is ['1','0']. Guard: fail loudly if not.
  if (piA[2] !== '1') throw new Error(`pi_a Z-coordinate must be '1', got '${piA[2]}'`)
  if (piC[2] !== '1') throw new Error(`pi_c Z-coordinate must be '1', got '${piC[2]}'`)

  const g1A = serializeG1Compressed(piA[0], piA[1])
  const g2B = serializeG2Compressed(piB[0][0], piB[0][1], piB[1][0], piB[1][1])
  const g1C = serializeG1Compressed(piC[0], piC[1])

  const out = new Uint8Array(128)
  out.set(g1A, 0)
  out.set(g2B, 32)
  out.set(g1C, 96)
  return out
}

/**
 * Serialize public signals to bytes: each signal as 32-byte little-endian, concatenated.
 * SUI's groth16 module parses public inputs in little-endian order.
 */
export function publicSignalsToBytes(signals: string[]): Uint8Array {
  const out = new Uint8Array(signals.length * 32)
  for (let i = 0; i < signals.length; i++) {
    const sig = signals[i]
    if (sig !== undefined) out.set(fieldToLE(sig), i * 32)
  }
  return out
}

/**
 * Generate a cryptographically random salt in [1, BN254_FIELD_MODULUS - 1].
 * Uses crypto.getRandomValues for browser and Node environments.
 */
export function generateSalt(): bigint {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  // Interpret bytes[31] as most-significant → big-endian bigint, then reduce mod p.
  // Endianness only affects naming; any order produces a uniformly random value.
  let val = 0n
  for (let i = 31; i >= 0; i--) {
    const b = bytes[i] ?? 0
    val = (val << 8n) | BigInt(b)
  }
  // Reduce to [0, p) then ensure non-zero
  val = val % BN254_FIELD_MODULUS
  if (val === 0n) val = 1n
  return val
}

/**
 * Build the full circuit witness for the location attestation circuit.
 *
 * The circuit verifies coordinates against a Poseidon Merkle tree. For Phase 1
 * (coordinate knowledge proof), we build a self-consistent tree from the coordinates
 * + a dummy timestamp and sibling. This proves "I know these coordinates" — full
 * game attestation (signed server data) comes in later phases.
 *
 * Tree structure (depth 3, 8 leaves, our data at indices 4-7):
 *   leaf4 = Poseidon(timestamp), leaf5 = Poseidon(x), leaf6 = Poseidon(y), leaf7 = Poseidon(z)
 *   parent45 = Poseidon(leaf4, leaf5), parent67 = Poseidon(leaf6, leaf7)
 *   parent4567 = Poseidon(parent45, parent67)
 *   merkleRoot = Poseidon(siblingLevel1, parent4567)
 */
async function buildCircuitInput(
  coords: { x: number; y: number; z: number },
  salt: bigint,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  poseidon: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  F: any,
) {
  const x = BigInt(Math.round(coords.x))
  const y = BigInt(Math.round(coords.y))
  const z = BigInt(Math.round(coords.z))
  const timestamp = BigInt(Date.now())
  const siblingLevel1 = 1n // dummy — Phase 1 doesn't verify against game data

  // Compute leaf hashes (Poseidon with arity 1)
  const leafTimestamp = F.toObject(poseidon([timestamp]))
  const leafX = F.toObject(poseidon([x]))
  const leafY = F.toObject(poseidon([y]))
  const leafZ = F.toObject(poseidon([z]))

  // Build Merkle tree bottom-up
  const parent45 = F.toObject(poseidon([leafTimestamp, leafX]))
  const parent67 = F.toObject(poseidon([leafY, leafZ]))
  const parent4567 = F.toObject(poseidon([parent45, parent67]))
  const merkleRoot = F.toObject(poseidon([siblingLevel1, parent4567]))

  // Coordinate hash (Poseidon arity 4)
  const coordinatesHash = F.toObject(poseidon([x, y, z, salt]))

  // signatureAndKeyHash is unconstrained in the circuit — use a dummy value
  const signatureAndKeyHash = F.toObject(poseidon([1n]))

  return {
    // Public inputs
    merkleRoot: merkleRoot.toString(),
    coordinatesHash: coordinatesHash.toString(),
    signatureAndKeyHash: signatureAndKeyHash.toString(),
    // Private witness
    coordinates: [x.toString(), y.toString(), z.toString()],
    salt: salt.toString(),
    timestampWitness: timestamp.toString(),
    siblingLevel1: siblingLevel1.toString(),
  }
}

/**
 * Generate a Groth16 location proof for the given coordinates.
 * Lazily imports snarkjs + circomlibjs and fetches circuit artifacts.
 *
 * Not tested directly in unit tests (artifact fetch fails in test env).
 * Test conversion utilities independently via their exports.
 */
export async function generateLocationProof(
  coords: { x: number; y: number; z: number },
): Promise<{ proofBytes: Uint8Array; publicInputsBytes: Uint8Array }> {
  const salt = generateSalt()

  // Lazy-load snarkjs and circomlibjs Poseidon
  // @ts-expect-error snarkjs has no bundled types and is a runtime-only dep
  const snarkjs = await import('snarkjs')
  // @ts-expect-error circomlibjs has no bundled types
  const { buildPoseidon } = await import('circomlibjs')
  const poseidon = await buildPoseidon()
  const F = poseidon.F

  const circuitInput = await buildCircuitInput(coords, salt, poseidon, F)

  // Pass URL strings directly — snarkjs's fastFile fetches them in the browser
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    CIRCUIT_WASM_URL,
    CIRCUIT_ZKEY_URL,
  )

  return {
    proofBytes: snarkjsProofToArkworks(proof as SnarkjsProof),
    publicInputsBytes: publicSignalsToBytes(publicSignals as string[]),
  }
}

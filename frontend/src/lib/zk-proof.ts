// BN254 (alt_bn128) prime field modulus
export const BN254_FIELD_MODULUS = 21888242871839275222246405745257275088696311157297823662689037894645226208583n

// snarkjs proof output shape
interface SnarkjsProof {
  pi_a: [string, string, string]
  pi_b: [[string, string], [string, string], [string, string]]
  pi_c: [string, string, string]
}

// Lazy-loaded artifact cache
let cachedWasm: ArrayBuffer | null = null
let cachedZkey: ArrayBuffer | null = null

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
 * Generate a Groth16 location proof for the given coordinates.
 * Lazily imports snarkjs and caches WASM + zkey artifacts after first load.
 *
 * Not tested directly in unit tests (artifact fetch fails in test env).
 * Test conversion utilities independently via their exports.
 */
export async function generateLocationProof(
  coords: { x: number; y: number; z: number },
): Promise<{ proofBytes: Uint8Array; publicInputsBytes: Uint8Array }> {
  const salt = generateSalt()

  // Lazy-load snarkjs (large dependency) — not installed as a typed dep; cast at call site
  // @ts-expect-error snarkjs has no bundled types and is a runtime-only dep
  const snarkjs = await import('snarkjs')

  // Fetch and cache circuit artifacts
  if (cachedWasm === null) {
    const res = await fetch('/zk/location-attestation.wasm')
    if (!res.ok) throw new Error(`Failed to fetch WASM: ${res.status}`)
    cachedWasm = await res.arrayBuffer()
  }
  if (cachedZkey === null) {
    const res = await fetch('/zk/location-attestation_final.zkey')
    if (!res.ok) throw new Error(`Failed to fetch zkey: ${res.status}`)
    cachedZkey = await res.arrayBuffer()
  }

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    {
      x: coords.x.toString(),
      y: coords.y.toString(),
      z: coords.z.toString(),
      salt: salt.toString(),
    },
    cachedWasm,
    cachedZkey,
  )

  return {
    proofBytes: snarkjsProofToArkworks(proof as SnarkjsProof),
    publicInputsBytes: publicSignalsToBytes(publicSignals as string[]),
  }
}

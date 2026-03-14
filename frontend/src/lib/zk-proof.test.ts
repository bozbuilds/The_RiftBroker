import { describe, expect, test } from 'vitest'

import {
  fieldToLE,
  fq2YIsPositive,
  generateSalt,
  publicSignalsToBytes,
  serializeG1Compressed,
  serializeG2Compressed,
  snarkjsProofToArkworks,
  yIsPositive,
} from './zk-proof'

const BN254_FIELD_MODULUS = 21888242871839275222246405745257275088696311157297823662689037894645226208583n

/** Read a byte from a Uint8Array — asserts defined since bounds are test-controlled */
function byte(arr: Uint8Array, i: number): number {
  const v = arr[i]
  if (v === undefined) throw new Error(`byte[${i}] out of bounds (length ${arr.length})`)
  return v
}

// ---------------------------------------------------------------------------
// fieldToLE
// ---------------------------------------------------------------------------
describe('fieldToLE', () => {
  test('fieldToLE("1") produces 32 bytes with byte[0] === 1 and rest zero', () => {
    const bytes = fieldToLE('1')
    expect(bytes).toHaveLength(32)
    expect(byte(bytes, 0)).toBe(1)
    for (let i = 1; i < 32; i++) expect(byte(bytes, i)).toBe(0)
  })

  test('fieldToLE("0") produces 32 zero bytes', () => {
    const bytes = fieldToLE('0')
    expect(bytes).toHaveLength(32)
    for (let i = 0; i < 32; i++) expect(byte(bytes, i)).toBe(0)
  })

  test('fieldToLE of BN254 modulus — length 32, last byte non-zero, round-trips', () => {
    const bytes = fieldToLE(BN254_FIELD_MODULUS.toString())
    expect(bytes).toHaveLength(32)
    // Reconstruct bigint from LE bytes and confirm it matches
    let recovered = 0n
    for (let i = 31; i >= 0; i--) recovered = (recovered << 8n) | BigInt(byte(bytes, i))
    expect(recovered).toBe(BN254_FIELD_MODULUS)
    // The high byte (byte 31) should be non-zero (modulus doesn't fit in 31 bytes)
    expect(byte(bytes, 31)).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// yIsPositive
// ---------------------------------------------------------------------------
describe('yIsPositive', () => {
  test('returns true for small y = 1', () => {
    expect(yIsPositive('1')).toBe(true)
  })

  test('returns true for small y = 2', () => {
    expect(yIsPositive('2')).toBe(true)
  })

  test('returns false for y = p - 1 (large, clearly > half)', () => {
    const large = (BN254_FIELD_MODULUS - 1n).toString()
    expect(yIsPositive(large)).toBe(false)
  })

  test('boundary: y = (p - 1) / 2 is positive (equal to half → positive)', () => {
    const half = ((BN254_FIELD_MODULUS - 1n) / 2n).toString()
    // half <= half is true, so should be positive
    expect(yIsPositive(half)).toBe(true)
  })

  test('boundary: y = (p - 1) / 2 + 1 is negative (just over half)', () => {
    const justOver = ((BN254_FIELD_MODULUS - 1n) / 2n + 1n).toString()
    expect(yIsPositive(justOver)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// serializeG1Compressed
// ---------------------------------------------------------------------------
describe('serializeG1Compressed', () => {
  test('returns Uint8Array of length 32', () => {
    const bytes = serializeG1Compressed('1', '2')
    expect(bytes).toHaveLength(32)
    expect(bytes).toBeInstanceOf(Uint8Array)
  })

  test('MSB (byte 31) has bit 7 clear when y is positive (y = 1)', () => {
    const bytes = serializeG1Compressed('1', '1')
    expect(byte(bytes, 31) & 0x80).toBe(0)
  })

  test('MSB (byte 31) has bit 7 set when y is negative (y = p - 1)', () => {
    const bigY = (BN254_FIELD_MODULUS - 1n).toString()
    const bytes = serializeG1Compressed('1', bigY)
    expect(byte(bytes, 31) & 0x80).toBe(0x80)
  })

  test('x bytes are correctly encoded in LE (x = 1 → byte[0] = 1)', () => {
    const bytes = serializeG1Compressed('1', '1')
    expect(byte(bytes, 0)).toBe(1)
    for (let i = 1; i < 31; i++) expect(byte(bytes, i)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// serializeG2Compressed
// ---------------------------------------------------------------------------
describe('serializeG2Compressed', () => {
  test('returns Uint8Array of length 64', () => {
    const bytes = serializeG2Compressed('1', '2', '3', '4')
    expect(bytes).toHaveLength(64)
    expect(bytes).toBeInstanceOf(Uint8Array)
  })

  test('bytes 0–31 encode xC0 and bytes 32–63 encode xC1', () => {
    const bytes = serializeG2Compressed('1', '2', '1', '1')
    // x.c0 = 1 → bytes[0] = 1, bytes[1..31] = 0
    expect(byte(bytes, 0)).toBe(1)
    for (let i = 1; i < 32; i++) expect(byte(bytes, i)).toBe(0)
    // x.c1 = 2 → bytes[32] = 2
    expect(byte(bytes, 32)).toBe(2)
  })

  test('sign bit in byte 63 is clear when y is positive', () => {
    // y.c0 = 1, y.c1 = 1 → c1 < negC1 (1 < p-1) → positive
    const bytes = serializeG2Compressed('1', '2', '1', '1')
    expect(byte(bytes, 63) & 0x80).toBe(0)
  })

  test('sign bit in byte 63 is set when y is negative', () => {
    // y.c1 = p - 1 → c1 > negC1 (p-1 > 1) → negative
    const bigC1 = (BN254_FIELD_MODULUS - 1n).toString()
    const bytes = serializeG2Compressed('1', '2', '1', bigC1)
    expect(byte(bytes, 63) & 0x80).toBe(0x80)
  })
})

// ---------------------------------------------------------------------------
// snarkjsProofToArkworks
// ---------------------------------------------------------------------------
describe('snarkjsProofToArkworks', () => {
  const mockProof = {
    pi_a: ['1', '2', '1'] as [string, string, string],
    pi_b: [
      ['3', '4'],
      ['5', '6'],
      ['1', '0'],
    ] as [[string, string], [string, string], [string, string]],
    pi_c: ['7', '8', '1'] as [string, string, string],
  }

  test('output is exactly 128 bytes', () => {
    const bytes = snarkjsProofToArkworks(mockProof)
    expect(bytes).toHaveLength(128)
    expect(bytes).toBeInstanceOf(Uint8Array)
  })

  test('bytes 0–31 are G1(pi_a), 32–95 are G2(pi_b), 96–127 are G1(pi_c)', () => {
    const bytes = snarkjsProofToArkworks(mockProof)
    // G1(pi_a): x = 1 → byte[0] = 1
    expect(byte(bytes, 0)).toBe(1)
    // G2(pi_b): xC0 = 3 → bytes[32] = 3
    expect(byte(bytes, 32)).toBe(3)
    // G1(pi_c): x = 7 → bytes[96] = 7
    expect(byte(bytes, 96)).toBe(7)
  })

  test('proof with all-one small coordinates produces deterministic output', () => {
    const smallProof = {
      pi_a: ['1', '1', '1'] as [string, string, string],
      pi_b: [
        ['1', '1'],
        ['1', '1'],
        ['1', '0'],
      ] as [[string, string], [string, string], [string, string]],
      pi_c: ['1', '1', '1'] as [string, string, string],
    }
    const a = snarkjsProofToArkworks(smallProof)
    const b = snarkjsProofToArkworks(smallProof)
    expect(a).toEqual(b)
  })
})

// ---------------------------------------------------------------------------
// publicSignalsToBytes
// ---------------------------------------------------------------------------
describe('publicSignalsToBytes', () => {
  test('three signals → 96 bytes', () => {
    const bytes = publicSignalsToBytes(['1', '2', '3'])
    expect(bytes).toHaveLength(96)
    expect(bytes).toBeInstanceOf(Uint8Array)
  })

  test('single signal "1" → first byte is 1, rest are 0', () => {
    const bytes = publicSignalsToBytes(['1'])
    expect(bytes).toHaveLength(32)
    expect(byte(bytes, 0)).toBe(1)
    for (let i = 1; i < 32; i++) expect(byte(bytes, i)).toBe(0)
  })

  test('empty signals → 0 bytes', () => {
    expect(publicSignalsToBytes([])).toHaveLength(0)
  })

  test('each signal occupies exactly 32 bytes in LE', () => {
    const bytes = publicSignalsToBytes(['1', '2'])
    expect(bytes).toHaveLength(64)
    // signal[0] = 1 → bytes[0] = 1
    expect(byte(bytes, 0)).toBe(1)
    // signal[1] = 2 → bytes[32] = 2
    expect(byte(bytes, 32)).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// fq2YIsPositive
// ---------------------------------------------------------------------------
describe('fq2YIsPositive', () => {
  test('c1 = 1 is positive (1 < p - 1)', () => {
    expect(fq2YIsPositive('0', '1')).toBe(true)
  })

  test('c1 = p - 1 is negative (p-1 > 1)', () => {
    const big = (BN254_FIELD_MODULUS - 1n).toString()
    expect(fq2YIsPositive('0', big)).toBe(false)
  })

  test('c1 = 0 falls back to c0 comparison: c0 = 1 is positive', () => {
    expect(fq2YIsPositive('1', '0')).toBe(true)
  })

  test('c1 = 0 falls back to c0 comparison: c0 = p - 1 is negative', () => {
    const big = (BN254_FIELD_MODULUS - 1n).toString()
    expect(fq2YIsPositive(big, '0')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// generateSalt
// ---------------------------------------------------------------------------
describe('generateSalt', () => {
  test('returns a bigint', () => {
    const salt = generateSalt()
    expect(typeof salt).toBe('bigint')
  })

  test('salt is > 0', () => {
    expect(generateSalt()).toBeGreaterThan(0n)
  })

  test('salt is < BN254_FIELD_MODULUS', () => {
    expect(generateSalt()).toBeLessThan(BN254_FIELD_MODULUS)
  })

  test('two calls produce different values (probabilistic)', () => {
    const a = generateSalt()
    const b = generateSalt()
    // Collision probability is ~1/2^254 — effectively impossible
    expect(a).not.toBe(b)
  })
})

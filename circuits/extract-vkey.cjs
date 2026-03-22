// Extract Arkworks-format VKey bytes from snarkjs verification_key.json
// Usage: node extract-vkey.cjs verification_key.json

const fs = require('fs')
const path = require('path')

const BN254_FIELD_MODULUS = 21888242871839275222246405745257275088696311157297823662689037894645226208583n

function fieldToLE(decStr) {
  let val = BigInt(decStr)
  const out = Buffer.alloc(32)
  for (let i = 0; i < 32; i++) {
    out[i] = Number(val & 0xffn)
    val >>= 8n
  }
  return out
}

function yIsPositive(yDecStr) {
  const y = BigInt(yDecStr)
  const half = (BN254_FIELD_MODULUS - 1n) / 2n
  return y <= half
}

function fq2YIsPositive(yC0DecStr, yC1DecStr) {
  const c0 = BigInt(yC0DecStr)
  const c1 = BigInt(yC1DecStr)
  if (c0 === 0n && c1 === 0n) throw new Error('G2 point at infinity')
  const negC1 = c1 === 0n ? 0n : BN254_FIELD_MODULUS - c1
  if (c1 < negC1) return true
  if (c1 > negC1) return false
  const negC0 = BN254_FIELD_MODULUS - c0
  return c0 <= negC0
}

function serializeG1(point) {
  const out = fieldToLE(point[0])
  if (!yIsPositive(point[1])) out[31] |= 0x80
  return out
}

function serializeG2(point) {
  const c0 = fieldToLE(point[0][0])
  const c1 = fieldToLE(point[0][1])
  const out = Buffer.alloc(64)
  c0.copy(out, 0)
  c1.copy(out, 32)
  if (!fq2YIsPositive(point[1][0], point[1][1])) out[63] |= 0x80
  return out
}

const vkFile = process.argv[2]
if (!vkFile) {
  console.error('Usage: node extract-vkey.cjs <verification_key.json>')
  process.exit(1)
}

const vk = JSON.parse(fs.readFileSync(path.resolve(vkFile), 'utf8'))

const alpha = serializeG1(vk.vk_alpha_1)
const beta = serializeG2(vk.vk_beta_2)
const gamma = serializeG2(vk.vk_gamma_2)
const delta = serializeG2(vk.vk_delta_2)

const icLen = Buffer.alloc(8)
icLen.writeUInt32LE(vk.IC.length, 0)

const icPoints = vk.IC.map(p => serializeG1(p))

const all = Buffer.concat([alpha, beta, gamma, delta, icLen, ...icPoints])

console.log('\nVKey bytes (' + all.length + ' bytes):')
console.log(all.toString('hex'))
console.log('\nFor Move contract:')
console.log('x"' + all.toString('hex') + '"')

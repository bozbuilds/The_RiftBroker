/**
 * 2D Perlin noise function.
 * Returns values in [-1, 1]. Deterministic for same inputs.
 * Used for region cloud texture distortion.
 */

// Permutation table (deterministic pseudo-random)
const perm = new Uint8Array(512)
for (let i = 0; i < 256; i++) perm[i] = i
// Fisher-Yates shuffle with fixed seed
let seed = 42
for (let i = 255; i > 0; i--) {
  seed = (seed * 16807 + 0) % 2147483647
  const j = seed % (i + 1)
  const tmp = perm[i]!
  perm[i] = perm[j]!
  perm[j] = tmp!
}
// Double the table to avoid bounds checks when xi+1 = 256
for (let i = 0; i < 256; i++) perm[256 + i] = perm[i]!

function fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10) }
function lerp(a: number, b: number, t: number) { return a + t * (b - a) }

function grad(hash: number, x: number, y: number): number {
  const h = hash & 3
  const u = h < 2 ? x : y
  const v = h < 2 ? y : x
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
}

export function noise2D(x: number, y: number): number {
  const xi = Math.floor(x) & 255
  const yi = Math.floor(y) & 255
  const xf = x - Math.floor(x)
  const yf = y - Math.floor(y)
  const u = fade(xf)
  const v = fade(yf)

  const yi1 = (yi + 1) & 255
  const aa = perm[perm[xi]! + yi]!
  const ab = perm[perm[xi]! + yi1]!
  const ba = perm[perm[xi + 1]! + yi]!
  const bb = perm[perm[xi + 1]! + yi1]!

  return lerp(
    lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
    lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
    v,
  )
}

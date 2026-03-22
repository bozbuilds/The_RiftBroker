import { describe, expect, it } from 'vitest'

import { noise2D } from './noise'

describe('noise2D', () => {
  it('returns a value between -1 and 1', () => {
    for (let i = 0; i < 100; i++) {
      const val = noise2D(i * 0.1, i * 0.3)
      expect(val).toBeGreaterThanOrEqual(-1)
      expect(val).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic — same input gives same output', () => {
    const a = noise2D(1.5, 2.7)
    const b = noise2D(1.5, 2.7)
    expect(a).toBe(b)
  })

  it('varies across space — adjacent samples differ', () => {
    const a = noise2D(0.3, 0.7)
    const b = noise2D(10.3, 0.7)
    expect(a).not.toBe(b)
  })
})

import { describe, expect, it } from 'vitest'
import { INTEL_TYPE_COLORS, INTEL_TYPE_COLORS_NEON } from './constants'

describe('INTEL_TYPE_COLORS', () => {
  it('has entries for all four intel types', () => {
    for (const key of [0, 1, 2, 3])
      expect(INTEL_TYPE_COLORS[key]).toBeDefined()
  })
  it('values are valid hex color strings', () => {
    for (const color of Object.values(INTEL_TYPE_COLORS))
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('INTEL_TYPE_COLORS_NEON', () => {
  it('has entries for all four intel types', () => {
    for (const key of [0, 1, 2, 3])
      expect(INTEL_TYPE_COLORS_NEON[key]).toBeDefined()
  })
  it('values are valid hex color strings', () => {
    for (const color of Object.values(INTEL_TYPE_COLORS_NEON))
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

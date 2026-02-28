import { describe, expect, it } from 'vitest'

import { mistToSui } from './format'

describe('mistToSui', () => {
  it('converts 1 SUI worth of MIST', () => {
    expect(mistToSui('1000000000')).toBe('1')
  })

  it('converts fractional SUI', () => {
    expect(mistToSui('500000000')).toBe('0.5')
  })

  it('converts small amounts', () => {
    expect(mistToSui('1000000')).toBe('0.001')
  })

  it('strips trailing zeros', () => {
    expect(mistToSui('100000000')).toBe('0.1')
  })

  it('returns null for empty string', () => {
    expect(mistToSui('')).toBeNull()
  })

  it('returns null for non-numeric input', () => {
    expect(mistToSui('abc')).toBeNull()
  })

  it('handles zero', () => {
    expect(mistToSui('0')).toBe('0')
  })
})

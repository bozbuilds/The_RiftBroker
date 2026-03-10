import { describe, expect, it } from 'vitest'

import { filterSystems, highlightMatch } from './SystemPicker'
import type { GalaxySystem } from '../lib/galaxy-data'

function makeSystem(id: number, name: string, region: string): GalaxySystem {
  return { id: BigInt(id), name, x: 0, y: 0, z: 0, region, regionId: null }
}

const SYSTEMS: GalaxySystem[] = [
  makeSystem(1, 'G-M4GK', 'Delve'),
  makeSystem(2, 'E-VKJV', 'Catch'),
  makeSystem(3, 'YHN-3K', 'Delve'),
  makeSystem(4, 'KBP7-G', 'Period Basis'),
  makeSystem(5, 'G-AENA', 'Querious'),
  makeSystem(6, 'VNX-P0', 'Fountain'),
]

// --- filterSystems ---

describe('filterSystems', () => {
  it('returns empty array for empty query', () => {
    expect(filterSystems(SYSTEMS, '', 20)).toEqual([])
  })

  it('returns empty array for whitespace-only query', () => {
    expect(filterSystems(SYSTEMS, '   ', 20)).toEqual([])
  })

  it('matches case-insensitively', () => {
    const result = filterSystems(SYSTEMS, 'g-m4', 20)
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('G-M4GK')
  })

  it('uppercase query matches lowercase system names', () => {
    const result = filterSystems(SYSTEMS, 'VNX', 20)
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('VNX-P0')
  })

  it('substring match — not just prefix', () => {
    // "M4" appears in the middle of "G-M4GK"
    const result = filterSystems(SYSTEMS, 'M4', 20)
    expect(result.some((s) => s.name === 'G-M4GK')).toBe(true)
  })

  it('returns multiple matches', () => {
    // 'G-' appears in G-M4GK and G-AENA
    const result = filterSystems(SYSTEMS, 'G-', 20)
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('respects max cap', () => {
    // Query "G" matches G-M4GK, G-AENA, KBP7-G at minimum
    const result = filterSystems(SYSTEMS, 'G', 2)
    expect(result.length).toBeLessThanOrEqual(2)
  })

  it('returns empty array when no systems match', () => {
    const result = filterSystems(SYSTEMS, 'ZZZZZ', 20)
    expect(result).toEqual([])
  })

  it('returns empty array when systems list is empty', () => {
    expect(filterSystems([], 'test', 20)).toEqual([])
  })

  it('trims leading and trailing whitespace from query', () => {
    const trimmed = filterSystems(SYSTEMS, '  G-M4  ', 20)
    expect(trimmed).toHaveLength(1)
    expect(trimmed[0]!.name).toBe('G-M4GK')
  })
})

// --- highlightMatch ---

describe('highlightMatch', () => {
  it('returns the full string as "before" when no match', () => {
    const result = highlightMatch('G-M4GK', 'ZZZZZ')
    expect(result).toEqual({ before: 'G-M4GK', match: '', after: '' })
  })

  it('matches at the start', () => {
    const result = highlightMatch('G-M4GK', 'G-M4')
    expect(result).toEqual({ before: '', match: 'G-M4', after: 'GK' })
  })

  it('matches in the middle', () => {
    const result = highlightMatch('G-M4GK', 'M4')
    expect(result).toEqual({ before: 'G-', match: 'M4', after: 'GK' })
  })

  it('matches at the end', () => {
    const result = highlightMatch('G-M4GK', 'GK')
    expect(result).toEqual({ before: 'G-M4', match: 'GK', after: '' })
  })

  it('is case-insensitive in matching but preserves original case in output', () => {
    const result = highlightMatch('G-M4GK', 'g-m4')
    expect(result.before).toBe('')
    expect(result.match).toBe('G-M4')  // original case preserved
    expect(result.after).toBe('GK')
  })

  it('matches only the first occurrence', () => {
    // "AA" appears twice in "AABAA"
    const result = highlightMatch('AABAA', 'AA')
    expect(result).toEqual({ before: '', match: 'AA', after: 'BAA' })
  })

  it('empty query returns no match', () => {
    const result = highlightMatch('G-M4GK', '')
    expect(result).toEqual({ before: 'G-M4GK', match: '', after: '' })
  })
})

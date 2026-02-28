import { describe, it, expect } from 'vitest'
import { intelPayloadSchema } from './intel-schemas'

describe('intelPayloadSchema', () => {
  it('parses valid resource intel', () => {
    const result = intelPayloadSchema.safeParse({
      type: 0,
      systemId: '30004759',
      nearbyBody: 'P1-M2',
      resourceType: 'Feldspar Crystals',
      yieldTier: 'low',
    })
    expect(result.success).toBe(true)
  })

  it('rejects resource with invalid yieldTier', () => {
    const result = intelPayloadSchema.safeParse({
      type: 0,
      systemId: '30004759',
      nearbyBody: 'P1-M2',
      resourceType: 'Feldspar Crystals',
      yieldTier: 'mega',
    })
    expect(result.success).toBe(false)
  })

  it('parses valid fleet intel', () => {
    const result = intelPayloadSchema.safeParse({
      type: 1,
      systemId: '30004759',
      fleetSize: 12,
      shipTypes: ['Frigate', 'Destroyer'],
      observedAt: '2026-02-16T12:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  it('parses valid base intel', () => {
    const result = intelPayloadSchema.safeParse({
      type: 2,
      systemId: '30004759',
      structureType: 'SSU',
      defenseLevel: 7,
    })
    expect(result.success).toBe(true)
  })

  it('parses valid route intel', () => {
    const result = intelPayloadSchema.safeParse({
      type: 3,
      originSystemId: '30004759',
      destSystemId: '30004760',
      threatLevel: 5,
      gateCamps: [
        { systemId: '30004761', description: 'Smart gate with turrets' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects unknown intel type', () => {
    const result = intelPayloadSchema.safeParse({
      type: 99,
      systemId: '30004759',
    })
    expect(result.success).toBe(false)
  })

  it('rejects resource with missing nearbyBody', () => {
    const result = intelPayloadSchema.safeParse({
      type: 0,
      systemId: '30004759',
      resourceType: 'Feldspar Crystals',
      yieldTier: 'low',
    })
    expect(result.success).toBe(false)
  })

  it('rejects base with defenseLevel out of range', () => {
    const result = intelPayloadSchema.safeParse({
      type: 2,
      systemId: '30004759',
      structureType: 'SSU',
      defenseLevel: 11,
    })
    expect(result.success).toBe(false)
  })

  it('accepts optional notes on any intel type', () => {
    const resource = intelPayloadSchema.safeParse({
      type: 0,
      systemId: '30004759',
      nearbyBody: 'Planet 1 Moon 1',
      resourceType: 'Ice Shards',
      yieldTier: 'high',
      notes: 'Contested area, bring escort',
    })
    expect(resource.success).toBe(true)

    const fleet = intelPayloadSchema.safeParse({
      type: 1,
      systemId: '30004759',
      fleetSize: 5,
      shipTypes: ['Frigate'],
      observedAt: '2026-02-27T10:00:00Z',
      notes: 'Appeared to be AFK',
    })
    expect(fleet.success).toBe(true)
  })

  it('rejects fleet with negative fleetSize', () => {
    const result = intelPayloadSchema.safeParse({
      type: 1,
      systemId: '30004759',
      fleetSize: -1,
      shipTypes: [],
      observedAt: '2026-02-16T12:00:00Z',
    })
    expect(result.success).toBe(false)
  })
})

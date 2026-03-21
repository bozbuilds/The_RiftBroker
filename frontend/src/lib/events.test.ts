import { describe, expect, it } from 'vitest'

import { extractCharacterId, parseInventoryEvent, parseJumpEvent, parseKillmailEvent, parseLocationEvent } from './events'

describe('parseJumpEvent', () => {
  const rawEvent = {
    parsedJson: {
      character_id: '0xef0945b',
      source_gate_id: '0xc0e53f',
      destination_gate_id: '0x2840c4',
      character_key: { item_id: '2112000078', tenant: 'utopia' },
      source_gate_key: { item_id: '1000000014451', tenant: 'utopia' },
      destination_gate_key: { item_id: '1000000014502', tenant: 'utopia' },
    },
    timestampMs: '1773701456372',
    txDigest: 'ABC123',
  }

  it('parses character_id', () => {
    expect(parseJumpEvent(rawEvent).characterId).toBe('0xef0945b')
  })

  it('parses destination_gate_id', () => {
    expect(parseJumpEvent(rawEvent).destinationGateId).toBe('0x2840c4')
  })

  it('parses timestamp as bigint', () => {
    expect(parseJumpEvent(rawEvent).timestamp).toBe(1773701456372n)
  })

  it('parses txDigest', () => {
    expect(parseJumpEvent(rawEvent).txDigest).toBe('ABC123')
  })
})

describe('parseLocationEvent', () => {
  const rawEvent = {
    parsedJson: {
      assembly_id: '0x970ed2',
      solarsystem: '30013468',
      x: '-21127680483892550000',
      y: '-63992514302670300',
      z: '-10527202688414894000',
      location_hash: [34, 195, 61, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      type_id: '88092',
    },
    timestampMs: '1773973111797',
  }

  it('parses coordinates as BigInt', () => {
    const loc = parseLocationEvent(rawEvent)
    expect(loc.x).toBe(-21127680483892550000n)
    expect(loc.y).toBe(-63992514302670300n)
    expect(loc.z).toBe(-10527202688414894000n)
  })

  it('parses solarSystem as number', () => {
    expect(parseLocationEvent(rawEvent).solarSystem).toBe(30013468)
  })

  it('parses locationHash as Uint8Array', () => {
    const loc = parseLocationEvent(rawEvent)
    expect(loc.locationHash).toBeInstanceOf(Uint8Array)
    expect(loc.locationHash.length).toBe(32)
    expect(loc.locationHash[0]).toBe(34)
  })

  it('parses assemblyId', () => {
    expect(parseLocationEvent(rawEvent).assemblyId).toBe('0x970ed2')
  })
})

describe('parseKillmailEvent', () => {
  const rawEvent = {
    parsedJson: {
      key: { item_id: '3100', tenant: 'stillness' },
      killer_id: { item_id: '2112081012', tenant: 'stillness' },
      victim_id: { item_id: '2112081029', tenant: 'stillness' },
      reported_by_character_id: { item_id: '2112081012', tenant: 'stillness' },
      loss_type: { '@variant': 'SHIP' },
      kill_timestamp: '1774039974',
      solar_system_id: { item_id: '30016335', tenant: 'stillness' },
    },
    txDigest: 'KM_TX_ABC',
  }

  it('parses killer_id from nested TenantItemId', () => {
    expect(parseKillmailEvent(rawEvent).killerId).toBe('2112081012')
  })

  it('parses victim_id from nested TenantItemId', () => {
    expect(parseKillmailEvent(rawEvent).victimId).toBe('2112081029')
  })

  it('parses solar_system_id from nested TenantItemId', () => {
    expect(parseKillmailEvent(rawEvent).solarSystemId).toBe('30016335')
  })

  it('parses loss_type variant', () => {
    expect(parseKillmailEvent(rawEvent).lossType).toBe('SHIP')
  })

  it('parses kill_timestamp as bigint', () => {
    expect(parseKillmailEvent(rawEvent).killTimestamp).toBe(1774039974n)
  })

  it('parses txDigest', () => {
    expect(parseKillmailEvent(rawEvent).txDigest).toBe('KM_TX_ABC')
  })
})

describe('parseInventoryEvent', () => {
  const rawEvent = {
    parsedJson: {
      assembly_id: '0x3b8f818473557bff',
      assembly_key: { item_id: '1000001408476', tenant: 'stillness' },
      character_id: '0xe0e9cdac5887d7cd',
      character_key: { item_id: '2112077957', tenant: 'stillness' },
      item_id: '1000001711419',
      type_id: '84210',
      quantity: 60,
    },
    txDigest: 'DEP_TX_XYZ',
  }

  it('parses assemblyId', () => {
    expect(parseInventoryEvent(rawEvent).assemblyId).toBe('0x3b8f818473557bff')
  })

  it('parses characterId', () => {
    expect(parseInventoryEvent(rawEvent).characterId).toBe('0xe0e9cdac5887d7cd')
  })

  it('parses quantity as number', () => {
    expect(parseInventoryEvent(rawEvent).quantity).toBe(60)
  })

  it('parses txDigest', () => {
    expect(parseInventoryEvent(rawEvent).txDigest).toBe('DEP_TX_XYZ')
  })
})

describe('extractCharacterId', () => {
  it('extracts character_id from content fields as bare string', () => {
    const content = {
      dataType: 'moveObject',
      fields: { character_id: '0xef0945b' },
    }
    expect(extractCharacterId(content, '0xfallback')).toBe('0xef0945b')
  })

  it('extracts character_id from content fields as { id } shape', () => {
    const content = {
      dataType: 'moveObject',
      fields: { character_id: { id: '0xef0945b' } },
    }
    expect(extractCharacterId(content, '0xfallback')).toBe('0xef0945b')
  })

  it('falls back to objectId when content has no character_id field', () => {
    const content = {
      dataType: 'moveObject',
      fields: { name: 'Scout' },
    }
    expect(extractCharacterId(content, '0xfallback')).toBe('0xfallback')
  })

  it('falls back to objectId when content is null', () => {
    expect(extractCharacterId(null, '0xfallback')).toBe('0xfallback')
  })
})

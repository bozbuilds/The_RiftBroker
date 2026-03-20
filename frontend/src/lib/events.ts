import type { SuiClient } from '@mysten/sui/client'

import { WORLD_PACKAGE_ID } from './constants'

export interface JumpEvent {
  readonly characterId: string
  readonly sourceGateId: string
  readonly destinationGateId: string
  readonly timestamp: bigint
  readonly txDigest: string
}

export interface LocationEvent {
  readonly assemblyId: string
  readonly solarSystem: number
  readonly x: bigint
  readonly y: bigint
  readonly z: bigint
  readonly locationHash: Uint8Array
  readonly typeId: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseJumpEvent(raw: any): JumpEvent {
  const json = raw.parsedJson
  return {
    characterId: json.character_id,
    sourceGateId: json.source_gate_id,
    destinationGateId: json.destination_gate_id,
    timestamp: BigInt(raw.timestampMs),
    txDigest: raw.txDigest,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseLocationEvent(raw: any): LocationEvent {
  const json = raw.parsedJson
  return {
    assemblyId: json.assembly_id,
    solarSystem: Number(json.solarsystem),
    x: BigInt(json.x),
    y: BigInt(json.y),
    z: BigInt(json.z),
    locationHash: new Uint8Array(json.location_hash),
    typeId: json.type_id,
  }
}

/** Fetch recent JumpEvents, optionally filtered by character ID. */
export async function fetchJumpEvents(
  suiClient: SuiClient,
  characterId?: string,
  packageId: string = WORLD_PACKAGE_ID,
): Promise<JumpEvent[]> {
  const { data } = await suiClient.queryEvents({
    query: { MoveEventType: `${packageId}::gate::JumpEvent` },
    order: 'descending',
    limit: 50,
  })
  const all = data.map(parseJumpEvent)
  // SUI queryEvents can't filter by inner fields — filter client-side
  if (characterId) return all.filter(e => e.characterId === characterId)
  return all
}

/** Fetch the LocationRevealedEvent for a specific assembly. */
export async function fetchLocationEvent(
  suiClient: SuiClient,
  assemblyId: string,
  packageId: string = WORLD_PACKAGE_ID,
): Promise<LocationEvent | null> {
  // SUI queryEvents can't filter by inner fields — fetch and filter client-side.
  // For large event volumes, consider paginating. limit: 200 covers most deployments.
  const { data } = await suiClient.queryEvents({
    query: { MoveEventType: `${packageId}::location::LocationRevealedEvent` },
    order: 'descending',
    limit: 200,
  })
  const parsed = data.map(parseLocationEvent)
  return parsed.find(e => e.assemblyId === assemblyId) ?? null
}

/**
 * Extract the character_id from a PlayerProfile's content fields.
 * Handles both bare string and `{ id: string }` shapes.
 * Falls back to objectId if the field is missing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractCharacterId(content: any, objectId: string): string {
  if (!content?.fields) return objectId
  const cid = content.fields.character_id
  if (typeof cid === 'string') return cid
  if (cid && typeof cid === 'object' && 'id' in cid) return cid.id
  return objectId
}

/**
 * Resolve a wallet address to an EVE Frontier character ID.
 * Queries PlayerProfile objects owned by the wallet address.
 * Returns null if no PlayerProfile is found.
 */
export async function resolveCharacterId(
  suiClient: SuiClient,
  walletAddress: string,
  packageId: string = WORLD_PACKAGE_ID,
): Promise<string | null> {
  const { data } = await suiClient.getOwnedObjects({
    owner: walletAddress,
    filter: { StructType: `${packageId}::smart_character::PlayerProfile` },
    options: { showContent: true },
    limit: 1,
  })
  if (data.length === 0 || !data[0]?.data?.content) return null
  return extractCharacterId(data[0].data.content, data[0].data.objectId)
}

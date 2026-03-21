import { WORLD_PACKAGE_ID } from './constants'

/**
 * SUI event query functions for EVE Frontier on-chain data.
 *
 * All queries use a fixed limit (250) and client-side filtering because
 * SUI's queryEvents API cannot filter by inner event fields. For higher
 * coverage, implement cursor-based pagination:
 *   - Use `hasNextPage` + `nextCursor` from queryEvents response
 *   - Paginate until target events are found or no more pages
 *   - Consider a max page cap to avoid runaway queries
 * See SUI SDK Event Pagination in project memory for cursor type details.
 */

/** SUI client type — inferred from dapp-kit's useSuiClient(). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SuiClient = any

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
  readonly txDigest: string
}

export interface KillmailEvent {
  readonly killerId: string
  readonly victimId: string
  readonly solarSystemId: string
  readonly lossType: string
  readonly killTimestamp: bigint
  readonly txDigest: string
}

export interface InventoryEvent {
  readonly assemblyId: string
  readonly characterId: string
  readonly itemId: string
  readonly typeId: string
  readonly quantity: number
  readonly txDigest: string
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
    txDigest: raw.txDigest ?? '',
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseKillmailEvent(raw: any): KillmailEvent {
  const json = raw.parsedJson
  return {
    killerId: json.killer_id.item_id,
    victimId: json.victim_id.item_id,
    solarSystemId: json.solar_system_id.item_id,
    lossType: json.loss_type?.['@variant'] ?? 'unknown',
    killTimestamp: BigInt(json.kill_timestamp),
    txDigest: raw.txDigest,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseInventoryEvent(raw: any): InventoryEvent {
  const json = raw.parsedJson
  return {
    assemblyId: json.assembly_id,
    characterId: json.character_id,
    itemId: json.item_id,
    typeId: json.type_id,
    quantity: Number(json.quantity),
    txDigest: raw.txDigest,
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
    limit: 250,
  })
  const all = data.map(parseJumpEvent)
  // SUI queryEvents can't filter by inner fields — filter client-side
  if (characterId) return all.filter((e: JumpEvent) => e.characterId === characterId)
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
    limit: 250,
  })
  const parsed = data.map(parseLocationEvent)
  return parsed.find((e: LocationEvent) => e.assemblyId === assemblyId) ?? null
}

/**
 * Batch-fetch LocationRevealedEvents and return a map of assemblyId → LocationEvent.
 * Useful for resolving gate locations for a list of jump events.
 */
export async function fetchLocationEvents(
  suiClient: SuiClient,
  assemblyIds: string[],
  packageId: string = WORLD_PACKAGE_ID,
): Promise<Map<string, LocationEvent>> {
  if (assemblyIds.length === 0) return new Map()
  const { data } = await suiClient.queryEvents({
    query: { MoveEventType: `${packageId}::location::LocationRevealedEvent` },
    order: 'descending',
    limit: 250,
  })
  const parsed = data.map(parseLocationEvent)
  const idSet = new Set(assemblyIds)
  const result = new Map<string, LocationEvent>()
  for (const loc of parsed)
    if (idSet.has(loc.assemblyId) && !result.has(loc.assemblyId))
      result.set(loc.assemblyId, loc)
  return result
}

/** Fetch recent killmails, optionally filtered by character (as killer or victim). */
export async function fetchKillmails(
  suiClient: SuiClient,
  characterId?: string,
  packageId: string = WORLD_PACKAGE_ID,
): Promise<KillmailEvent[]> {
  const { data } = await suiClient.queryEvents({
    query: { MoveEventType: `${packageId}::killmail::KillmailCreatedEvent` },
    order: 'descending',
    limit: 250,
  })
  const all = data.map(parseKillmailEvent)
  if (characterId) return all.filter((e: KillmailEvent) =>
    e.killerId === characterId || e.victimId === characterId
  )
  return all
}

/** Fetch recent inventory deposit events, optionally filtered by character. */
export async function fetchInventoryEvents(
  suiClient: SuiClient,
  characterId?: string,
  packageId: string = WORLD_PACKAGE_ID,
): Promise<InventoryEvent[]> {
  const { data } = await suiClient.queryEvents({
    query: { MoveEventType: `${packageId}::inventory::ItemDepositedEvent` },
    order: 'descending',
    limit: 250,
  })
  const all = data.map(parseInventoryEvent)
  if (characterId) return all.filter((e: InventoryEvent) => e.characterId === characterId)
  return all
}

/** Fetch structures in a specific solar system via LocationRevealedEvent. */
export async function fetchStructuresInSystem(
  suiClient: SuiClient,
  solarSystem: string,
  packageId: string = WORLD_PACKAGE_ID,
): Promise<LocationEvent[]> {
  const { data } = await suiClient.queryEvents({
    query: { MoveEventType: `${packageId}::location::LocationRevealedEvent` },
    order: 'descending',
    limit: 250,
  })
  const parsed = data.map(parseLocationEvent)
  return parsed.filter((e: LocationEvent) => e.solarSystem === Number(solarSystem))
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
 * Falls back to CharacterCreatedEvent lookup (works on Stillness).
 * Returns null if no character is found.
 */
export async function resolveCharacterId(
  suiClient: SuiClient,
  walletAddress: string,
  packageId: string = WORLD_PACKAGE_ID,
): Promise<string | null> {
  try {
    const { data } = await suiClient.getOwnedObjects({
      owner: walletAddress,
      filter: { StructType: `${packageId}::smart_character::PlayerProfile` },
      options: { showContent: true },
      limit: 1,
    })
    if (data.length > 0 && data[0]?.data?.content)
      return extractCharacterId(data[0].data.content, data[0].data.objectId)
  } catch {
    // PlayerProfile lookup failed (type may not exist on this network) — try fallback
  }

  // Fallback: CharacterCreatedEvent lookup (works on Stillness)
  try {
    const { data: events } = await suiClient.queryEvents({
      query: { MoveEventType: `${packageId}::character::CharacterCreatedEvent` },
      order: 'descending',
      limit: 250,
    })
    for (const evt of events) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = (evt as any).parsedJson
      if (json?.character_address === walletAddress)
        return json.character_id
    }
  } catch {
    // Fallback failed — return null
  }

  return null
}

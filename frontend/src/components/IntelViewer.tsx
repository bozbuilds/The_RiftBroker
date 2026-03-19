import { useGalaxyData } from '../providers/GalaxyDataProvider'

import type { IntelPayload } from '../lib/intel-schemas'
import type { IntelListingFields } from '../lib/types'

const YIELD_TIER_LABELS: Record<string, string> = {
  low: 'Low (1+ Basic)',
  mid: 'Mid (2+ Advanced)',
  high: 'High (Crude Matter)',
}

/** Resolve a numeric system ID string to its human-readable name. */
function useSystemName(systemId: string): string {
  const galaxy = useGalaxyData()
  if (!galaxy) return systemId
  try {
    const system = galaxy.systemMap.get(BigInt(systemId))
    return system?.name ?? systemId
  } catch {
    return systemId
  }
}

function SystemName({ id }: { id: string }) {
  const name = useSystemName(id)
  return <>{name}</>
}

function NotesLine({ notes }: { notes?: string }) {
  if (!notes) return null
  return <p>Notes: {notes}</p>
}

function ResourceView({ data }: { data: Extract<IntelPayload, { type: 0 }> }) {
  return (
    <div className="intel-type-view">
      <h4>Resource Intel</h4>
      <p>System: <SystemName id={data.systemId} /></p>
      <p>Resource: {data.resourceType}</p>
      <p>Yield: {YIELD_TIER_LABELS[data.yieldTier] ?? data.yieldTier}</p>
      <p>Nearby Body: {data.nearbyBody}</p>
      <NotesLine notes={data.notes} />
    </div>
  )
}

function FleetView({ data }: { data: Extract<IntelPayload, { type: 1 }> }) {
  return (
    <div className="intel-type-view">
      <h4>Fleet Intel</h4>
      <p>System: <SystemName id={data.systemId} /></p>
      <p>Fleet Size: {data.fleetSize}</p>
      <p>Ship Types: {data.shipTypes.join(', ')}</p>
      {data.heading && <p>Heading: {data.heading}</p>}
      <p>Observed: {data.observedAt}</p>
      <NotesLine notes={data.notes} />
    </div>
  )
}

function BaseView({ data }: { data: Extract<IntelPayload, { type: 2 }> }) {
  return (
    <div className="intel-type-view">
      <h4>Base Intel</h4>
      <p>System: <SystemName id={data.systemId} /></p>
      <p>Structure: {data.structureType}</p>
      <p>Defense Level: {data.defenseLevel}/10</p>
      {data.ownerTribe && <p>Owner: {data.ownerTribe}</p>}
      <NotesLine notes={data.notes} />
    </div>
  )
}

function RouteView({ data }: { data: Extract<IntelPayload, { type: 3 }> }) {
  return (
    <div className="intel-type-view">
      <h4>Route Intel</h4>
      <p>Origin: <SystemName id={data.originSystemId} /></p>
      <p>Destination: <SystemName id={data.destSystemId} /></p>
      <p>Threat Level: {data.threatLevel}/10</p>
      {data.gateCamps.length > 0 && (
        <div>
          <p>Gate Camps:</p>
          <ul className="gate-camp-list">
            {data.gateCamps.map((camp, i) => (
              <li key={i}><SystemName id={camp.systemId} />: {camp.description}</li>
            ))}
          </ul>
        </div>
      )}
      <NotesLine notes={data.notes} />
    </div>
  )
}

export function IntelViewer({ payload, listing }: {
  payload: IntelPayload
  listing?: IntelListingFields
}) {
  const view = (() => {
    switch (payload.type) {
      case 0: return <ResourceView data={payload} />
      case 1: return <FleetView data={payload} />
      case 2: return <BaseView data={payload} />
      case 3: return <RouteView data={payload} />
      default: return <div className="intel-type-view"><h4>Unknown Intel Type</h4></div>
    }
  })()

  return (
    <>
      {view}
      {listing?.hasDistanceProof && listing?.distanceMeters !== null && (
        <p className="intel-proximity">
          <span className="listing-proximity-badge">
            Proximity Verified: {(listing.distanceMeters / 1000).toFixed(1)} km
          </span>
        </p>
      )}
    </>
  )
}

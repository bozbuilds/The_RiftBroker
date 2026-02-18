import type { IntelPayload } from '../lib/intel-schemas'

function ResourceView({ data }: { data: Extract<IntelPayload, { type: 0 }> }) {
  return (
    <div className="intel-type-view">
      <h4>Resource Intel</h4>
      <p>System: {data.systemId}</p>
      <p>Resource: {data.resourceType}</p>
      <p>Yield Estimate: {data.yieldEstimate.toLocaleString()}</p>
      <p>Coordinates: ({data.coordinates.x}, {data.coordinates.y}, {data.coordinates.z})</p>
    </div>
  )
}

function FleetView({ data }: { data: Extract<IntelPayload, { type: 1 }> }) {
  return (
    <div className="intel-type-view">
      <h4>Fleet Intel</h4>
      <p>System: {data.systemId}</p>
      <p>Fleet Size: {data.fleetSize}</p>
      <p>Ship Types: {data.shipTypes.join(', ')}</p>
      {data.heading && <p>Heading: {data.heading}</p>}
      <p>Observed: {data.observedAt}</p>
    </div>
  )
}

function BaseView({ data }: { data: Extract<IntelPayload, { type: 2 }> }) {
  return (
    <div className="intel-type-view">
      <h4>Base Intel</h4>
      <p>System: {data.systemId}</p>
      <p>Structure: {data.structureType}</p>
      <p>Defense Level: {data.defenseLevel}/10</p>
      {data.ownerTribe && <p>Owner: {data.ownerTribe}</p>}
    </div>
  )
}

function RouteView({ data }: { data: Extract<IntelPayload, { type: 3 }> }) {
  return (
    <div className="intel-type-view">
      <h4>Route Intel</h4>
      <p>Origin: {data.originSystemId}</p>
      <p>Destination: {data.destSystemId}</p>
      <p>Threat Level: {data.threatLevel}/10</p>
      {data.gateCamps.length > 0 && (
        <div>
          <p>Gate Camps:</p>
          <ul className="gate-camp-list">
            {data.gateCamps.map((camp, i) => (
              <li key={i}>{camp.systemId}: {camp.description}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function IntelViewer({ payload }: { payload: IntelPayload }) {
  switch (payload.type) {
    case 0: return <ResourceView data={payload} />
    case 1: return <FleetView data={payload} />
    case 2: return <BaseView data={payload} />
    case 3: return <RouteView data={payload} />
    default: return <div className="intel-type-view"><h4>Unknown Intel Type</h4></div>
  }
}

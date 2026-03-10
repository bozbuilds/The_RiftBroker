import { useSignAndExecuteTransaction, useSuiClient, useCurrentAccount } from '@mysten/dapp-kit'
import { SealClient } from '@mysten/seal'
import { useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'

import { INTEL_TYPE_LABELS, SEAL_KEY_SERVERS } from '../lib/constants'
import { mistToSui } from '../lib/format'
import { intelPayloadSchema } from '../lib/intel-schemas'
import { encryptIntel } from '../lib/seal'
import { buildCreateListingTx, buildSetBlobIdTx } from '../lib/transactions'
import { uploadBlob } from '../lib/walrus'

function MistHint({ mist }: { mist: string }) {
  const sui = mistToSui(mist)
  if (!sui) return null
  return <div className="form-hint"><span className="form-hint-value">{sui} SUI</span></div>
}

function SystemIdInput({
  value,
  onChange,
  label,
  required,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  required?: boolean
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. 30004759"
        required={required}
      />
      <div className="form-hint">Enter the numeric system ID. Searchable picker coming soon.</div>
    </div>
  )
}

export function CreateListing() {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const queryClient = useQueryClient()
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction()

  const sealClient = useMemo(
    () => new SealClient({ suiClient, serverConfigs: SEAL_KEY_SERVERS, verifyKeyServers: false }),
    [suiClient],
  )

  const [intelType, setIntelType] = useState(0)
  const [systemId, setSystemId] = useState('')
  const [price, setPrice] = useState('')
  const [decayHours, setDecayHours] = useState('24')
  const [stakeAmount, setStakeAmount] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Resource fields
  const [resourceType, setResourceType] = useState('')
  const [yieldTier, setYieldTier] = useState<'low' | 'mid' | 'high'>('low')
  const [nearbyBody, setNearbyBody] = useState('')

  // Fleet fields
  const [fleetSize, setFleetSize] = useState('')
  const [shipTypes, setShipTypes] = useState('')
  const [heading, setHeading] = useState('')
  const [observedAt, setObservedAt] = useState('')

  // Base fields
  const [structureType, setStructureType] = useState('')
  const [defenseLevel, setDefenseLevel] = useState('5')
  const [ownerTribe, setOwnerTribe] = useState('')

  // Route fields
  const [originSystem, setOriginSystem] = useState('')
  const [destSystem, setDestSystem] = useState('')
  const [threatLevel, setThreatLevel] = useState('5')
  const [gateCamps, setGateCamps] = useState<{ systemId: string; description: string }[]>([])

  // Shared
  const [notes, setNotes] = useState('')

  if (!account) return null

  function buildPayload() {
    const sid = intelType === 3 ? originSystem : systemId
    const n = notes.trim() || undefined
    switch (intelType) {
      case 0:
        return {
          type: 0 as const,
          systemId: sid,
          resourceType,
          yieldTier,
          nearbyBody,
          notes: n,
        }
      case 1:
        return {
          type: 1 as const,
          systemId: sid,
          fleetSize: Number(fleetSize),
          shipTypes: shipTypes.split(',').map((s) => s.trim()).filter(Boolean),
          heading: heading || undefined,
          observedAt: observedAt || new Date().toISOString(),
          notes: n,
        }
      case 2:
        return {
          type: 2 as const,
          systemId: sid,
          structureType,
          defenseLevel: Number(defenseLevel),
          ownerTribe: ownerTribe || undefined,
          notes: n,
        }
      case 3:
        return {
          type: 3 as const,
          originSystemId: originSystem,
          destSystemId: destSystem,
          threatLevel: Number(threatLevel),
          gateCamps,
          notes: n,
        }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus(null)

    try {
      const assembled = buildPayload()
      const result = intelPayloadSchema.safeParse(assembled)
      if (!result.success) {
        setError('Validation failed: ' + result.error.issues.map((i) => i.message).join(', '))
        return
      }

      const onChainSystemId = intelType === 3 ? originSystem : systemId

      setStatus('Creating listing...')
      const payload = new TextEncoder().encode(JSON.stringify(result.data))
      const createTx = buildCreateListingTx({
        intelType,
        systemId: BigInt(onChainSystemId),
        price: BigInt(price),
        decayHours: BigInt(decayHours),
        walrusBlobId: new Uint8Array(0),
        stakeAmount: BigInt(stakeAmount),
      })
      const createResult = await signAndExecute({ transaction: createTx })
      await suiClient.waitForTransaction({ digest: createResult.digest })

      const txDetails = await suiClient.getTransactionBlock({
        digest: createResult.digest,
        options: { showObjectChanges: true },
      })
      const created = txDetails.objectChanges?.find(
        (c) => c.type === 'created' && 'objectType' in c
          && c.objectType.includes('IntelListing'),
      )
      if (!created || !('objectId' in created)) {
        setError('Failed to find created listing ID')
        return
      }
      const listingId = created.objectId

      setStatus('Encrypting intel...')
      const ciphertext = await encryptIntel({
        sealClient,
        listingId,
        payload,
      })

      setStatus('Uploading to Walrus...')
      const blobId = await uploadBlob(ciphertext)

      setStatus('Finalizing listing...')
      const setBlobTx = buildSetBlobIdTx(
        listingId,
        new TextEncoder().encode(blobId),
      )
      const setResult = await signAndExecute({ transaction: setBlobTx })
      await suiClient.waitForTransaction({ digest: setResult.digest })

      await queryClient.invalidateQueries({ queryKey: ['listings'] })
      setStatus('Listing created successfully!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStatus(null)
    }
  }

  function handleTypeChange(newType: number) {
    setIntelType(newType)
    setSystemId('')
    setOriginSystem('')
    setDestSystem('')
  }

  return (
    <section>
      <h2>Create Intel Listing</h2>
      <fieldset className="card" disabled={!!status} style={{ border: 'none' }}>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Intel Type</label>
          <select
            className="form-select"
            value={intelType}
            onChange={(e) => handleTypeChange(Number(e.target.value))}
          >
            {INTEL_TYPE_LABELS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {intelType !== 3 && (
          <SystemIdInput
            value={systemId}
            onChange={setSystemId}
            label="System"
            required
          />
        )}

        <div className="form-group">
          <label className="form-label">Price (MIST)</label>
          <input
            className="form-input"
            type="text"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="e.g. 1000000000"
            required
          />
          <MistHint mist={price} />
        </div>

        <div className="form-group">
          <label className="form-label">Decay Hours</label>
          <input
            className="form-input"
            type="number"
            min="1"
            value={decayHours}
            onChange={(e) => setDecayHours(e.target.value)}
            required
          />
          <div className="form-hint">How long until this intel expires</div>
        </div>

        <div className="form-group">
          <label className="form-label">Quality Deposit (MIST)</label>
          <input
            className="form-input"
            type="text"
            value={stakeAmount}
            onChange={(e) => setStakeAmount(e.target.value)}
            placeholder="e.g. 500000000"
            required
          />
          <MistHint mist={stakeAmount} />
          <div className="form-hint">
            Locked while your listing is active. Higher deposits signal confidence in your intel.
          </div>
        </div>

        <div className="form-section">
          <label className="form-label">Intel Details</label>

          {intelType === 0 && (
            <>
              <div className="form-group">
                <label className="form-label">Resource Type</label>
                <input
                  className="form-input"
                  type="text"
                  value={resourceType}
                  onChange={(e) => setResourceType(e.target.value)}
                  placeholder="e.g. Feldspar Crystals, Hydrated Sulfide Matrix, Ice Shards, Deep-Core Carbon"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Yield Tier</label>
                <select
                  className="form-select"
                  value={yieldTier}
                  onChange={(e) => setYieldTier(e.target.value as 'low' | 'mid' | 'high')}
                >
                  <option value="low">Low (1+ Basic)</option>
                  <option value="mid">Mid (2+ Advanced)</option>
                  <option value="high">High (Crude Matter)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Nearby Planetary Body</label>
                <input
                  className="form-input"
                  type="text"
                  value={nearbyBody}
                  onChange={(e) => setNearbyBody(e.target.value)}
                  placeholder="e.g. Planet 1 Moon 1, P1-M2, P3"
                  required
                />
              </div>
            </>
          )}

          {intelType === 1 && (
            <>
              <div className="form-group">
                <label className="form-label">Fleet Size</label>
                <input
                  className="form-input"
                  type="number"
                  min="1"
                  value={fleetSize}
                  onChange={(e) => setFleetSize(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Ship Types</label>
                <input
                  className="form-input"
                  type="text"
                  value={shipTypes}
                  onChange={(e) => setShipTypes(e.target.value)}
                  placeholder="e.g. Frigate, Cruiser, Battleship"
                  required
                />
                <div className="form-hint">Comma-separated list</div>
              </div>
              <div className="form-group">
                <label className="form-label">Heading (optional)</label>
                <input
                  className="form-input"
                  type="text"
                  value={heading}
                  onChange={(e) => setHeading(e.target.value)}
                  placeholder="e.g. Towards Core"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Observed At</label>
                <input
                  className="form-input"
                  type="datetime-local"
                  value={observedAt}
                  onChange={(e) => setObservedAt(e.target.value)}
                />
                <div className="form-hint">Defaults to now if left blank</div>
              </div>
            </>
          )}

          {intelType === 2 && (
            <>
              <div className="form-group">
                <label className="form-label">Structure Type</label>
                <input
                  className="form-input"
                  type="text"
                  value={structureType}
                  onChange={(e) => setStructureType(e.target.value)}
                  placeholder="e.g. Smart Storage Unit"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Defense Level (0-10)</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  max="10"
                  value={defenseLevel}
                  onChange={(e) => setDefenseLevel(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Owner Tribe (optional)</label>
                <input
                  className="form-input"
                  type="text"
                  value={ownerTribe}
                  onChange={(e) => setOwnerTribe(e.target.value)}
                />
              </div>
            </>
          )}

          {intelType === 3 && (
            <>
              <SystemIdInput
                value={originSystem}
                onChange={setOriginSystem}
                label="Origin System"
                required
              />
              <SystemIdInput
                value={destSystem}
                onChange={setDestSystem}
                label="Destination System"
                required
              />
              <div className="form-group">
                <label className="form-label">Threat Level (0-10)</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  max="10"
                  value={threatLevel}
                  onChange={(e) => setThreatLevel(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Gate Camps</label>
                {gateCamps.map((camp, i) => (
                  <div key={i} className="form-row" style={{ marginBottom: 4 }}>
                    <input
                      className="form-input"
                      type="text"
                      value={camp.systemId}
                      onChange={(e) => {
                        const next = [...gateCamps]
                        next[i] = { ...camp, systemId: e.target.value }
                        setGateCamps(next)
                      }}
                      placeholder="System ID"
                    />
                    <input
                      className="form-input"
                      type="text"
                      value={camp.description}
                      onChange={(e) => {
                        const next = [...gateCamps]
                        next[i] = { ...camp, description: e.target.value }
                        setGateCamps(next)
                      }}
                      placeholder="Description"
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setGateCamps(gateCamps.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {gateCamps.length < 3 && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setGateCamps([...gateCamps, { systemId: '', description: '' }])}
                  >
                    Add gate camp
                  </button>
                )}
              </div>
            </>
          )}
          <div className="form-group">
            <label className="form-label">Misc Notes (optional)</label>
            <textarea
              className="form-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any other pertinent information for the buyer"
              rows={2}
            />
          </div>
        </div>

        <button className="btn-primary" type="submit" disabled={!!status}>
          {status ? (
            <><span className="loading-spinner" />{status}</>
          ) : (
            'Create Listing'
          )}
        </button>
      </form>
      </fieldset>

      {error && <div className="status-message status-error">{error}</div>}
    </section>
  )
}

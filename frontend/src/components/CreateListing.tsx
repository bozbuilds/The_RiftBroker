import { useSignAndExecuteTransaction, useSuiClient, useCurrentAccount } from '@mysten/dapp-kit'
import { SealClient } from '@mysten/seal'
import { useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'

import { DISTANCE_VKEY_ID, INTEL_TYPE_LABELS, LOCATION_VKEY_ID, PRESENCE_VKEY_ID, SEAL_KEY_SERVERS, WORLD_PACKAGE_ID } from '../lib/constants'
import { fetchJumpEvents, fetchLocationEvent, fetchLocationEvents, resolveCharacterId } from '../lib/events'
import { mistToSui } from '../lib/format'
import { intelPayloadSchema } from '../lib/intel-schemas'
import { encryptIntel } from '../lib/seal'
import { buildAttachDistanceProofTx, buildCreateListingTx, buildCreatePresenceVerifiedListingTx, buildCreateVerifiedListingTx, buildSetBlobIdTx } from '../lib/transactions'
import { uploadBlob } from '../lib/walrus'
import { generateDistanceProof, generateLocationProof, generatePresenceProof, generateSalt } from '../lib/zk-proof'

import { useGalaxyData } from '../providers/GalaxyDataProvider'
import { SystemPicker } from './SystemPicker'
import type { JumpEvent, LocationEvent } from '../lib/events'

function MistHint({ mist }: { mist: string }) {
  const sui = mistToSui(mist)
  if (!sui) return null
  return <div className="form-hint"><span className="form-hint-value">{sui} SUI</span></div>
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

  const galaxy = useGalaxyData()

  const [intelType, setIntelType] = useState(0)
  const [systemId, setSystemId] = useState<bigint | null>(null)
  const [price, setPrice] = useState('')
  const [decayHours, setDecayHours] = useState('24')
  const [stakeAmount, setStakeAmount] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [verifyLocation, setVerifyLocation] = useState(false)
  const [proofStatus, setProofStatus] = useState<string | null>(null)
  const [targetSystemId, setTargetSystemId] = useState<bigint | null>(null)
  const [distanceProofStatus, setDistanceProofStatus] = useState<string | null>(null)
  const [verifyPresence, setVerifyPresence] = useState(false)
  const [jumpEvents, setJumpEvents] = useState<JumpEvent[]>([])
  const [selectedJump, setSelectedJump] = useState<JumpEvent | null>(null)
  const [gateLocation, setGateLocation] = useState<LocationEvent | null>(null)
  const [targetAssemblyId, setTargetAssemblyId] = useState('')
  const [targetLocation, setTargetLocation] = useState<LocationEvent | null>(null)
  const [presenceStatus, setPresenceStatus] = useState<string | null>(null)
  const [gateSystemNames, setGateSystemNames] = useState<Map<string, string>>(new Map())

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
  const [originSystem, setOriginSystem] = useState<bigint | null>(null)
  const [destSystem, setDestSystem] = useState<bigint | null>(null)
  const [threatLevel, setThreatLevel] = useState('5')
  const [gateCamps, setGateCamps] = useState<{ systemId: string; description: string }[]>([])

  // Shared
  const [notes, setNotes] = useState('')

  if (!account) return null

  function buildPayload() {
    const sid = (intelType === 3 ? originSystem : systemId)?.toString() ?? ''
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
          originSystemId: originSystem?.toString() ?? '',
          destSystemId: destSystem?.toString() ?? '',
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
    setProofStatus(null)

    try {
      const assembled = buildPayload()
      const result = intelPayloadSchema.safeParse(assembled)
      if (!result.success) {
        setError('Validation failed: ' + result.error.issues.map((i) => i.message).join(', '))
        return
      }

      const onChainSystemId = intelType === 3 ? originSystem : systemId
      if (!onChainSystemId) {
        setError('Please select a system')
        return
      }

      // Attempt ZK proof generation when requested (non-Route intel only)
      let proofBytes: Uint8Array | null = null
      let publicInputsBytes: Uint8Array | null = null
      let locationSalt: bigint | null = null
      const shouldVerify = verifyLocation && intelType !== 3

      if (shouldVerify) {
        const system = galaxy?.systemMap.get(onChainSystemId)
        if (system?.rawX !== undefined && system?.rawY !== undefined && system?.rawZ !== undefined) {
          setProofStatus('Generating ZK location proof...')
          try {
            const proof = await generateLocationProof({ x: system.rawX, y: system.rawY, z: system.rawZ })
            proofBytes = proof.proofBytes
            publicInputsBytes = proof.publicInputsBytes
            locationSalt = proof.salt
            setProofStatus(null)
          } catch (proofErr) {
            setProofStatus(null)
            console.error('[ZK location proof failed]', proofErr)
            setError(
              'Location proof generation failed — creating unverified listing instead.',
            )
          }
        } else {
          setError('System coordinates unavailable — creating unverified listing instead.')
        }
      }

      // Presence proof path (Phase 5 — on-chain event data)
      let presenceProofBytes: Uint8Array | null = null
      let presenceInputsBytes: Uint8Array | null = null
      let jumpTxDigest: Uint8Array = new Uint8Array(0)
      const shouldVerifyPresence = verifyPresence && intelType !== 3 && (PRESENCE_VKEY_ID as string) !== '' && selectedJump && gateLocation && targetLocation

      if (shouldVerifyPresence && selectedJump && gateLocation && targetLocation) {
        setPresenceStatus('Generating presence proof...')
        try {
          const proof = await generatePresenceProof(
            { x: gateLocation.x, y: gateLocation.y, z: gateLocation.z },
            { x: targetLocation.x, y: targetLocation.y, z: targetLocation.z },
            selectedJump.timestamp,
          )
          presenceProofBytes = proof.proofBytes
          presenceInputsBytes = proof.publicInputsBytes
          // txDigest is a Base58 string — encode as UTF-8 bytes for on-chain audit trail storage.
          // Verifiers read the bytes as UTF-8 to reconstruct the Base58 tx digest.
          jumpTxDigest = new TextEncoder().encode(selectedJump.txDigest)
          setPresenceStatus(null)
        } catch (proofErr) {
          setPresenceStatus(null)
          console.error('[ZK presence proof failed]', proofErr)
          setError('Presence proof generation failed — creating unverified listing instead.')
        }
      }

      setStatus('Creating listing...')
      const payload = new TextEncoder().encode(JSON.stringify(result.data))

      const usePresenceVerified = presenceProofBytes !== null && presenceInputsBytes !== null
      const useLocationVerified = !usePresenceVerified && proofBytes !== null && publicInputsBytes !== null

      const createTx = usePresenceVerified
        ? buildCreatePresenceVerifiedListingTx({
            intelType,
            systemId: onChainSystemId,
            individualPrice: BigInt(price),
            decayHours: BigInt(decayHours),
            walrusBlobId: new Uint8Array(0),
            stakeAmount: BigInt(stakeAmount),
            presenceVkeyId: PRESENCE_VKEY_ID,
            proofPointsBytes: presenceProofBytes!,
            publicInputsBytes: presenceInputsBytes!,
            jumpTxDigest,
          })
        : useLocationVerified
        ? buildCreateVerifiedListingTx({
            intelType,
            systemId: onChainSystemId,
            individualPrice: BigInt(price),
            decayHours: BigInt(decayHours),
            walrusBlobId: new Uint8Array(0),
            stakeAmount: BigInt(stakeAmount),
            vkeyId: LOCATION_VKEY_ID,
            proofPointsBytes: proofBytes!,
            publicInputsBytes: publicInputsBytes!,
          })
        : buildCreateListingTx({
            intelType,
            systemId: onChainSystemId,
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

      // Distance proof flow (non-Route, when target system selected)
      if (useLocationVerified && locationSalt && targetSystemId && onChainSystemId && intelType !== 3) {
        const targetSystem = galaxy?.systemMap.get(targetSystemId)
        const scoutSystem = galaxy?.systemMap.get(onChainSystemId)
        if (targetSystem?.rawX !== undefined && scoutSystem?.rawX !== undefined) {
          setDistanceProofStatus('Generating distance proof...')
          try {
            const salt2 = generateSalt()
            const distanceResult = await generateDistanceProof(
              { x: scoutSystem.rawX, y: scoutSystem.rawY, z: scoutSystem.rawZ },
              locationSalt,
              { x: targetSystem.rawX, y: targetSystem.rawY, z: targetSystem.rawZ },
              salt2,
            )
            setDistanceProofStatus('Attaching distance proof...')
            const attachTx = buildAttachDistanceProofTx({
              listingId,
              distanceVkeyId: DISTANCE_VKEY_ID,
              proofPointsBytes: distanceResult.proofBytes,
              publicInputsBytes: distanceResult.publicInputsBytes,
            })
            const attachResult = await signAndExecute({ transaction: attachTx })
            await suiClient.waitForTransaction({ digest: attachResult.digest })
            setDistanceProofStatus(null)
          } catch (distErr) {
            setDistanceProofStatus(null)
            console.error('[ZK distance proof failed]', distErr)
            setError(
              'Distance proof failed — listing created with location verification only.',
            )
          }
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['listings'] })
      setStatus('Listing created successfully!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStatus(null)
    }
  }

  function handleTypeChange(newType: number) {
    setIntelType(newType)
    setSystemId(null)
    setOriginSystem(null)
    setDestSystem(null)
    setTargetSystemId(null)
  }

  async function handleVerifyPresenceToggle(enabled: boolean) {
    setVerifyPresence(enabled)
    setJumpEvents([])
    setSelectedJump(null)
    setGateLocation(null)
    setTargetAssemblyId('')
    setTargetLocation(null)
    setGateSystemNames(new Map())
    if (!enabled) return
    if (!account) return
    try {
      setPresenceStatus('Resolving character...')
      const characterId = await resolveCharacterId(suiClient, account.address, WORLD_PACKAGE_ID)
      setPresenceStatus('Fetching recent jumps...')
      const jumps = await fetchJumpEvents(suiClient, characterId ?? undefined, WORLD_PACKAGE_ID)
      setJumpEvents(jumps)

      // Resolve gate solar systems for dropdown labels
      if (jumps.length > 0) {
        setPresenceStatus('Resolving gate locations...')
        const gateIds = [...new Set(jumps.map(j => j.destinationGateId))]
        const gateLocations = await fetchLocationEvents(suiClient, gateIds, WORLD_PACKAGE_ID)
        const names = new Map<string, string>()
        for (const [gateId, loc] of gateLocations) {
          const sys = galaxy?.systemMap.get(BigInt(loc.solarSystem))
          names.set(gateId, sys?.name ?? `System ${loc.solarSystem}`)
        }
        setGateSystemNames(names)
      }

      setPresenceStatus(null)
    } catch (err) {
      console.error('[fetchJumpEvents failed]', err)
      setPresenceStatus(null)
      setError('Failed to fetch jump events. Check your connection and try again.')
    }
  }

  async function handleJumpSelect(jump: JumpEvent) {
    setSelectedJump(jump)
    setGateLocation(null)
    try {
      setPresenceStatus('Fetching gate coordinates...')
      const loc = await fetchLocationEvent(suiClient, jump.destinationGateId, WORLD_PACKAGE_ID)
      setGateLocation(loc)
      setPresenceStatus(null)
    } catch (err) {
      console.error('[fetchLocationEvent failed]', err)
      setPresenceStatus(null)
      setError('Failed to fetch gate coordinates. Try selecting a different jump.')
    }
  }

  async function handleTargetAssemblyLookup(assemblyId: string) {
    setTargetLocation(null)
    if (!assemblyId.trim()) return
    try {
      const loc = await fetchLocationEvent(suiClient, assemblyId.trim(), WORLD_PACKAGE_ID)
      setTargetLocation(loc)
    } catch (err) {
      console.error('[fetchLocationEvent for target failed]', err)
    }
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
          <SystemPicker
            systems={galaxy?.systems ?? []}
            value={systemId}
            onChange={setSystemId}
            label="System"
            required
          />
        )}

        {intelType !== 3 && (
          <div className="form-group">
            <label className={`verify-toggle${(intelType === 3 || verifyPresence) ? ' verify-toggle-disabled' : ''}`}>
              <input
                type="checkbox"
                checked={verifyLocation}
                onChange={e => setVerifyLocation(e.target.checked)}
                disabled={intelType === 3 || verifyPresence}
              />
              {' ZK-Verify Location'}
              {verifyPresence && <span className="verify-toggle-hint"> (disabled when Verify with On-Chain Data is active)</span>}
            </label>
          </div>
        )}

        {intelType === 3 && (
          <div className="form-group">
            <label className="verify-toggle verify-toggle-disabled">
              <input type="checkbox" disabled />
              {' ZK-Verify Location'}
              <span className="verify-toggle-hint"> (not available for Route intel)</span>
            </label>
          </div>
        )}

        {proofStatus && (
          <div className="status-message">
            <span className="loading-spinner" />{proofStatus}
          </div>
        )}

        {verifyLocation && intelType !== 3 && (
          <SystemPicker
            systems={galaxy?.systems ?? []}
            value={targetSystemId}
            onChange={setTargetSystemId}
            label="Observed Entity Location (optional)"
            required={false}
          />
        )}

        {distanceProofStatus && (
          <div className="status-message">
            <span className="loading-spinner" />{distanceProofStatus}
          </div>
        )}

        {intelType !== 3 && (
          <div className="form-group">
            <label className={`verify-toggle${(!PRESENCE_VKEY_ID || verifyLocation) ? ' verify-toggle-disabled' : ''}`}>
              <input
                type="checkbox"
                checked={verifyPresence}
                onChange={e => handleVerifyPresenceToggle(e.target.checked)}
                disabled={intelType === 3 || !PRESENCE_VKEY_ID || verifyLocation}
              />
              {' Verify with On-Chain Data'}
              {!PRESENCE_VKEY_ID && <span className="verify-toggle-hint"> (circuit not yet deployed)</span>}
            </label>
          </div>
        )}

        {presenceStatus && (
          <div className="status-message">
            <span className="loading-spinner" />{presenceStatus}
          </div>
        )}

        {verifyPresence && intelType !== 3 && PRESENCE_VKEY_ID && (
          <>
            {jumpEvents.length === 0 && !presenceStatus && (
              <div className="form-hint">No recent jump events found. Jump through a gate to prove presence.</div>
            )}
            {jumpEvents.length > 0 && (
              <div className="form-group">
                <label className="form-label">Select Jump Event</label>
                <select
                  className="form-select"
                  value={selectedJump?.txDigest ?? ''}
                  onChange={e => {
                    const jump = jumpEvents.find(j => j.txDigest === e.target.value)
                    if (jump) handleJumpSelect(jump)
                  }}
                >
                  <option value="">— Select a jump —</option>
                  {jumpEvents.map(j => {
                    const sysName = gateSystemNames.get(j.destinationGateId)
                    return (
                      <option key={j.txDigest} value={j.txDigest}>
                        {new Date(Number(j.timestamp)).toLocaleString()} — {sysName ?? `gate ${j.destinationGateId.slice(0, 10)}...`}
                      </option>
                    )
                  })}
                </select>
                {gateLocation && (
                  <div className="form-hint">Gate coordinates loaded from system {gateLocation.solarSystem}</div>
                )}
              </div>
            )}
            {selectedJump && (
              <div className="form-group">
                <label className="form-label">Target Assembly ID</label>
                <input
                  className="form-input"
                  type="text"
                  value={targetAssemblyId}
                  onChange={e => setTargetAssemblyId(e.target.value)}
                  onBlur={e => handleTargetAssemblyLookup(e.target.value)}
                  placeholder="0x... (SUI object ID of SSU, gate, or other assembly)"
                />
                {targetLocation && (
                  <div className="form-hint">Target coordinates loaded from system {targetLocation.solarSystem}</div>
                )}
              </div>
            )}
          </>
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
              <SystemPicker
                systems={galaxy?.systems ?? []}
                value={originSystem}
                onChange={setOriginSystem}
                label="Origin System"
                required
              />
              <SystemPicker
                systems={galaxy?.systems ?? []}
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

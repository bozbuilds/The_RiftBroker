import { useSignAndExecuteTransaction, useSuiClient, useCurrentAccount } from '@mysten/dapp-kit'
import { SealClient } from '@mysten/seal'
import { useQueryClient } from '@tanstack/react-query'
import { useState, useMemo, useRef } from 'react'

import { DISTANCE_VKEY_ID, INTEL_TYPE_LABELS, LOCATION_VKEY_ID, PRESENCE_VKEY_ID, SEAL_KEY_SERVERS } from '../lib/constants'
import { fetchJumpEvents, fetchKillmails, fetchInventoryEvents, fetchLocationEvent, fetchLocationEvents, fetchStructuresInSystem, resolveCharacterId } from '../lib/events'
import { mistToSui } from '../lib/format'
import { intelPayloadSchema } from '../lib/intel-schemas'
import { encryptIntel } from '../lib/seal'
import { buildAttachDistanceProofTx, buildAttachEventBadgeTx, buildCreateListingTx, buildCreatePresenceVerifiedListingTx, buildCreateVerifiedListingTx, buildSetBlobIdTx } from '../lib/transactions'
import { uploadBlob } from '../lib/walrus'
import { generateDistanceProof, generateLocationProof, generatePresenceProof, generateSalt } from '../lib/zk-proof'

import { useGalaxyData } from '../providers/GalaxyDataProvider'
import { SystemPicker } from './SystemPicker'
import type { JumpEvent, KillmailEvent, InventoryEvent, LocationEvent } from '../lib/events'

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
  const [inGameWallet, setInGameWallet] = useState('')
  const [jumpEvents, setJumpEvents] = useState<JumpEvent[]>([])
  const [selectedJump, setSelectedJump] = useState<JumpEvent | null>(null)
  const [gateLocation, setGateLocation] = useState<LocationEvent | null>(null)
  const [targetAssemblyId, setTargetAssemblyId] = useState('')
  const [targetLocation, setTargetLocation] = useState<LocationEvent | null>(null)
  const [presenceStatus, setPresenceStatus] = useState<string | null>(null)
  const [gateSystemNames, setGateSystemNames] = useState<Map<string, string>>(new Map())
  const [gateSystemIds, setGateSystemIds] = useState<Map<string, number>>(new Map())
  const [isGlobalFeed, setIsGlobalFeed] = useState(false)
  const lastLookedUpWallet = useRef<string | null>(null)
  const [attachCombat, setAttachCombat] = useState(false)
  const [attachActivity, setAttachActivity] = useState(false)
  const [attachStructure, setAttachStructure] = useState(false)
  const [killmails, setKillmails] = useState<KillmailEvent[]>([])
  const [inventoryEvents, setInventoryEvents] = useState<InventoryEvent[]>([])
  const [structuresInSystem, setStructuresInSystem] = useState<LocationEvent[]>([])
  const [selectedKillmail, setSelectedKillmail] = useState<KillmailEvent | null>(null)
  const [selectedDeposit, setSelectedDeposit] = useState<InventoryEvent | null>(null)
  const [selectedStructure, setSelectedStructure] = useState<LocationEvent | null>(null)
  const [badgeSystemId, setBadgeSystemId] = useState<bigint | null>(null)
  const [assemblySystemIds, setAssemblySystemIds] = useState<Map<string, number>>(new Map())

  // Filter jump events to only those whose gate is in the selected system
  const filteredJumps = useMemo(() => {
    if (!systemId || gateSystemIds.size === 0) return jumpEvents
    const sysNum = Number(systemId)
    return jumpEvents.filter(j => gateSystemIds.get(j.destinationGateId) === sysNum)
  }, [jumpEvents, systemId, gateSystemIds])

  // Filter killmails to only those in the selected system, sorted newest first
  const filteredKillmails = useMemo(() => {
    const filtered = systemId
      ? killmails.filter(km => km.solarSystemId === systemId.toString())
      : killmails
    return [...filtered].sort((a, b) => Number(b.killTimestamp - a.killTimestamp))
  }, [killmails, systemId])

  // Filter deposits to only those whose SSU is in the selected system
  const filteredDeposits = useMemo(() => {
    if (!systemId || assemblySystemIds.size === 0) return []
    const sysNum = Number(systemId)
    return inventoryEvents.filter(dep => assemblySystemIds.get(dep.assemblyId) === sysNum)
  }, [inventoryEvents, systemId, assemblySystemIds])

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

      // Attach event badges
      const badgesToAttach: { type: number; digest: Uint8Array }[] = []
      if (selectedKillmail)
        badgesToAttach.push({ type: 0, digest: new TextEncoder().encode(selectedKillmail.txDigest) })
      if (selectedDeposit)
        badgesToAttach.push({ type: 1, digest: new TextEncoder().encode(selectedDeposit.txDigest) })
      if (selectedStructure)
        badgesToAttach.push({ type: 2, digest: new TextEncoder().encode(selectedStructure.txDigest) })

      console.log('[badge attach]', { listingId, badgesToAttach: badgesToAttach.map(b => ({ type: b.type, digestLen: b.digest.length })), selectedStructure: selectedStructure?.txDigest })

      if (badgesToAttach.length > 0) {
        setStatus('Attaching evidence badges...')
        for (const badge of badgesToAttach) {
          const badgeTx = buildAttachEventBadgeTx({
            listingId,
            badgeType: badge.type,
            txDigest: badge.digest,
          })
          console.log('[badge attach tx]', { badgeType: badge.type, digestLen: badge.digest.length, listingId })
          const badgeResult = await signAndExecute({ transaction: badgeTx })
          console.log('[badge attach result]', badgeResult.digest)
          await suiClient.waitForTransaction({ digest: badgeResult.digest })
          console.log('[badge attach confirmed]', badgeResult.digest)
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
    setInGameWallet('')
    setJumpEvents([])
    setSelectedJump(null)
    setGateLocation(null)
    setTargetAssemblyId('')
    setTargetLocation(null)
    setGateSystemNames(new Map())
    setGateSystemIds(new Map())
    setIsGlobalFeed(false)
    lastLookedUpWallet.current = null
    // Fetch badge events immediately when toggled on (no wallet needed)
    if (enabled) {
      await fetchBadgeEvents()
    } else {
      setKillmails([])
      setInventoryEvents([])
      setAssemblySystemIds(new Map())
      setAttachCombat(false)
      setAttachActivity(false)
      setAttachStructure(false)
      setSelectedKillmail(null)
      setSelectedDeposit(null)
      setSelectedStructure(null)
    }
  }

  async function fetchBadgeEvents(characterId?: string) {
    try {
      const [kms, invs] = await Promise.all([
        fetchKillmails(suiClient, characterId),
        fetchInventoryEvents(suiClient, characterId),
      ])
      setKillmails(kms)
      setInventoryEvents(invs)
      // Resolve SSU locations for system filtering
      const assemblyIds = [...new Set(invs.map(d => d.assemblyId))]
      if (assemblyIds.length > 0) {
        const locs = await fetchLocationEvents(suiClient, assemblyIds)
        const sysMap = new Map<string, number>()
        for (const [id, loc] of locs) sysMap.set(id, loc.solarSystem)
        setAssemblySystemIds(sysMap)
      }
    } catch {
      // Non-critical — badge events are optional
    }
  }

  async function handleLookupJumps(walletAddress: string) {
    const trimmedInput = walletAddress.trim()
    if (lastLookedUpWallet.current !== null && lastLookedUpWallet.current === trimmedInput) return

    setJumpEvents([])
    setSelectedJump(null)
    setGateLocation(null)
    setTargetAssemblyId('')
    setTargetLocation(null)
    setGateSystemNames(new Map())
    setGateSystemIds(new Map())
    setIsGlobalFeed(false)

    const trimmed = walletAddress.trim()
    try {
      let resolvedCharacterId: string | undefined
      if (trimmed) {
        setPresenceStatus('Resolving character...')
        const characterId = await resolveCharacterId(suiClient, trimmed)
        if (characterId) {
          resolvedCharacterId = characterId
          setPresenceStatus('Fetching your jumps...')
          const jumps = await fetchJumpEvents(suiClient, characterId)
          setJumpEvents(jumps)
          await resolveGateNames(jumps)
          await fetchBadgeEvents(characterId)
          setPresenceStatus(null)
          lastLookedUpWallet.current = trimmedInput
          return
        }
      }
      // Fallback: no wallet entered or no character found → global feed
      setIsGlobalFeed(true)
      setPresenceStatus('No character found — fetching global jumps...')
      const jumps = await fetchJumpEvents(suiClient, undefined)
      setJumpEvents(jumps)
      await resolveGateNames(jumps)
      // Badge events fetched unfiltered — shows all recent events so scouts
      // can attach evidence even when character resolution fails.
      await fetchBadgeEvents(resolvedCharacterId)
      setPresenceStatus(null)
      lastLookedUpWallet.current = trimmedInput
    } catch (err) {
      console.error('[fetchJumpEvents failed]', err)
      setPresenceStatus(null)
      setError('Failed to fetch jump events. Check your connection and try again.')
    }
  }

  async function handleBadgeSystemSelect(sysId: bigint | null) {
    setBadgeSystemId(sysId)
    setStructuresInSystem([])
    setSelectedStructure(null)
    if (!sysId) return
    try {
      const structures = await fetchStructuresInSystem(suiClient, sysId.toString())
      setStructuresInSystem(structures)
    } catch (err) {
      console.error('[fetchStructuresInSystem failed]', err)
      setError('Failed to fetch structures. Check your connection and try again.')
    }
  }

  async function resolveGateNames(jumps: JumpEvent[]) {
    if (jumps.length === 0) return
    setPresenceStatus('Resolving gate locations...')
    const gateIds = [...new Set(jumps.map(j => j.destinationGateId))]
    const gateLocations = await fetchLocationEvents(suiClient, gateIds)
    const names = new Map<string, string>()
    const sysIds = new Map<string, number>()
    for (const [gateId, loc] of gateLocations) {
      const sys = galaxy?.systemMap.get(BigInt(loc.solarSystem))
      names.set(gateId, sys?.name ?? `System ${loc.solarSystem}`)
      sysIds.set(gateId, loc.solarSystem)
    }
    setGateSystemNames(names)
    setGateSystemIds(sysIds)
  }

  async function handleJumpSelect(jump: JumpEvent) {
    setSelectedJump(jump)
    setGateLocation(null)
    try {
      setPresenceStatus('Fetching gate coordinates...')
      const loc = await fetchLocationEvent(suiClient, jump.destinationGateId)
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
      const loc = await fetchLocationEvent(suiClient, assemblyId.trim())
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
            <div className="form-group">
              <label className="form-label">In-Game Wallet Address</label>
              <input
                className="form-input"
                type="text"
                value={inGameWallet}
                onChange={e => setInGameWallet(e.target.value)}
                onBlur={e => handleLookupJumps(e.target.value)}
                placeholder="0x... (your EVE Frontier SUI wallet address)"
              />
              <div className="form-hint">
                Paste the SUI address from your EVE Frontier client. Leave blank to browse the global jump feed.
              </div>
              {!jumpEvents.length && !presenceStatus && inGameWallet === '' && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => handleLookupJumps('')}
                >
                  Browse global jump feed
                </button>
              )}
            </div>
            {isGlobalFeed && jumpEvents.length > 0 && (
              <div className="status-message" style={{ marginBottom: '0.5rem', fontSize: '0.8rem' }}>
                Showing global jump feed. Enter your in-game wallet address above to see only your jumps.
              </div>
            )}
            {jumpEvents.length === 0 && !presenceStatus && inGameWallet !== '' && (
              <div className="form-hint">No jump events found for this character. Have you jumped through a gate recently?</div>
            )}
            {jumpEvents.length > 0 && filteredJumps.length === 0 && systemId && (
              <div className="form-hint">No jump events found for this system. Try selecting a different system or check recent gate activity.</div>
            )}
            {filteredJumps.length > 0 && (
              <div className="form-group">
                <label className="form-label">Select Jump Event</label>
                <select
                  className="form-select"
                  value={selectedJump?.txDigest ?? ''}
                  onChange={e => {
                    const jump = filteredJumps.find(j => j.txDigest === e.target.value)
                    if (jump) handleJumpSelect(jump)
                  }}
                >
                  <option value="">— Select a jump —</option>
                  {filteredJumps.map((j, idx) => {
                    const sysName = gateSystemNames.get(j.destinationGateId)
                    return (
                      <option key={`${j.txDigest}-${idx}`} value={j.txDigest}>
                        {new Date(Number(j.timestamp)).toLocaleString()} — {sysName ?? `gate ${j.destinationGateId.slice(0, 10)}...`}
                      </option>
                    )
                  })}
                </select>
                {selectedJump && !gateLocation && !presenceStatus && (
                  <div className="form-hint">Jump selected. Gate location not found in recent events.</div>
                )}
                {gateLocation && (
                  <div className="form-hint" style={{ color: 'var(--success)' }}>
                    Gate coordinates loaded — system {gateLocation.solarSystem} ({gateSystemNames.get(selectedJump?.destinationGateId ?? '') ?? 'unknown'})
                  </div>
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

        {/* Attach Evidence section — visible when badge events have been fetched */}
        {(killmails.length > 0 || inventoryEvents.length > 0) && (
          <div className="form-section">
            <label className="form-label">Attach Evidence (optional)</label>

            <div className="form-group">
              <label className="verify-toggle">
                <input
                  type="checkbox"
                  checked={attachCombat}
                  onChange={e => { setAttachCombat(e.target.checked); if (!e.target.checked) setSelectedKillmail(null) }}
                  disabled={filteredKillmails.length === 0}
                />
                {' Combat Verified'}
                {killmails.length > 0 && filteredKillmails.length === 0 && (
                  <span className="form-hint" style={{ marginLeft: '0.5rem', display: 'inline' }}>— no killmails in this system</span>
                )}
              </label>
              {attachCombat && filteredKillmails.length > 0 && (
                <select
                  className="form-select"
                  value={selectedKillmail?.txDigest ?? ''}
                  onChange={e => {
                    const km = filteredKillmails.find(k => k.txDigest === e.target.value)
                    setSelectedKillmail(km ?? null)
                  }}
                >
                  <option value="">— Select a killmail —</option>
                  {filteredKillmails.map((km, idx) => (
                    <option key={`${km.txDigest}-${idx}`} value={km.txDigest}>
                      {new Date(Number(km.killTimestamp) * 1000).toLocaleString()} — {km.lossType?.toLowerCase() ?? 'unknown'}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="form-group">
              <label className="verify-toggle">
                <input
                  type="checkbox"
                  checked={attachActivity}
                  onChange={e => { setAttachActivity(e.target.checked); if (!e.target.checked) setSelectedDeposit(null) }}
                  disabled={filteredDeposits.length === 0}
                />
                {' Activity Verified'}
                {inventoryEvents.length > 0 && filteredDeposits.length === 0 && (
                  <span className="form-hint" style={{ marginLeft: '0.5rem', display: 'inline' }}>— no deposits in this system</span>
                )}
              </label>
              {attachActivity && filteredDeposits.length > 0 && (
                <select
                  className="form-select"
                  value={selectedDeposit?.txDigest ?? ''}
                  onChange={e => {
                    const dep = filteredDeposits.find(d => d.txDigest === e.target.value)
                    setSelectedDeposit(dep ?? null)
                  }}
                >
                  <option value="">— Select a deposit —</option>
                  {filteredDeposits.map((dep, idx) => (
                    <option key={`${dep.txDigest}-${idx}`} value={dep.txDigest}>
                      SSU {dep.assemblyId.slice(0, 10)}... — {dep.quantity}x item {dep.typeId}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="form-group">
              <label className="verify-toggle">
                <input
                  type="checkbox"
                  checked={attachStructure}
                  onChange={e => { setAttachStructure(e.target.checked); if (!e.target.checked) { setSelectedStructure(null); setBadgeSystemId(null) } }}
                />
                {' Structure Verified'}
              </label>
              {attachStructure && (
                <>
                  <SystemPicker
                    systems={galaxy?.systems ?? []}
                    value={badgeSystemId}
                    onChange={handleBadgeSystemSelect}
                    label="Structure System"
                    required={false}
                  />
                  {structuresInSystem.length > 0 && (
                    <select
                      className="form-select"
                      value={selectedStructure?.assemblyId ?? ''}
                      onChange={e => {
                        const s = structuresInSystem.find(st => st.assemblyId === e.target.value)
                        setSelectedStructure(s ?? null)
                      }}
                    >
                      <option value="">— Select a structure —</option>
                      {structuresInSystem.map(s => (
                        <option key={s.assemblyId} value={s.assemblyId}>
                          {s.assemblyId.slice(0, 14)}... — type {s.typeId} — system {s.solarSystem}
                        </option>
                      ))}
                    </select>
                  )}
                  {badgeSystemId && structuresInSystem.length === 0 && (
                    <div className="form-hint">No revealed structures found in this system.</div>
                  )}
                </>
              )}
            </div>
          </div>
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

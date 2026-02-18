import { useSignAndExecuteTransaction, useSuiClient, useCurrentAccount } from '@mysten/dapp-kit'
import { SealClient } from '@mysten/seal'
import { useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'

import { INTEL_TYPE_LABELS } from '../lib/constants'
import { intelPayloadSchema } from '../lib/intel-schemas'
import { encryptIntel } from '../lib/seal'
import { buildCreateListingTx, buildSetBlobIdTx } from '../lib/transactions'
import { uploadBlob } from '../lib/walrus'

export function CreateListing() {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const queryClient = useQueryClient()
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction()

  // TODO(Phase 4): Replace empty serverConfigs with real testnet key server configs
  const sealClient = useMemo(
    () => new SealClient({ suiClient, serverConfigs: [], verifyKeyServers: false }),
    [suiClient],
  )

  const [intelType, setIntelType] = useState(0)
  const [systemId, setSystemId] = useState('')
  const [price, setPrice] = useState('')
  const [decayHours, setDecayHours] = useState('24')
  const [stakeAmount, setStakeAmount] = useState('')
  const [payloadJson, setPayloadJson] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!account) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus(null)

    try {
      // 1. Validate payload
      const parsed = JSON.parse(payloadJson)
      const result = intelPayloadSchema.safeParse(parsed)
      if (!result.success) {
        setError('Invalid intel payload: ' + JSON.stringify(result.error.issues))
        return
      }

      // 2. Create listing with empty blob_id (step 1 of 2)
      setStatus('Creating listing...')
      const payload = new TextEncoder().encode(JSON.stringify(result.data))
      const createTx = buildCreateListingTx({
        intelType,
        systemId: BigInt(systemId),
        price: BigInt(price),
        decayHours: BigInt(decayHours),
        walrusBlobId: new Uint8Array(0),
        stakeAmount: BigInt(stakeAmount),
      })
      const createResult = await signAndExecute({ transaction: createTx })
      await suiClient.waitForTransaction({ digest: createResult.digest })

      // 3. Get listing ID from created objects
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

      // 4. Encrypt with Seal using listing ID as inner identity
      setStatus('Encrypting intel...')
      const ciphertext = await encryptIntel({
        sealClient,
        listingId,
        payload,
      })

      // 5. Upload to Walrus
      setStatus('Uploading to Walrus...')
      const blobId = await uploadBlob(ciphertext)

      // 6. Set blob_id on listing (step 2 of 2)
      setStatus('Finalizing listing...')
      const setBlobTx = buildSetBlobIdTx(
        listingId,
        new TextEncoder().encode(blobId),
      )
      const setResult = await signAndExecute({ transaction: setBlobTx })
      await suiClient.waitForTransaction({ digest: setResult.digest })

      await queryClient.invalidateQueries({ queryKey: ['listings'] })
      setStatus('Listing created successfully!')
      setPayloadJson('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStatus(null)
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
            onChange={(e) => setIntelType(Number(e.target.value))}
          >
            {INTEL_TYPE_LABELS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">System ID</label>
          <input
            className="form-input"
            type="text"
            value={systemId}
            onChange={(e) => setSystemId(e.target.value)}
            placeholder="e.g. 30004759"
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Price (MIST)</label>
          <input
            className="form-input"
            type="text"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="e.g. 1000000"
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Decay Hours</label>
          <input
            className="form-input"
            type="text"
            value={decayHours}
            onChange={(e) => setDecayHours(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Stake Amount (MIST)</label>
          <input
            className="form-input"
            type="text"
            value={stakeAmount}
            onChange={(e) => setStakeAmount(e.target.value)}
            placeholder="e.g. 500000"
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Intel Payload (JSON)</label>
          <textarea
            className="form-textarea"
            value={payloadJson}
            onChange={(e) => setPayloadJson(e.target.value)}
            placeholder={`{"type": ${intelType}, "systemId": "30004759", ...}`}
            required
          />
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

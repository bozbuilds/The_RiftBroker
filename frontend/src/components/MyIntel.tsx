import { useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { DECRYPT_STATUS_LABELS, INTEL_TYPE_LABEL_MAP } from '../lib/constants'
import { EMPTY_SYSTEM_MAP, EMPTY_REGION_COUNTS } from '../lib/empty-maps'
import { isExpired, mistToSui, truncateAddress } from '../lib/format'
import { obfuscatedLocation } from '../lib/galaxy-data'
import { buildBurnReceiptTx } from '../lib/transactions'
import { useDecrypt } from '../hooks/useDecrypt'
import { useReceipts } from '../hooks/useReceipts'
import { useGalaxyData } from '../providers/GalaxyDataProvider'
import { IntelViewer } from './IntelViewer'
import type { EnrichedReceipt } from '../lib/types'
import type { IntelPayload } from '../lib/intel-schemas'

export function MyIntel() {
  const { data: receiptData, isLoading, error } = useReceipts()
  const { status: decryptStatus, error: decryptError, decrypt } = useDecrypt()
  const galaxy = useGalaxyData()
  const suiClient = useSuiClient()
  const queryClient = useQueryClient()
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction()
  const [activeReceipt, setActiveReceipt] = useState<string | null>(null)
  const [decryptedPayload, setDecryptedPayload] = useState<IntelPayload | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { active, expired } = useMemo(() => {
    if (!receiptData?.receipts.length) return { active: [], expired: [] }
    const a: EnrichedReceipt[] = []
    const e: EnrichedReceipt[] = []
    for (const r of receiptData.receipts)
      (isExpired(r.listing) ? e : a).push(r)
    return { active: a, expired: e }
  }, [receiptData?.receipts])

  if (isLoading) return <p className="loading-text"><span className="loading-spinner" />Loading your intel...</p>
  if (error) return <div className="status-message status-error">Error: {error.message}</div>
  if (!receiptData?.receipts.length) return <p className="empty-state">No purchased intel yet.</p>

  async function handleDecrypt(receiptId: string, listingId: string, walrusBlobId: Uint8Array) {
    setActiveReceipt(receiptId)
    setDecryptedPayload(null)
    try {
      const payload = await decrypt({ walrusBlobId, receiptId, listingId })
      if (payload) setDecryptedPayload(payload)
    } catch {
      // Error state managed by useDecrypt
    }
  }

  async function handleDelete(receiptId: string) {
    setDeletingId(receiptId)
    try {
      const tx = buildBurnReceiptTx(receiptId)
      const result = await signAndExecute({ transaction: tx })
      await suiClient.waitForTransaction({ digest: result.digest })
      await queryClient.invalidateQueries({ queryKey: ['receipts'] })
    } catch {
      // Transaction rejected or failed — reset state
    } finally {
      setDeletingId(null)
    }
  }

  function clearActive() {
    setActiveReceipt(null)
    setDecryptedPayload(null)
  }

  function renderItem({ receipt, listing }: EnrichedReceipt, isItemExpired: boolean) {
    const isActive = activeReceipt === receipt.id
    const isDeleting = deletingId === receipt.id
    const paidDate = new Date(Number(receipt.paidAt)).toLocaleDateString()

    return (
      <li key={receipt.id} className={`listing-item${isItemExpired ? ' listing-item-expired' : ' listing-item-owned'}`}>
        <div>
          <span className="listing-item-type">
            {INTEL_TYPE_LABEL_MAP[listing.intelType] ?? 'Unknown'}
          </span>
          {isItemExpired && <span className="listing-expired-badge">Expired</span>}
          <span className="listing-item-meta">
            {' '}— {obfuscatedLocation(listing.systemId, galaxy?.systemMap ?? EMPTY_SYSTEM_MAP, galaxy?.regionSystemCounts ?? EMPTY_REGION_COUNTS)} | {truncateAddress(listing.scout)}
          </span>
        </div>
        <div>
          <div className="listing-item-price">
            {listing.individualPrice.toString()} MIST
            {mistToSui(listing.individualPrice.toString()) && (
              <span className="deposit-badge"> ({mistToSui(listing.individualPrice.toString())} SUI)</span>
            )}
          </div>
          <div className="listing-item-time">Purchased {paidDate}</div>
        </div>

        {isItemExpired && !isDeleting && (
          <button
            className="btn-danger listing-item-expand"
            onClick={() => handleDelete(receipt.id)}
          >
            Delete
          </button>
        )}

        {isDeleting && (
          <div className="listing-item-expand status-message">
            <span className="loading-spinner" />Deleting...
          </div>
        )}

        {!isItemExpired && !isActive && (
          <button
            className="btn-primary listing-item-expand"
            onClick={() => handleDecrypt(receipt.id, listing.id, listing.walrusBlobId)}
          >
            Decrypt
          </button>
        )}

        {!isItemExpired && isActive && !decryptedPayload && (
          <div className="listing-item-expand">
            {(decryptStatus === 'idle' || decryptStatus === 'error') ? (
              <div className="purchase-actions">
                <button className="btn-primary" onClick={() => handleDecrypt(receipt.id, listing.id, listing.walrusBlobId)}>
                  Retry Decrypt
                </button>
                <button className="btn-secondary" onClick={clearActive}>
                  Cancel
                </button>
                {decryptError && !isDeleting && (
                  <button className="btn-danger" onClick={() => handleDelete(receipt.id)}>
                    Delete
                  </button>
                )}
              </div>
            ) : (
              <div className="status-message">
                <span className="loading-spinner" />
                {DECRYPT_STATUS_LABELS[decryptStatus] ?? 'Processing...'}
              </div>
            )}
            {decryptError && (
              <div className="status-message status-error">{decryptError}</div>
            )}
          </div>
        )}

        {!isItemExpired && isActive && decryptedPayload && (
          <div className="intel-panel listing-item-expand">
            <h3>Decrypted Intel</h3>
            <IntelViewer payload={decryptedPayload} />
            <button className="btn-secondary" onClick={clearActive}>
              Close
            </button>
          </div>
        )}
      </li>
    )
  }

  return (
    <section>
      {active.length > 0 && (
        <ul className="listing-list">
          {active.map((r) => renderItem(r, false))}
        </ul>
      )}

      {expired.length > 0 && (
        <>
          <h3 className="section-divider">Expired ({expired.length})</h3>
          <ul className="listing-list">
            {expired.map((r) => renderItem(r, true))}
          </ul>
        </>
      )}
    </section>
  )
}

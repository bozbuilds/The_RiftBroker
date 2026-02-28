import { useState } from 'react'

import { DECRYPT_STATUS_LABELS, INTEL_TYPE_LABEL_MAP } from '../lib/constants'
import { mistToSui, truncateAddress } from '../lib/format'
import { obfuscatedLocation } from '../lib/systems'
import { useDecrypt } from '../hooks/useDecrypt'
import { useReceipts } from '../hooks/useReceipts'
import { IntelViewer } from './IntelViewer'
import type { IntelPayload } from '../lib/intel-schemas'

export function MyIntel() {
  const { data: receiptData, isLoading, error } = useReceipts()
  const { status: decryptStatus, error: decryptError, decrypt } = useDecrypt()
  const [activeReceipt, setActiveReceipt] = useState<string | null>(null)
  const [decryptedPayload, setDecryptedPayload] = useState<IntelPayload | null>(null)

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

  function clearActive() {
    setActiveReceipt(null)
    setDecryptedPayload(null)
  }

  return (
    <section>
      <h2>My Intel</h2>

      <ul className="listing-list">
        {receiptData.receipts.map(({ receipt, listing }) => {
          const isActive = activeReceipt === receipt.id
          const paidDate = new Date(Number(receipt.paidAt)).toLocaleDateString()

          return (
            <li key={receipt.id} className="listing-item listing-item-owned">
              <div>
                <span className="listing-item-type">
                  {INTEL_TYPE_LABEL_MAP[listing.intelType] ?? 'Unknown'}
                </span>
                <span className="listing-item-meta">
                  {' '}— {obfuscatedLocation(listing.systemId)} | {truncateAddress(listing.scout)}
                </span>
              </div>
              <div>
                <div className="listing-item-price">
                  {listing.individualPrice.toString()} MIST
                  {mistToSui(listing.individualPrice.toString()) && (
                    <span className="deposit-badge"> ({mistToSui(listing.individualPrice.toString())} SUI)</span>
                  )}
                </div>
                {listing.stakeValue > 0n && (
                  <div className="deposit-badge">Deposit: {mistToSui(listing.stakeValue.toString()) ?? listing.stakeValue.toString()} SUI</div>
                )}
                <div className="listing-item-time">Purchased {paidDate}</div>
              </div>

              {!isActive && (
                <button
                  className="btn-primary listing-item-expand"
                  onClick={() => handleDecrypt(receipt.id, listing.id, listing.walrusBlobId)}
                >
                  Decrypt
                </button>
              )}

              {isActive && !decryptedPayload && (
                <div className="listing-item-expand">
                  {(decryptStatus === 'idle' || decryptStatus === 'error') ? (
                    <div className="purchase-actions">
                      <button className="btn-primary" onClick={() => handleDecrypt(receipt.id, listing.id, listing.walrusBlobId)}>
                        Retry Decrypt
                      </button>
                      <button className="btn-secondary" onClick={clearActive}>
                        Cancel
                      </button>
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

              {isActive && decryptedPayload && (
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
        })}
      </ul>
    </section>
  )
}

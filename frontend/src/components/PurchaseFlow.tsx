import { useCurrentAccount } from '@mysten/dapp-kit'
import { useState } from 'react'

import type { IntelListingFields } from '../lib/types'
import { usePurchase } from '../hooks/usePurchase'

export function PurchaseFlow({
  listing,
  onPurchased,
  onClose,
}: {
  listing: IntelListingFields
  onPurchased: (listing: IntelListingFields) => void
  onClose: () => void
}) {
  const account = useCurrentAccount()
  const { purchase, isPurchasing } = usePurchase()
  const [error, setError] = useState<string | null>(null)

  if (!account) return <p className="connect-prompt">Connect wallet to purchase.</p>

  async function handlePurchase() {
    setError(null)
    try {
      await purchase(listing.id, listing.individualPrice)
      onPurchased(listing)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase failed')
    }
  }

  return (
    <div className="purchase-panel">
      <h3>Purchase Intel</h3>
      <div className="purchase-details">
        <p>System: {listing.systemId.toString()}</p>
        <p>Price: <strong>{listing.individualPrice.toString()} MIST</strong></p>
        <p>Scout: {listing.scout}</p>
      </div>

      <div className="purchase-actions">
        <button className="btn-primary" onClick={handlePurchase} disabled={isPurchasing}>
          {isPurchasing ? (
            <><span className="loading-spinner" />Processing...</>
          ) : (
            'Confirm Purchase'
          )}
        </button>
        <button className="btn-secondary" onClick={onClose} disabled={isPurchasing}>
          Cancel
        </button>
      </div>

      {error && <div className="status-message status-error">{error}</div>}
    </div>
  )
}

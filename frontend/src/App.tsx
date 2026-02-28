import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit'
import { useState } from 'react'

import { HeatMap } from './components/heat-map/HeatMap'
import { HeatMapControls } from './components/heat-map/HeatMapControls'
import { CreateListing } from './components/CreateListing'
import { IntelViewer } from './components/IntelViewer'
import { ListingBrowser } from './components/ListingBrowser'
import { MyIntel } from './components/MyIntel'
import { PurchaseFlow } from './components/PurchaseFlow'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useHeatMapData } from './hooks/useHeatMapData'
import { useDecrypt } from './hooks/useDecrypt'
import { useReceipts } from './hooks/useReceipts'
import { DECRYPT_STATUS_LABELS } from './lib/constants'
import type { IntelPayload } from './lib/intel-schemas'
import { DEMO_SYSTEMS } from './lib/systems'
import type { IntelListingFields } from './lib/types'

type View = 'map' | 'browse' | 'my-intel' | 'create'

export function App() {
  const account = useCurrentAccount()
  const [view, setView] = useState<View>('map')
  const [selectedListing, setSelectedListing] = useState<IntelListingFields | null>(null)
  const [receiptId, setReceiptId] = useState<string | null>(null)
  const [decryptedPayload, setDecryptedPayload] = useState<IntelPayload | null>(null)
  const heatMap = useHeatMapData()
  const { data: receiptData } = useReceipts()
  const { status: decryptStatus, error: decryptError, decrypt } = useDecrypt()

  function selectListing(listing: IntelListingFields) {
    setSelectedListing(listing)
    setReceiptId(null)
    setDecryptedPayload(null)
  }

  function clearSelection() {
    setSelectedListing(null)
    setReceiptId(null)
    setDecryptedPayload(null)
  }

  function handlePurchased(_listing: IntelListingFields, rid: string) {
    setReceiptId(rid)
  }

  // Check if user already owns a receipt for the selected listing
  const existingReceiptId = selectedListing
    ? receiptData?.byListingId.get(selectedListing.id) ?? null
    : null
  const effectiveReceiptId = receiptId ?? existingReceiptId

  async function handleDecrypt() {
    if (!selectedListing || !effectiveReceiptId) return
    try {
      const payload = await decrypt({
        walrusBlobId: selectedListing.walrusBlobId,
        receiptId: effectiveReceiptId,
        listingId: selectedListing.id,
      })
      if (payload) setDecryptedPayload(payload)
    } catch {
      // Error state is managed by useDecrypt
    }
  }

  const purchaseOrDecryptPanel = selectedListing && (
    <>
      {!effectiveReceiptId && !decryptedPayload && (
        <PurchaseFlow
          listing={selectedListing}
          onPurchased={handlePurchased}
          onClose={clearSelection}
        />
      )}

      {effectiveReceiptId && !decryptedPayload && (
        <div className="purchase-panel">
          <h3>{existingReceiptId && !receiptId ? 'Already Purchased' : 'Purchase Successful'}</h3>
          <p>{existingReceiptId && !receiptId ? 'You own a receipt for this intel.' : 'Receipt minted to your wallet.'}</p>

          {(decryptStatus === 'idle' || decryptStatus === 'error') ? (
            <div className="purchase-actions">
              <button className="btn-primary" onClick={handleDecrypt}>
                Decrypt Intel
              </button>
              <button className="btn-secondary" onClick={clearSelection}>
                Done
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

      {decryptedPayload && (
        <div className="intel-panel">
          <h3>Decrypted Intel</h3>
          <IntelViewer payload={decryptedPayload} />
          <button className="btn-secondary" onClick={clearSelection}>
            Close
          </button>
        </div>
      )}
    </>
  )

  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="app-title">The Dark Net</h1>
        <ConnectButton />
      </header>

      {!account ? (
        <p className="connect-prompt">Connect your wallet to browse intel.</p>
      ) : (
        <>
          <nav className="app-nav">
            {(['map', 'browse', 'my-intel', 'create'] as const).map((v) => (
              <button
                key={v}
                className={`nav-btn${view === v ? ' active' : ''}`}
                onClick={() => { setView(v); clearSelection() }}
              >
                {v === 'map' ? 'Heat Map' : v === 'browse' ? 'Browse' : v === 'my-intel' ? 'My Intel' : 'Create'}
              </button>
            ))}
          </nav>

          {view === 'map' && (
            <ErrorBoundary>
              <HeatMapControls
                filters={heatMap.filters}
                onFilterChange={heatMap.setFilters}
                totalSystems={DEMO_SYSTEMS.length}
                activeSystems={heatMap.allSystems.length}
              />
              <HeatMap
                systems={heatMap.systems}
                onSelectListing={selectListing}
              />
              {purchaseOrDecryptPanel}
            </ErrorBoundary>
          )}

          {view === 'my-intel' && (
            <ErrorBoundary>
              <MyIntel />
            </ErrorBoundary>
          )}

          {view === 'create' && (
            <ErrorBoundary>
              <CreateListing />
            </ErrorBoundary>
          )}

          {view === 'browse' && (
            <ErrorBoundary>
              <ListingBrowser onSelect={selectListing} />
              {purchaseOrDecryptPanel}
            </ErrorBoundary>
          )}
        </>
      )}
    </div>
  )
}

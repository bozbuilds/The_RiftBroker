import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit'
import { useState } from 'react'

import { HeatMap } from './components/heat-map/HeatMap'
import { HeatMapControls } from './components/heat-map/HeatMapControls'
import { CreateListing } from './components/CreateListing'
import { IntelViewer } from './components/IntelViewer'
import { ListingBrowser } from './components/ListingBrowser'
import { PurchaseFlow } from './components/PurchaseFlow'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useHeatMapData } from './hooks/useHeatMapData'
import type { IntelPayload } from './lib/intel-schemas'
import { DEMO_SYSTEMS } from './lib/systems'
import type { IntelListingFields } from './lib/types'

type View = 'map' | 'browse' | 'create'

export function App() {
  const account = useCurrentAccount()
  const [view, setView] = useState<View>('map')
  const [selectedListing, setSelectedListing] = useState<IntelListingFields | null>(null)
  const [purchased, setPurchased] = useState(false)
  const [decryptedPayload, setDecryptedPayload] = useState<IntelPayload | null>(null)
  const heatMap = useHeatMapData()

  function clearSelection() {
    setSelectedListing(null)
    setPurchased(false)
    setDecryptedPayload(null)
  }

  function handlePurchased() {
    setPurchased(true)
  }

  const purchaseOrDecryptPanel = selectedListing && (
    <>
      {!purchased && !decryptedPayload && (
        <PurchaseFlow
          listing={selectedListing}
          onPurchased={handlePurchased}
          onClose={clearSelection}
        />
      )}

      {purchased && !decryptedPayload && (
        <div className="status-message status-success" style={{ marginTop: '16px' }}>
          Purchase successful! Receipt minted to your wallet.
          Decryption will be available after Seal key servers are configured (Phase 4).
          <br />
          <button className="btn-secondary" onClick={clearSelection} style={{ marginTop: '8px' }}>
            Done
          </button>
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
            {(['map', 'browse', 'create'] as const).map((v) => (
              <button
                key={v}
                className={`nav-btn${view === v ? ' active' : ''}`}
                onClick={() => { setView(v); clearSelection() }}
              >
                {v === 'map' ? 'Heat Map' : v === 'browse' ? 'Browse' : 'Create'}
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
                onSelectListing={setSelectedListing}
              />
              {purchaseOrDecryptPanel}
            </ErrorBoundary>
          )}

          {view === 'create' && (
            <ErrorBoundary>
              <CreateListing />
            </ErrorBoundary>
          )}

          {view === 'browse' && (
            <ErrorBoundary>
              <ListingBrowser onSelect={setSelectedListing} />
              {purchaseOrDecryptPanel}
            </ErrorBoundary>
          )}
        </>
      )}
    </div>
  )
}

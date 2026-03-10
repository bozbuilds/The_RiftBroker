import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { HeatMap } from './components/heat-map/HeatMap'
import { HeatMapControls } from './components/heat-map/HeatMapControls'
import { CreateListing } from './components/CreateListing'
import { FloatingPanel } from './components/FloatingPanel'
import { IntelViewer } from './components/IntelViewer'
import { ListingBrowser } from './components/ListingBrowser'
import { MyIntel } from './components/MyIntel'
import { PurchaseFlow } from './components/PurchaseFlow'
import { RegionPanel } from './components/RegionPanel'
import { ErrorBoundary } from './components/ErrorBoundary'
import { StarMapScene } from './components/star-map'
import { useHeatMapData } from './hooks/useHeatMapData'
import { useDecrypt } from './hooks/useDecrypt'
import { useReceipts } from './hooks/useReceipts'
import { DECRYPT_STATUS_LABELS } from './lib/constants'
import type { IntelPayload } from './lib/intel-schemas'
import { aggregateByRegion } from './lib/region-data'
import { useGalaxyData } from './providers/GalaxyDataProvider'
import type { IntelListingFields } from './lib/types'

// Panel state machine — only one panel at a time
type PanelState =
  | { kind: 'none' }
  | { kind: 'region', regionName: string }
  | { kind: 'browse' }
  | { kind: 'create' }
  | { kind: 'my-intel' }

const NAV_ITEMS = [
  { kind: 'none' as const, label: 'Map' },
  { kind: 'browse' as const, label: 'Browse' },
  { kind: 'my-intel' as const, label: 'My Intel' },
  { kind: 'create' as const, label: 'Create' },
]

export function App() {
  const account = useCurrentAccount()
  const [panel, setPanel] = useState<PanelState>({ kind: 'none' })
  const [selectedListing, setSelectedListing] = useState<IntelListingFields | null>(null)
  const [receiptId, setReceiptId] = useState<string | null>(null)
  const [decryptedPayload, setDecryptedPayload] = useState<IntelPayload | null>(null)
  const heatMap = useHeatMapData()
  const { data: receiptData } = useReceipts()
  const { status: decryptStatus, error: decryptError, decrypt } = useDecrypt()
  const galaxy = useGalaxyData()

  // Aggregate system heat data into region-level data for the 3D scene
  // Uses real galaxy coordinates once loaded; no regions rendered while data is fetching
  const regionData = useMemo(
    () => aggregateByRegion(heatMap.allSystems, galaxy?.systems ?? []),
    [heatMap.allSystems, galaxy],
  )

  const closePanel = useCallback(() => {
    setPanel({ kind: 'none' })
    setSelectedListing(null)
    setReceiptId(null)
    setDecryptedPayload(null)
  }, [])

  // Escape key closes the active panel
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && panel.kind !== 'none') closePanel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [panel.kind, closePanel])

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

  function handleNavClick(kind: PanelState['kind']) {
    clearSelection()
    setPanel(kind === 'none' ? { kind: 'none' } : { kind } as PanelState)
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

  // Find region data for region panel
  const activeRegion = panel.kind === 'region'
    ? regionData.find((r) => r.regionName === panel.regionName)
    : null

  return (
    <div className="app-viewport">
      {/* Layer 0: 3D star map (persistent backdrop) */}
      <ErrorBoundary fallback={
        <div className="heatmap-fallback">
          <HeatMap systems={heatMap.systems} onSelectListing={selectListing} />
        </div>
      }>
        <StarMapScene
          systems={galaxy?.systems ?? []}
          regions={regionData}
          systemHeats={heatMap.systems}
          panelOpen={panel.kind !== 'none'}
          onRegionClick={(name) => {
            clearSelection()
            setPanel({ kind: 'region', regionName: name })
          }}
        />
      </ErrorBoundary>

      {/* Layer 1: HUD overlay (always visible) */}
      <div className="hud-overlay">
        <header className="hud-header">
          <h1 className="hud-title">Frontier Intel</h1>
          <ConnectButton />
        </header>

        {account && (
          <nav className="hud-nav">
            {NAV_ITEMS.map(({ kind, label }) => (
              <button
                key={kind}
                className={`nav-btn${panel.kind === kind ? ' active' : ''}`}
                onClick={() => handleNavClick(kind)}
              >
                {label}
              </button>
            ))}
          </nav>
        )}

        {/* Heat map controls — visible when map is active */}
        {account && panel.kind === 'none' && (
          <div className="hud-controls">
            <HeatMapControls
              filters={heatMap.filters}
              onFilterChange={heatMap.setFilters}
              totalSystems={galaxy?.systems.length ?? 0}
              activeSystems={heatMap.allSystems.length}
            />
          </div>
        )}

        {!account && (
          <div className="connect-prompt-overlay">
            <p className="connect-prompt">Connect your wallet to browse intel.</p>
          </div>
        )}
      </div>

      {/* Layer 2: Panel + backdrop (when panel is open) */}
      {account && panel.kind !== 'none' && (
        <>
          <div className="panel-backdrop" onClick={closePanel} />

          {panel.kind === 'region' && activeRegion && (
            <RegionPanel
              region={activeRegion}
              onSelectListing={selectListing}
              onClose={closePanel}
            />
          )}

          {panel.kind === 'browse' && (
            <FloatingPanel title="Intel Marketplace" onClose={closePanel} footer={purchaseOrDecryptPanel}>
              <ListingBrowser onSelect={selectListing} />
            </FloatingPanel>
          )}

          {panel.kind === 'create' && (
            <FloatingPanel title="Create Intel Listing" onClose={closePanel}>
              <CreateListing />
            </FloatingPanel>
          )}

          {panel.kind === 'my-intel' && (
            <FloatingPanel title="My Intel" onClose={closePanel}>
              <MyIntel />
            </FloatingPanel>
          )}

          {/* Purchase/decrypt overlay for region panel */}
          {panel.kind === 'region' && purchaseOrDecryptPanel}
        </>
      )}
    </div>
  )
}

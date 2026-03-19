// frontend/src/components/InfoModal.tsx
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'riftbroker-info-dismissed'

interface InfoModalProps {
  readonly open: boolean
  readonly onClose: () => void
}

export function InfoModal({ open, onClose }: InfoModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(() => !!localStorage.getItem(STORAGE_KEY))

  // Escape key closes modal
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // Focus trap: move focus into modal on open, restore to trigger on close
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement
    const modal = document.querySelector('.info-modal') as HTMLElement
    modal?.focus()
    return () => prev?.focus()
  }, [open])

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  function handleClose() {
    if (dontShowAgain) localStorage.setItem(STORAGE_KEY, '1')
    else localStorage.removeItem(STORAGE_KEY)
    onClose()
  }

  if (!open) return null

  return (
    <>
      <div className="panel-backdrop info-modal-backdrop" onClick={handleClose} />
      <div className="info-modal" role="dialog" aria-modal="true" aria-labelledby="info-modal-title" tabIndex={-1}>
        <div className="info-modal-header">
          <h2 id="info-modal-title" className="info-modal-title">The RiftBroker</h2>
          <button className="floating-panel-close" onClick={handleClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="info-modal-body">
          {/* Hero */}
          <section className="info-section info-hero">
            <p className="info-tagline">Encrypted intel. ZK-verified. Traded trustlessly.</p>
            <p className="info-description">
              An on-chain intelligence marketplace for EVE Frontier where scouts sell
              encrypted intel to buyers.
            </p>
          </section>

          {/* How It Works */}
          <section className="info-section">
            <h3 className="info-section-title">How It Works</h3>
            <div className="info-steps">
              <div className="info-step">
                <span className="info-step-label">Scout</span>
                <p>Encrypt intel with SUI Seal, store on Walrus, list on-chain with a confidence stake.</p>
              </div>
              <div className="info-step">
                <span className="info-step-label">Verify</span>
                <p>Optionally attach ZK proofs — cryptographic evidence of your system location and proximity to a target.</p>
              </div>
              <div className="info-step">
                <span className="info-step-label">Trade</span>
                <p>Buyers browse, pay to unlock Seal decryption, and receive the intel payload.</p>
              </div>
            </div>
          </section>

          {/* Live Features */}
          <section className="info-section">
            <h3 className="info-section-title">Live Features</h3>
            <ul className="info-features">
              <li>Encrypted intel marketplace (4 intel types: Resource, Fleet, Base, Route)</li>
              <li>ZK-verified listings with on-chain Groth16 proof verification</li>
              <li>Proximity-proven intel — scouts attach a ZK distance proof showing how close their system was to a target system</li>
              <li>Timestamp-bound freshness — verified intel decays from observation time, not listing time</li>
              <li>3D nebula heat map with region navigation</li>
              <li>Seal encryption + Walrus decentralized storage</li>
              <li>Purchase history with decrypt-on-demand</li>
            </ul>
          </section>

          {/* Coming Soon */}
          <section className="info-section">
            <h3 className="info-section-title">Coming Soon</h3>
            <dl className="info-roadmap">
              <dt>&ldquo;Full-Precision Proximity&rdquo;</dt>
              <dd>
                Proximity proofs today operate at <strong>solar system granularity</strong> using public star map coordinates.
                The intended design — proving exact distance to a specific structure or ship — requires per-object position data
                that CCP Games will expose as <strong>POD (Proof of Data)</strong> in a future update.
                The ZK circuit is already deployed; precision improves automatically once that data is available.
              </dd>

              <dt>&ldquo;Scout Reputation&rdquo;</dt>
              <dd>On-chain profiles tracking verified observations. Consistent accuracy builds trust; bad intel burns your record.</dd>

              <dt>&ldquo;Dispute Resolution&rdquo;</dt>
              <dd>Buyers can challenge intel accuracy. Stakes get slashed or returned based on outcome.</dd>

              <dt>&ldquo;Wallet-Free Onboarding&rdquo;</dt>
              <dd>zkLogin lets pilots sign in with Google or Twitch. No crypto wallet required to start browsing.</dd>

              <dt>&ldquo;Gasless Transactions&rdquo;</dt>
              <dd>Sponsored transactions remove gas fees for buyers. The marketplace covers the cost.</dd>
            </dl>
          </section>
        </div>

        {/* Footer */}
        <div className="info-modal-footer">
          <label className="info-dismiss-label">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
            />
            {' Don\'t show this again'}
          </label>
          <button className="btn-primary" onClick={handleClose}>
            Got It
          </button>
        </div>
      </div>
    </>
  )
}

export { STORAGE_KEY }

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
                <p>Prove presence using on-chain SUI events — your jump history and gate coordinates become ZK proof inputs, verified on-chain via Groth16.</p>
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
              <li>Proximity-proven intel — ZK distance proof from scout's entry gate to a specific target assembly, with per-object precision from on-chain coordinates</li>
              <li>On-chain verified intel — presence proofs backed by SUI blockchain events, not self-signed data</li>
              <li>Stackable event badges — Combat Verified (kills), Activity Verified (deposits), Structure Verified (reveals), each backed by an on-chain tx digest</li>
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
              <dt>&ldquo;Player Proximity&rdquo;</dt>
              <dd>
                Prove distance to another player's ship. Requires CCP to emit player position events on-chain.
                The ZK circuit supports any coordinate source — only the data availability is missing.
              </dd>

              <dt>&ldquo;Resource Proximity&rdquo;</dt>
              <dd>
                Prove distance to rifts, asteroids, or other resources. Requires CCP to publish resource locations on-chain or via PODs.
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

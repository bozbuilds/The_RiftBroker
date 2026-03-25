import { useScoutProfile } from '../hooks/useScoutProfile'
import { getVerifiedClaims, reputationTier, totalVerified, verificationRate } from '../lib/scout-profile'
import { truncateAddress } from '../lib/format'

interface ScoutProfilePanelProps {
  readonly scoutAddress: string
  readonly onClose: () => void
}

export function ScoutProfilePanel({ scoutAddress, onClose }: ScoutProfilePanelProps) {
  const { data: profile, isLoading } = useScoutProfile(scoutAddress)

  if (isLoading) {
    return (
      <section className="scout-profile-panel">
        <p className="loading-text">
          <span className="loading-spinner" />
          Loading profile...
        </p>
      </section>
    )
  }

  if (!profile) {
    return (
      <section className="scout-profile-panel scout-profile-panel--empty">
        <p className="empty-state">No reputation data for this scout.</p>
        <button type="button" className="btn-secondary" onClick={onClose}>Back</button>
      </section>
    )
  }

  const verified = totalVerified(profile)
  const rate = verificationRate(profile)
  const tier = reputationTier(profile)

  const rows = [
    { label: 'Combat Verified', count: profile.totalCombatVerified },
    { label: 'Presence Verified', count: profile.totalPresenceVerified },
    { label: 'Activity Verified', count: profile.totalActivityVerified },
    { label: 'Structure Verified', count: profile.totalStructureVerified },
    { label: 'ZK-Verified', count: profile.totalZkVerified },
    { label: 'Unverified', count: profile.totalUnverified },
  ]

  return (
    <section className="scout-profile-panel">
      <div className="scout-profile-panel-header">
        <h3>{truncateAddress(scoutAddress)}</h3>
        {tier && <span className={`scout-tier scout-tier-${tier}`}>{tier}</span>}
      </div>
      <div className="scout-stats">
        <span>{verified.toString()} verified</span>
        <span>{(rate * 100).toFixed(0)}% rate</span>
      </div>
      <ul className="scout-badge-breakdown">
        {rows.filter(r => r.count > 0n).map(({ label, count }) => (
          <li key={label}><strong>{count.toString()}</strong> {label}</li>
        ))}
      </ul>
      {(() => {
        const claims = getVerifiedClaims(profile)
        if (claims.length === 0) return null
        return (
          <div className="scout-proven-claims">
            <h4>ZK-proven claims</h4>
            <ul className="scout-proven-claims-list">
              {claims.map(({ label, count }) => (
                <li key={`claim-${label}`}>
                  <strong>{count.toString()}+</strong> {label} (ZK-proven)
                </li>
              ))}
            </ul>
          </div>
        )
      })()}
      <button type="button" className="btn-secondary scout-profile-back" onClick={onClose}>Back to listings</button>
    </section>
  )
}

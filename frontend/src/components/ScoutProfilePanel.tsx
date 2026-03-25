import { useMemo } from 'react'

import { useScoutProfile } from '../hooks/useScoutProfile'
import { useListings } from '../hooks/useListings'
import { getBadges } from '../lib/badge-verify'
import { getVerifiedClaims, reputationTier, totalVerified } from '../lib/scout-profile'
import { truncateAddress } from '../lib/format'

interface ScoutProfilePanelProps {
  readonly scoutAddress: string
  readonly onClose: () => void
}

export function ScoutProfilePanel({ scoutAddress, onClose }: ScoutProfilePanelProps) {
  const { data: profile, isLoading } = useScoutProfile(scoutAddress)
  const { data: listings } = useListings()

  // Compute verification rate from actual listing data (not counters)
  const listingRate = useMemo(() => {
    if (!listings) return 0
    const scoutListings = listings.filter(l => l.scout === scoutAddress)
    if (scoutListings.length === 0) return 0
    const verified = scoutListings.filter(l => l.isVerified || getBadges(l).length > 0).length
    return verified / scoutListings.length
  }, [listings, scoutAddress])

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
  const tier = reputationTier(profile)

  const rows = [
    { label: 'Combat Verified', count: profile.totalCombatVerified },
    { label: 'Presence Verified', count: profile.totalPresenceVerified },
    { label: 'Activity Verified', count: profile.totalActivityVerified },
    { label: 'Structure Verified', count: profile.totalStructureVerified },
    { label: 'ZK-Verified', count: profile.totalZkVerified },
  ]

  return (
    <section className="scout-profile-panel">
      <div className="scout-profile-panel-header">
        <h3>{truncateAddress(scoutAddress)}</h3>
        {tier && <span className={`scout-tier scout-tier-${tier}`}>{tier}</span>}
      </div>
      <div className="scout-stats">
        <span>{verified.toString()} verified</span>
        <span>{(listingRate * 100).toFixed(0)}% rate</span>
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

import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { INTEL_TYPE_LABEL_MAP } from '../lib/constants'
import { EMPTY_SYSTEM_MAP, EMPTY_REGION_COUNTS } from '../lib/empty-maps'
import { isExpired, mistToSui, observedAgo, timeRemaining } from '../lib/format'
import { obfuscatedLocation } from '../lib/galaxy-data'
import { getBadges, MAX_INLINE_BADGES } from '../lib/badge-verify'
import { buildClaimExpiredStakeTx, buildDelistTx } from '../lib/transactions'
import { useListings } from '../hooks/useListings'
import { useGalaxyData } from '../providers/GalaxyDataProvider'
import type { IntelListingFields } from '../lib/types'

export function MyListings() {
  const account = useCurrentAccount()
  const { data: listings, isLoading, error } = useListings()
  const galaxy = useGalaxyData()
  const suiClient = useSuiClient()
  const queryClient = useQueryClient()
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const systemMap = galaxy?.systemMap ?? EMPTY_SYSTEM_MAP
  const regionCounts = galaxy?.regionSystemCounts ?? EMPTY_REGION_COUNTS

  const { active, expired, delisted } = useMemo(() => {
    if (!listings || !account) return { active: [], expired: [], delisted: [] }
    const mine = listings.filter((l) => l.scout === account.address)
    const a: IntelListingFields[] = []
    const e: IntelListingFields[] = []
    const d: IntelListingFields[] = []
    for (const l of mine) {
      if (l.delisted) d.push(l)
      else if (isExpired(l)) e.push(l)
      else a.push(l)
    }
    return { active: a, expired: e, delisted: d }
  }, [listings, account])

  async function handleDelist(listingId: string) {
    setPendingId(listingId)
    try {
      const tx = buildDelistTx(listingId)
      const result = await signAndExecute({ transaction: tx })
      await suiClient.waitForTransaction({ digest: result.digest })
      await queryClient.invalidateQueries({ queryKey: ['listings'] })
    } catch {
      // Transaction rejected or failed
    } finally {
      setPendingId(null)
    }
  }

  async function handleClaimStake(listingId: string) {
    setPendingId(listingId)
    try {
      const tx = buildClaimExpiredStakeTx(listingId)
      const result = await signAndExecute({ transaction: tx })
      await suiClient.waitForTransaction({ digest: result.digest })
      await queryClient.invalidateQueries({ queryKey: ['listings'] })
    } catch {
      // Transaction rejected or failed
    } finally {
      setPendingId(null)
    }
  }

  if (isLoading) return <p className="loading-text"><span className="loading-spinner" />Loading your listings...</p>
  if (error) return <div className="status-message status-error">Error: {error.message}</div>

  const total = active.length + expired.length + delisted.length
  if (!total) return <p className="empty-state">You haven't created any listings yet.</p>

  function renderListing(listing: IntelListingFields) {
    const isPending = pendingId === listing.id
    const listingExpired = isExpired(listing)
    const hasStake = listing.stakeValue > 0n
    const ago = observedAgo(listing)

    return (
      <li
        key={listing.id}
        className={`listing-item${listing.delisted ? ' listing-item-expired' : listingExpired ? ' listing-item-expired' : ' listing-item-owned'}`}
      >
        <div>
          <span className="listing-item-type">
            {INTEL_TYPE_LABEL_MAP[listing.intelType] ?? 'Unknown'}
          </span>
          {(() => {
            const badges = getBadges(listing)
            const visible = badges.slice(0, MAX_INLINE_BADGES)
            const overflow = badges.length - visible.length
            return (
              <>
                {visible.map(b => (
                  <span key={b.type} className={b.className}>{b.label}</span>
                ))}
                {overflow > 0 && (
                  <span className="listing-verified-badge" title={badges.map(b => b.label).join(', ')}>
                    +{overflow} more
                  </span>
                )}
              </>
            )
          })()}
          {ago && (
            <span className="listing-observed-badge">{ago}</span>
          )}
          {listing.delisted && <span className="listing-expired-badge">Delisted</span>}
          {!listing.delisted && listingExpired && <span className="listing-expired-badge">Expired</span>}
          <span className="listing-item-meta">
            {' '}&mdash; {obfuscatedLocation(listing.systemId, systemMap, regionCounts)}
          </span>
        </div>
        <div>
          <div className="listing-item-price">
            {listing.individualPrice.toString()} MIST
            {mistToSui(listing.individualPrice.toString()) && (
              <span className="deposit-badge"> ({mistToSui(listing.individualPrice.toString())} SUI)</span>
            )}
          </div>
          {hasStake && (
            <div className="deposit-badge">
              Stake: {mistToSui(listing.stakeValue.toString()) ?? listing.stakeValue.toString()} SUI
            </div>
          )}
          <div className="listing-item-time">
            {listing.delisted ? 'Stake reclaimed' : timeRemaining(listing)}
          </div>
        </div>

        {/* Active listing: scout can delist to reclaim stake */}
        {!listing.delisted && !listingExpired && !isPending && (
          <button
            className="btn-danger listing-item-expand"
            onClick={() => handleDelist(listing.id)}
          >
            Delist & Reclaim Stake
          </button>
        )}

        {/* Expired listing with unclaimed stake: prominent reclaim button */}
        {!listing.delisted && listingExpired && hasStake && !isPending && (
          <button
            className="btn-primary listing-item-expand"
            onClick={() => handleClaimStake(listing.id)}
          >
            Reclaim Stake
          </button>
        )}

        {isPending && (
          <div className="listing-item-expand status-message">
            <span className="loading-spinner" />Processing...
          </div>
        )}
      </li>
    )
  }

  return (
    <section>
      {expired.length > 0 && (() => {
        const withStake = expired.filter((l) => l.stakeValue > 0n)
        return (
          <>
            {withStake.length > 0 && (
              <div className="status-message" style={{ marginBottom: '0.75rem' }}>
                You have {withStake.length} expired listing{withStake.length > 1 ? 's' : ''} with unclaimed stake. Reclaim your deposit below.
              </div>
            )}
            <h3 className="section-divider">Expired ({expired.length})</h3>
            <ul className="listing-list">
              {expired.map(renderListing)}
            </ul>
          </>
        )
      })()}

      {active.length > 0 && (
        <>
          <h3 className="section-divider">Active ({active.length})</h3>
          <ul className="listing-list">
            {active.map(renderListing)}
          </ul>
        </>
      )}

      {delisted.length > 0 && (
        <>
          <h3 className="section-divider">Delisted ({delisted.length})</h3>
          <ul className="listing-list">
            {delisted.map(renderListing)}
          </ul>
        </>
      )}
    </section>
  )
}

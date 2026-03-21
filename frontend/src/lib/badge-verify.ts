import type { IntelListingFields } from './types'

export interface Badge {
  readonly type: string
  readonly label: string
  readonly className: string
}

/** Trust order: highest first. Used for collapse display. */
export const BADGE_TRUST_ORDER = ['combat', 'presence', 'activity', 'discovery', 'zk-verified'] as const

const BADGE_DEFS: Record<string, { label: string; className: string }> = {
  combat: { label: 'Combat Verified', className: 'listing-combat-badge' },
  presence: { label: 'Presence Verified', className: 'listing-presence-badge' },
  activity: { label: 'Activity Verified', className: 'listing-activity-badge' },
  discovery: { label: 'Structure Discovery', className: 'listing-discovery-badge' },
  'zk-verified': { label: 'ZK-Verified', className: 'listing-verified-badge' },
}

/**
 * Determine which badges a listing should display.
 * Returns badges sorted by trust order (highest first).
 * ZK-Verified is only shown when no event badges are present.
 */
export function getBadges(listing: IntelListingFields): Badge[] {
  const badges: Badge[] = []

  if (listing.killmailTxDigest.length > 0)
    badges.push({ type: 'combat', ...BADGE_DEFS.combat })
  if (listing.jumpTxDigest.length > 0)
    badges.push({ type: 'presence', ...BADGE_DEFS.presence })
  if (listing.depositTxDigest.length > 0)
    badges.push({ type: 'activity', ...BADGE_DEFS.activity })
  if (listing.revealTxDigest.length > 0)
    badges.push({ type: 'discovery', ...BADGE_DEFS.discovery })

  // ZK-Verified fallback: only when no event badges and location proof exists
  if (badges.length === 0 && listing.isVerified)
    badges.push({ type: 'zk-verified', ...BADGE_DEFS['zk-verified'] })

  // Sort by trust order
  badges.sort((a, b) =>
    BADGE_TRUST_ORDER.indexOf(a.type as typeof BADGE_TRUST_ORDER[number])
    - BADGE_TRUST_ORDER.indexOf(b.type as typeof BADGE_TRUST_ORDER[number])
  )

  return badges
}

/** Max badges to display inline. Beyond this, collapse with "+N". */
export const MAX_INLINE_BADGES = 2

import type { ScoutProfileFields } from './types'

function parseU8Vec(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  return raw.map((x) => (typeof x === 'number' ? x : Number(x)))
}

function parseU64Vec(raw: unknown): bigint[] {
  if (!Array.isArray(raw)) return []
  return raw.map((x) => BigInt(String(x)))
}

export function parseScoutProfile(
  scout: string,
  fields: Record<string, unknown>,
): ScoutProfileFields {
  const merkleRaw = fields.merkle_root as string | undefined
  const leafRaw = fields.leaf_count as string | undefined
  return {
    scout,
    totalZkVerified: BigInt(fields.total_zk_verified as string),
    totalPresenceVerified: BigInt(fields.total_presence_verified as string),
    totalCombatVerified: BigInt(fields.total_combat_verified as string),
    totalActivityVerified: BigInt(fields.total_activity_verified as string),
    totalStructureVerified: BigInt(fields.total_structure_verified as string),
    totalUnverified: BigInt(fields.total_unverified as string),
    firstVerifiedAt: BigInt(fields.first_verified_at as string),
    lastVerifiedAt: BigInt(fields.last_verified_at as string),
    merkleRoot: merkleRaw ?? '0',
    leafCount: leafRaw !== undefined ? BigInt(leafRaw) : 0n,
    reputationClaimTypes: parseU8Vec(fields.reputation_claim_types),
    reputationClaimCounts: parseU64Vec(fields.reputation_claim_counts),
  }
}

export function totalVerified(p: ScoutProfileFields): bigint {
  return p.totalZkVerified
    + p.totalPresenceVerified
    + p.totalCombatVerified
    + p.totalActivityVerified
    + p.totalStructureVerified
}

export function verificationRate(p: ScoutProfileFields): number {
  const verified = totalVerified(p)
  const total = verified + p.totalUnverified
  if (total === 0n) return 0
  return Number(verified) / Number(total)
}

export function reputationTier(p: ScoutProfileFields): 'bronze' | 'silver' | 'gold' | null {
  const v = totalVerified(p)
  if (v >= 100n) return 'gold'
  if (v >= 50n) return 'silver'
  if (v >= 10n) return 'bronze'
  return null
}

const BADGE_ORDER: { key: 'totalCombatVerified' | 'totalPresenceVerified' | 'totalActivityVerified' | 'totalStructureVerified' | 'totalZkVerified'; label: string }[] = [
  { key: 'totalCombatVerified', label: 'Combat' },
  { key: 'totalPresenceVerified', label: 'Presence' },
  { key: 'totalActivityVerified', label: 'Activity' },
  { key: 'totalStructureVerified', label: 'Structure' },
  { key: 'totalZkVerified', label: 'ZK-Verified' },
]

export function reputationSummary(p: ScoutProfileFields): string | null {
  for (const { key, label } of BADGE_ORDER) {
    const count = p[key] as bigint
    if (count > 0n) return `${count}× ${label}`
  }
  return null
}

const CLAIM_LABELS: Record<number, string> = {
  0: 'Combat',
  1: 'Activity',
  2: 'Structure',
  0xFD: 'Presence',
  0xFE: 'ZK-Verified',
}

export function getVerifiedClaims(
  p: ScoutProfileFields,
): { label: string; count: bigint }[] {
  return p.reputationClaimTypes
    .map((type, i) => ({
      label: CLAIM_LABELS[type] ?? `Type ${type}`,
      count: p.reputationClaimCounts[i] ?? 0n,
    }))
    .filter((c) => c.count > 0n)
}

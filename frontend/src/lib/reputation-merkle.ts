/**
 * Incremental Merkle tree (depth 10) matching on-chain `insert_leaf` / `compute_leaf_hash` (Phase 4a+ / 4b).
 * Precomputed zero hashes — same as `circuits/scripts/compute-zero-hashes.mjs` and `marketplace.move`.
 */
export const MERKLE_ZERO_HASHES: readonly bigint[] = [
  0n,
  14744269619966411208579211824598458697587494354926760081771325075741142829156n,
  7423237065226347324353380772367382631490014989348495481811164164159255474657n,
  11286972368698509976183087595462810875513684078608517520839298933882497716792n,
  3607627140608796879659380071776844901612302623152076817094415224584923813162n,
  19712377064642672829441595136074946683621277828620209496774504837737984048981n,
  20775607673010627194014556968476266066927294572720319469184847051418138353016n,
  3396914609616007258851405644437304192397291162432396347162513310381425243293n,
  21551820661461729022865262380882070649935529853313286572328683688269863701601n,
  6573136701248752079028194407151022595060682063033565181951145966236778420039n,
]

export const MERKLE_DEPTH = 10

export type ReputationLeafInput = {
  readonly systemId: bigint
  readonly intelType: number
  readonly badgeType: number
  readonly timestamp: bigint
}

export type ReputationMerkleBuildResult = {
  readonly merkleRoot: string
  /** `siblingPaths[i]` = 10 siblings (decimal strings) recorded when leaf `i` was inserted */
  readonly siblingPaths: string[][]
}

/**
 * Build root + per-leaf sibling paths using circomlibjs Poseidon (same as chain).
 */
export async function buildReputationMerkleState(
  leaves: readonly ReputationLeafInput[],
): Promise<ReputationMerkleBuildResult> {
  // @ts-expect-error circomlibjs has no bundled types
  const { buildPoseidon } = await import('circomlibjs')
  const poseidon = await buildPoseidon()
  const F = poseidon.F

  const p2 = (a: bigint, b: bigint): bigint =>
    BigInt(F.toObject(poseidon([F.e(a), F.e(b)])))
  const p4 = (a: bigint, b: bigint, c: bigint, d: bigint): bigint =>
    BigInt(F.toObject(poseidon([F.e(a), F.e(b), F.e(c), F.e(d)])))

  const frontier = Array.from({ length: MERKLE_DEPTH }, () => 0n)
  const siblingPaths: string[][] = []
  let merkleRoot = 0n

  for (let li = 0; li < leaves.length; li++) {
    const L = leaves[li]!
    const leafHash = p4(
      L.systemId,
      BigInt(L.intelType),
      BigInt(L.badgeType),
      L.timestamp,
    )
    const siblings: bigint[] = []
    const index = li
    let current = leafHash
    for (let level = 0; level < MERKLE_DEPTH; level++) {
      const z = MERKLE_ZERO_HASHES[level]!
      if (((index >> level) & 1) === 0) {
        siblings.push(z)
        frontier[level] = current
        current = p2(current, z)
      }
      else {
        siblings.push(frontier[level]!)
        current = p2(frontier[level]!, current)
      }
    }
    siblingPaths.push(siblings.map((s) => s.toString()))
    merkleRoot = current
  }

  return {
    merkleRoot: merkleRoot.toString(),
    siblingPaths,
  }
}

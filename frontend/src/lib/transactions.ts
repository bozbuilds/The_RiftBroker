import { Transaction } from '@mysten/sui/transactions'

import { CLOCK_ID, PACKAGE_ID } from './constants'

export function buildCreateListingTx(params: {
  intelType: number
  systemId: bigint
  price: bigint
  decayHours: bigint
  walrusBlobId: Uint8Array
  stakeAmount: bigint
}): Transaction {
  const tx = new Transaction()
  const [stakeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(params.stakeAmount)])
  tx.moveCall({
    target: `${PACKAGE_ID}::marketplace::create_listing`,
    arguments: [
      tx.pure.u8(params.intelType),
      tx.pure.u64(params.systemId),
      tx.pure.u64(params.price),
      tx.pure.u64(params.decayHours),
      tx.pure.vector('u8', Array.from(params.walrusBlobId)),
      stakeCoin,
      tx.object(CLOCK_ID),
    ],
  })
  return tx
}

export function buildSetBlobIdTx(
  listingId: string,
  walrusBlobId: Uint8Array,
): Transaction {
  const tx = new Transaction()
  tx.moveCall({
    target: `${PACKAGE_ID}::marketplace::set_walrus_blob_id`,
    arguments: [
      tx.object(listingId),
      tx.pure.vector('u8', Array.from(walrusBlobId)),
    ],
  })
  return tx
}

export function buildPurchaseTx(
  listingId: string,
  price: bigint,
): Transaction {
  const tx = new Transaction()
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(price)])
  tx.moveCall({
    target: `${PACKAGE_ID}::marketplace::purchase`,
    arguments: [
      tx.object(listingId),
      coin,
      tx.object(CLOCK_ID),
    ],
  })
  return tx
}

export function buildBurnReceiptTx(receiptId: string): Transaction {
  const tx = new Transaction()
  tx.moveCall({
    target: `${PACKAGE_ID}::marketplace::burn_receipt`,
    arguments: [tx.object(receiptId)],
  })
  return tx
}

export function buildCreateVerifiedListingTx(params: {
  intelType: number
  systemId: bigint
  individualPrice: bigint
  decayHours: bigint
  walrusBlobId: Uint8Array
  stakeAmount: bigint
  vkeyId: string
  proofPointsBytes: Uint8Array
  publicInputsBytes: Uint8Array
}): Transaction {
  const tx = new Transaction()
  const [stake] = tx.splitCoins(tx.gas, [tx.pure.u64(params.stakeAmount)])
  tx.moveCall({
    target: `${PACKAGE_ID}::marketplace::create_verified_listing`,
    arguments: [
      tx.pure.u8(params.intelType),
      tx.pure.u64(params.systemId),
      tx.pure.u64(params.individualPrice),
      tx.pure.u64(params.decayHours),
      tx.pure.vector('u8', Array.from(params.walrusBlobId)),
      stake,
      tx.object(params.vkeyId),
      tx.pure.vector('u8', Array.from(params.proofPointsBytes)),
      tx.pure.vector('u8', Array.from(params.publicInputsBytes)),
      tx.object(CLOCK_ID),
    ],
  })
  return tx
}

export function buildDelistTx(listingId: string): Transaction {
  const tx = new Transaction()
  tx.moveCall({
    target: `${PACKAGE_ID}::marketplace::delist`,
    arguments: [tx.object(listingId)],
  })
  return tx
}

export function buildClaimExpiredStakeTx(listingId: string): Transaction {
  const tx = new Transaction()
  tx.moveCall({
    target: `${PACKAGE_ID}::marketplace::claim_expired_stake`,
    arguments: [tx.object(listingId), tx.object(CLOCK_ID)],
  })
  return tx
}

export function buildBatchPurchaseTx(
  purchases: ReadonlyArray<{ listingId: string; price: bigint }>,
): Transaction {
  if (purchases.length === 0)
    throw new Error('Cannot create empty batch purchase')
  const tx = new Transaction()
  for (const { listingId, price } of purchases) {
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(price)])
    tx.moveCall({
      target: `${PACKAGE_ID}::marketplace::purchase`,
      arguments: [
        tx.object(listingId),
        coin,
        tx.object(CLOCK_ID),
      ],
    })
  }
  return tx
}

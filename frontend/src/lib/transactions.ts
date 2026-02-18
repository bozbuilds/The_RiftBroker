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

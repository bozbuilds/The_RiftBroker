import { describe, it, expect } from 'vitest'
import { Transaction } from '@mysten/sui/transactions'
import {
  buildCreateListingTx,
  buildSetBlobIdTx,
  buildPurchaseTx,
  buildBatchPurchaseTx,
} from './transactions'

describe('buildCreateListingTx', () => {
  it('returns a Transaction', () => {
    const tx = buildCreateListingTx({
      intelType: 0,
      systemId: 42n,
      price: 500_000n,
      decayHours: 24n,
      walrusBlobId: new Uint8Array([1, 2, 3]),
      stakeAmount: 1_000_000n,
    })
    expect(tx).toBeInstanceOf(Transaction)
  })
})

describe('buildSetBlobIdTx', () => {
  it('returns a Transaction', () => {
    const tx = buildSetBlobIdTx('0xabc', new Uint8Array([4, 5, 6]))
    expect(tx).toBeInstanceOf(Transaction)
  })
})

describe('buildPurchaseTx', () => {
  it('returns a Transaction', () => {
    const tx = buildPurchaseTx('0xabc', 500_000n)
    expect(tx).toBeInstanceOf(Transaction)
  })
})

describe('buildBatchPurchaseTx', () => {
  it('returns a Transaction for multiple purchases', () => {
    const tx = buildBatchPurchaseTx([
      { listingId: '0xabc', price: 500_000n },
      { listingId: '0xdef', price: 300_000n },
    ])
    expect(tx).toBeInstanceOf(Transaction)
  })

  it('handles single purchase', () => {
    const tx = buildBatchPurchaseTx([
      { listingId: '0xabc', price: 500_000n },
    ])
    expect(tx).toBeInstanceOf(Transaction)
  })

  it('throws on empty array', () => {
    expect(() => buildBatchPurchaseTx([])).toThrow('Cannot create empty batch purchase')
  })
})

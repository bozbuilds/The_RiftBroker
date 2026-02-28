import { useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { buildPurchaseTx, buildBatchPurchaseTx } from '../lib/transactions'

export function usePurchase() {
  const suiClient = useSuiClient()
  const queryClient = useQueryClient()
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction()
  const [isPurchasing, setIsPurchasing] = useState(false)

  const purchase = useCallback(async (listingId: string, price: bigint) => {
    setIsPurchasing(true)
    try {
      const tx = buildPurchaseTx(listingId, price)
      const result = await signAndExecute({ transaction: tx })

      // Wait for transaction to be indexed
      await suiClient.waitForTransaction({ digest: result.digest })

      // Extract PurchaseReceipt object ID from transaction
      const txDetails = await suiClient.getTransactionBlock({
        digest: result.digest,
        options: { showObjectChanges: true },
      })
      const receiptObj = txDetails.objectChanges?.find(
        (c) => c.type === 'created' && 'objectType' in c
          && (c.objectType as string).includes('PurchaseReceipt'),
      )
      const receiptId = receiptObj && 'objectId' in receiptObj
        ? (receiptObj as { objectId: string }).objectId
        : undefined

      // Invalidate listings + receipts cache so UI refreshes
      await queryClient.invalidateQueries({ queryKey: ['listings'] })
      await queryClient.invalidateQueries({ queryKey: ['receipts'] })

      return { digest: result.digest, receiptId }
    } finally {
      setIsPurchasing(false)
    }
  }, [signAndExecute, suiClient, queryClient])

  const batchPurchase = useCallback(async (
    purchases: ReadonlyArray<{ listingId: string; price: bigint }>,
  ) => {
    setIsPurchasing(true)
    try {
      const tx = buildBatchPurchaseTx(purchases)
      const result = await signAndExecute({ transaction: tx })
      await suiClient.waitForTransaction({ digest: result.digest })
      await queryClient.invalidateQueries({ queryKey: ['listings'] })
      await queryClient.invalidateQueries({ queryKey: ['receipts'] })
      return result
    } finally {
      setIsPurchasing(false)
    }
  }, [signAndExecute, suiClient, queryClient])

  return { purchase, batchPurchase, isPurchasing }
}

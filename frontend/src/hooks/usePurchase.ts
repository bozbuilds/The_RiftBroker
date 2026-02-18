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

      // Invalidate listings cache so UI refreshes
      await queryClient.invalidateQueries({ queryKey: ['listings'] })

      return result
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
      return result
    } finally {
      setIsPurchasing(false)
    }
  }, [signAndExecute, suiClient, queryClient])

  return { purchase, batchPurchase, isPurchasing }
}

import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit'
import { useQuery } from '@tanstack/react-query'

import { PACKAGE_ID } from '../lib/constants'
import { parseListingFields, parseReceiptFields } from '../lib/parse'
import type { EnrichedReceipt } from '../lib/types'

export function useReceipts() {
  const suiClient = useSuiClient()
  const account = useCurrentAccount()

  return useQuery({
    queryKey: ['receipts', account?.address],
    enabled: !!account,
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!account) return { receipts: [] as EnrichedReceipt[], byListingId: new Map<string, string>() }

      // 1. Paginate through owned PurchaseReceipt objects
      const allReceipts: { objectId: string; fields: Record<string, unknown> }[] = []
      let cursor: string | null | undefined = undefined

      do {
        const page = await suiClient.getOwnedObjects({
          owner: account.address,
          filter: { StructType: `${PACKAGE_ID}::marketplace::PurchaseReceipt` },
          options: { showContent: true },
          limit: 50,
          ...(cursor ? { cursor } : {}),
        })

        for (const obj of page.data) {
          if (obj.data?.content?.dataType === 'moveObject') {
            const content = obj.data.content as {
              dataType: 'moveObject'
              fields: Record<string, unknown>
            }
            allReceipts.push({ objectId: obj.data.objectId, fields: content.fields })
          }
        }

        cursor = page.hasNextPage ? page.nextCursor : null
      } while (cursor)

      if (allReceipts.length === 0)
        return { receipts: [] as EnrichedReceipt[], byListingId: new Map<string, string>() }

      // 2. Parse receipts
      const parsed = allReceipts.map((r) => parseReceiptFields(r.objectId, r.fields))

      // 3. Fetch listing objects for each receipt
      const listingIds = [...new Set(parsed.map((r) => r.listingId))]
      const listingObjects = await suiClient.multiGetObjects({
        ids: listingIds,
        options: { showContent: true },
      })

      const listingMap = new Map<string, ReturnType<typeof parseListingFields>>()
      for (const obj of listingObjects) {
        if (obj.data?.content?.dataType === 'moveObject') {
          const content = obj.data.content as {
            dataType: 'moveObject'
            fields: Record<string, unknown>
          }
          listingMap.set(obj.data.objectId, parseListingFields(obj.data.objectId, content.fields))
        }
      }

      // 4. Join receipts with listings, sorted by most recent purchase
      const receipts: EnrichedReceipt[] = parsed
        .filter((r) => listingMap.has(r.listingId))
        .map((r) => ({ receipt: r, listing: listingMap.get(r.listingId)! }))
        .sort((a, b) => Number(b.receipt.paidAt - a.receipt.paidAt))

      // 5. Build listing ID → receipt ID lookup
      const byListingId = new Map<string, string>()
      for (const r of parsed)
        byListingId.set(r.listingId, r.id)

      return { receipts, byListingId }
    },
  })
}

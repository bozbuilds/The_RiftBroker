import { useSuiClient } from '@mysten/dapp-kit'
import { useQuery } from '@tanstack/react-query'

import { PACKAGE_ID } from '../lib/constants'
import { parseListingFields } from '../lib/parse'

const MAX_EVENT_PAGES = 10

export function useListings() {
  const suiClient = useSuiClient()

  return useQuery({
    queryKey: ['listings'],
    queryFn: async () => {
      // Paginate through IntelListed events to discover all listing IDs
      const allListingIds: string[] = []
      let cursor: { txDigest: string; eventSeq: string } | null | undefined = undefined
      let pages = 0

      do {
        const { data: events, hasNextPage, nextCursor } = await suiClient.queryEvents({
          query: {
            MoveEventType: `${PACKAGE_ID}::marketplace::IntelListed`,
          },
          order: 'descending',
          limit: 50,
          ...(cursor ? { cursor } : {}),
        })

        for (const e of events) {
          allListingIds.push((e.parsedJson as { listing_id: string }).listing_id)
        }

        cursor = hasNextPage ? nextCursor : null
        pages++
      } while (cursor && pages < MAX_EVENT_PAGES)

      if (allListingIds.length === 0) return []

      // Deduplicate IDs (same listing can emit multiple events if re-listed logic changes)
      const uniqueIds = [...new Set(allListingIds)]

      // Fetch current state of each listing
      const objects = await suiClient.multiGetObjects({
        ids: uniqueIds,
        options: { showContent: true },
      })

      return objects
        .filter((o) => o.data?.content?.dataType === 'moveObject')
        .map((o) => {
          const content = o.data!.content as {
            dataType: 'moveObject'
            fields: Record<string, unknown>
          }
          return parseListingFields(o.data!.objectId, content.fields)
        })
    },
    refetchInterval: 10_000,
  })
}

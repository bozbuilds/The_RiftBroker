import { useSuiClient } from '@mysten/dapp-kit'
import { useQuery } from '@tanstack/react-query'

import { SCOUT_REGISTRY_ID } from '../lib/constants'
import { parseScoutProfile } from '../lib/scout-profile'
import type { ScoutProfileFields } from '../lib/types'

export function useScoutProfile(scoutAddress: string | null) {
  const suiClient = useSuiClient()
  return useQuery<ScoutProfileFields | null>({
    queryKey: ['scout-profile', scoutAddress],
    enabled: !!scoutAddress && !!SCOUT_REGISTRY_ID,
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!scoutAddress || !SCOUT_REGISTRY_ID) return null
      try {
        const result = await suiClient.getDynamicFieldObject({
          parentId: SCOUT_REGISTRY_ID,
          name: { type: 'address', value: scoutAddress },
        })
        if (!result.data?.content || result.data.content.dataType !== 'moveObject')
          return null
        const wrapper = result.data.content.fields as Record<string, unknown>
        const fields = (wrapper.value ?? wrapper) as Record<string, unknown>
        return parseScoutProfile(scoutAddress, fields)
      } catch {
        return null
      }
    },
  })
}

/** Batch-fetch profiles for a list of scout addresses. */
export function useScoutProfiles(scoutAddresses: string[]) {
  const suiClient = useSuiClient()
  const unique = [...new Set(scoutAddresses)]
  const sortedKey = unique.slice().sort().join(',')
  return useQuery<Map<string, ScoutProfileFields>>({
    queryKey: ['scout-profiles', sortedKey],
    enabled: sortedKey.length > 0 && !!SCOUT_REGISTRY_ID,
    refetchInterval: 15_000,
    queryFn: async () => {
      const map = new Map<string, ScoutProfileFields>()
      if (!SCOUT_REGISTRY_ID) return map
      await Promise.allSettled(
        unique.map(async (addr) => {
          const result = await suiClient.getDynamicFieldObject({
            parentId: SCOUT_REGISTRY_ID,
            name: { type: 'address', value: addr },
          })
          if (result.data?.content?.dataType === 'moveObject') {
            const wrapper = result.data.content.fields as Record<string, unknown>
            const fields = (wrapper.value ?? wrapper) as Record<string, unknown>
            map.set(addr, parseScoutProfile(addr, fields))
          }
        }),
      )
      return map
    },
  })
}

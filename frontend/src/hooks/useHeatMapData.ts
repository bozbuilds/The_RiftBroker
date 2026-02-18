import { useEffect, useMemo, useState } from 'react'

import {
  aggregateBySystem,
  filterHeatMapData,
  type HeatMapFilters,
} from '../lib/heat-map-data'
import { useListings } from './useListings'

export function useHeatMapData() {
  const { data: listings, isLoading, error } = useListings()
  const [filters, setFilters] = useState<HeatMapFilters>({})
  const [now, setNow] = useState(Date.now())

  // Tick every 60s so freshness/expiry recalculates
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])

  const allSystems = useMemo(
    () => aggregateBySystem(listings ?? [], now),
    [listings, now],
  )

  const filteredSystems = useMemo(
    () => filterHeatMapData(allSystems, filters),
    [allSystems, filters],
  )

  return {
    systems: filteredSystems,
    allSystems,
    isLoading,
    error,
    filters,
    setFilters,
  }
}

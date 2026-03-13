import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { loadGalaxyData } from '../lib/galaxy-data'
import type { GalaxyData } from '../lib/galaxy-data'
import { GALAXY_JSON_URL } from '../lib/constants'

const GalaxyDataContext = createContext<GalaxyData | null>(null)

/**
 * Non-blocking galaxy data loader.
 * The 3D scene shell renders immediately; galaxy data arrives asynchronously.
 * Provides null to consumers while loading — they should handle null gracefully.
 */
export function GalaxyDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<GalaxyData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    loadGalaxyData(GALAXY_JSON_URL, controller.signal)
      .then(setData)
      .catch((e: unknown) => {
        if (controller.signal.aborted) return
        setError(e instanceof Error ? e.message : 'Failed to load galaxy data')
      })
    return () => controller.abort()
  }, [])

  return (
    <GalaxyDataContext.Provider value={data}>
      {error && (
        <div
          className="status-message status-error"
          style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 1000, maxWidth: 400 }}
        >
          Galaxy data unavailable: {error}
        </div>
      )}
      {children}
    </GalaxyDataContext.Provider>
  )
}

/** Returns null while galaxy data is loading, GalaxyData once ready. */
export function useGalaxyData(): GalaxyData | null {
  return useContext(GalaxyDataContext)
}

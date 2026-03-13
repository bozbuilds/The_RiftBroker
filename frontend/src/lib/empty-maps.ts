import type { GalaxySystem } from './galaxy-data'

/** Stable empty fallbacks — prevents `new Map()` allocation on every render. */
export const EMPTY_SYSTEM_MAP: Map<bigint, GalaxySystem> = new Map()
export const EMPTY_REGION_COUNTS: Map<string, number> = new Map()

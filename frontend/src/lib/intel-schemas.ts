import { z } from 'zod'

const resourceSchema = z.object({
  type: z.literal(0),
  systemId: z.string(),
  nearbyBody: z.string(),
  resourceType: z.string(),
  yieldTier: z.enum(['low', 'mid', 'high']),
  notes: z.string().optional(),
})

const fleetSchema = z.object({
  type: z.literal(1),
  systemId: z.string(),
  fleetSize: z.number().int().positive(),
  shipTypes: z.array(z.string()),
  heading: z.string().optional(),
  observedAt: z.string(),
  notes: z.string().optional(),
})

const baseSchema = z.object({
  type: z.literal(2),
  systemId: z.string(),
  structureType: z.string(),
  defenseLevel: z.number().int().min(0).max(10),
  ownerTribe: z.string().optional(),
  notes: z.string().optional(),
})

const routeSchema = z.object({
  type: z.literal(3),
  originSystemId: z.string(),
  destSystemId: z.string(),
  threatLevel: z.number().int().min(0).max(10),
  gateCamps: z.array(z.object({
    systemId: z.string(),
    description: z.string(),
  })),
  notes: z.string().optional(),
})

export const intelPayloadSchema = z.discriminatedUnion('type', [
  resourceSchema,
  fleetSchema,
  baseSchema,
  routeSchema,
])

export type IntelPayload = z.infer<typeof intelPayloadSchema>

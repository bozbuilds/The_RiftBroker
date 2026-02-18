import { z } from 'zod'

const resourceSchema = z.object({
  type: z.literal(0),
  systemId: z.string(),
  coordinates: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  resourceType: z.string(),
  yieldEstimate: z.number(),
})

const fleetSchema = z.object({
  type: z.literal(1),
  systemId: z.string(),
  fleetSize: z.number().int().positive(),
  shipTypes: z.array(z.string()),
  heading: z.string().optional(),
  observedAt: z.string(),
})

const baseSchema = z.object({
  type: z.literal(2),
  systemId: z.string(),
  structureType: z.string(),
  defenseLevel: z.number().int().min(0).max(10),
  ownerTribe: z.string().optional(),
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
})

export const intelPayloadSchema = z.discriminatedUnion('type', [
  resourceSchema,
  fleetSchema,
  baseSchema,
  routeSchema,
])

export type IntelPayload = z.infer<typeof intelPayloadSchema>

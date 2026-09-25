import {
  z,
} from "zod";

const uuidSchema = z.uuid();

const rebuildUserSchema = z.object({
  userId: uuidSchema,
  email: z.email().max(320),
  accountCreatedAt: z.coerce.date(),
  projectionOccurredAt: z.coerce.date(),
});

export const startRebuildBodySchema = z.object({
  rebuildId: uuidSchema,
});

export const rebuildBatchParamsSchema = z.object({
  rebuildId: uuidSchema,
});

export const rebuildBatchBodySchema = z.object({
  users: z.array(rebuildUserSchema).min(1).max(100),
});

export const completeRebuildParamsSchema = rebuildBatchParamsSchema;

export type StartRebuildBody = z.infer<typeof startRebuildBodySchema>;
export type RebuildBatchBody = z.infer<typeof rebuildBatchBodySchema>;
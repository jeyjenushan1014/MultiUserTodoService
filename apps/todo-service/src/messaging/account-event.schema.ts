import {
  z,
} from "zod";

export const accountRegisteredEventSchema =
  z
    .object({
      eventId:
        z.uuid(),

      eventType:
        z.literal(
          "account.registered",
        ),

      eventVersion:
        z.literal(1),

      aggregateType:
        z.literal(
          "account",
        ),

      aggregateId:
        z.uuid(),

      occurredAt:
        z.iso.datetime(),

      requestId:
        z.uuid(),

      producer:
        z.literal(
          "account-service",
        ),

      payload:
        z
          .object({
            userId:
              z.uuid(),
          })
          .loose(),
    })
    .strict()
    .refine(
      (event) =>
        event.aggregateId ===
        event.payload.userId,
      {
        message:
          "Event aggregateId must match payload.userId",

        path: [
          "aggregateId",
        ],
      },
    );

export type AccountRegisteredEvent =
  z.infer<
    typeof accountRegisteredEventSchema
  >;
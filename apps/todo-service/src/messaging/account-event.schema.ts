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

      producer:
        z.literal(
          "account-service",
        ),

      requestId:
        z.uuid(),

      occurredAt:
        z.iso.datetime(),

      payload:
        z
          .object({
            userId:
              z.uuid(),

            email:
              z.email(),
          })
          .strict(),
    })
    .strict();

export type AccountRegisteredEvent =
  z.infer<
    typeof accountRegisteredEventSchema
  >;

export const accountEmailChangedEventSchema =
  z
    .object({
      eventId: z.uuid(),

      eventType: z.literal(
        "account.email-changed",
      ),

      eventVersion: z.literal(1),

      producer: z.literal(
        "account-service",
      ),

      requestId: z.uuid(),

      occurredAt: z.iso.datetime(),

      payload: z
        .object({
          userId: z.uuid(),

          email: z.email(),
        })
        .strict(),
    })
    .strict();

export type AccountEmailChangedEvent =
  z.infer<
    typeof accountEmailChangedEventSchema
  >;
import {
  z,
} from "zod";

export const accountRegisteredEventSchema =
  z.discriminatedUnion("eventVersion", [
    z.object({
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
        z.object({
            userId:
              z.uuid(),

            email:
              z.email(),
          }),
    }),
    z.object({
      eventId: z.uuid(),
      eventType: z.literal("account.registered"),
      eventVersion: z.literal(2),
      producer: z.literal("account-service"),
      requestId: z.uuid(),
      occurredAt: z.iso.datetime(),
      payload: z.object({
        userId: z.uuid(),
        email: z.email(),
        registrationMethod: z.literal("password"),
      }),
    }),
  ]);

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
        }),
      });

export type AccountEmailChangedEvent =
  z.infer<
    typeof accountEmailChangedEventSchema
  >;
import {
  z,
} from "zod";

/*
 * One canonical producer name must be used in
 * contracts, messages, logs and documentation.
 */
export const platformServiceNameSchema =
  z.enum([
    "account-service",
    "todo-service",
    "activity-service",
    "notification-worker",
  ]);

export type PlatformServiceName =
  z.infer<
    typeof platformServiceNameSchema
  >;

/*
 * Common envelope fields shared by every
 * integration event.
 *
 * The payload remains unknown here because each
 * concrete event supplies its own payload schema.
 */
export const platformEventEnvelopeSchema =
  z.object({
    eventId:
      z.uuid(),

    eventType:
      z.string().min(1),

    eventVersion:
      z.int().positive(),

    producer:
      platformServiceNameSchema,

    requestId:
      z.uuid(),

    occurredAt:
      z.iso.datetime({
        offset:
          true,
      }),

    payload:
      z.unknown(),
  });

export type PlatformEventEnvelope =
  z.infer<
    typeof platformEventEnvelopeSchema
  >;
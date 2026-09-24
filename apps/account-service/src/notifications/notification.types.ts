import {
  z,
} from "zod";

export const todoSharedNotificationSchema =
  z.object({
    eventId: z.uuid(),
    eventType: z.literal("todo.shared"),
    eventVersion: z.number().int(),
    requestId: z.uuid(),
    occurredAt: z.string(),
    payload: z.object({
      todoId: z.uuid(),
      ownerId: z.uuid(),
      recipientId: z.uuid(),
      permission: z.literal("state-update"),
      sharedAt: z.string(),
    }),
  });

export const todoShareWithdrawnNotificationSchema =
  z.object({
    eventId: z.uuid(),
    eventType: z.literal("todo.share-withdrawn"),
    eventVersion: z.number().int(),
    requestId: z.uuid(),
    occurredAt: z.string(),
    payload: z.object({
      todoId: z.uuid(),
      ownerId: z.uuid(),
      recipientId: z.uuid(),
      withdrawnAt: z.string(),
    }),
  });

export type TodoSharedNotification =
  z.infer<
    typeof todoSharedNotificationSchema
  >;

export type TodoShareWithdrawnNotification =
  z.infer<
    typeof todoShareWithdrawnNotificationSchema
  >;

export type TodoNotification =
  | TodoSharedNotification
  | TodoShareWithdrawnNotification;
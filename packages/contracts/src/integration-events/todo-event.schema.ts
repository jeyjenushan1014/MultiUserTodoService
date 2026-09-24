import {
  z,
} from "zod";

import {
  platformEventEnvelopeSchema,
} from "./platform-event.schema.js";

export const TODO_EVENT_TYPES = {
  CREATED:
    "todo.created",

  COMPLETED:
    "todo.completed",

  SHARED:
    "todo.shared",

  SHARE_WITHDRAWN:
    "todo.share-withdrawn",

  DELETED:
    "todo.deleted",
} as const;

export const TODO_EVENT_VERSION =
  1 as const;

const todoEventBaseSchema =
  platformEventEnvelopeSchema.extend({
    producer:
      z.literal(
        "todo-service",
      ),

    eventVersion:
      z.literal(
        TODO_EVENT_VERSION,
      ),
  });

export const todoCreatedPayloadSchema =
  z.object({
    todoId:
      z.uuid(),

    ownerId:
      z.uuid(),

    actorUserId:
      z.uuid(),

    title:
      z.string().min(1),
  });

export const todoCreatedEventSchema =
  todoEventBaseSchema.extend({
    eventType:
      z.literal(
        TODO_EVENT_TYPES.CREATED,
      ),

    payload:
      todoCreatedPayloadSchema,
  });

export type TodoCreatedPayload =
  z.infer<
    typeof todoCreatedPayloadSchema
  >;

export type TodoCreatedEvent =
  z.infer<
    typeof todoCreatedEventSchema
  >;

export const todoCompletedPayloadSchema =
  z.object({
    todoId:
      z.uuid(),

    ownerId:
      z.uuid(),

    actorUserId:
      z.uuid(),
  });

export const todoCompletedEventSchema =
  todoEventBaseSchema.extend({
    eventType:
      z.literal(
        TODO_EVENT_TYPES.COMPLETED,
      ),

    payload:
      todoCompletedPayloadSchema,
  });

export type TodoCompletedPayload =
  z.infer<
    typeof todoCompletedPayloadSchema
  >;

export type TodoCompletedEvent =
  z.infer<
    typeof todoCompletedEventSchema
  >;

export const todoSharedPayloadSchema =
  z.object({
    todoId:
      z.uuid(),

    ownerId:
      z.uuid(),

    actorUserId:
      z.uuid(),

    sharedWithUserId:
      z.uuid(),

    title:
      z.string().min(1),
  });

export const todoSharedEventSchema =
  todoEventBaseSchema.extend({
    eventType:
      z.literal(
        TODO_EVENT_TYPES.SHARED,
      ),

    payload:
      todoSharedPayloadSchema,
  });

export type TodoSharedPayload =
  z.infer<
    typeof todoSharedPayloadSchema
  >;

export type TodoSharedEvent =
  z.infer<
    typeof todoSharedEventSchema
  >;

export const todoShareWithdrawnPayloadSchema =
  z.object({
    todoId:
      z.uuid(),

    ownerId:
      z.uuid(),

    actorUserId:
      z.uuid(),

    sharedWithUserId:
      z.uuid(),
  });

export const todoShareWithdrawnEventSchema =
  todoEventBaseSchema.extend({
    eventType:
      z.literal(
        TODO_EVENT_TYPES
          .SHARE_WITHDRAWN,
      ),

    payload:
      todoShareWithdrawnPayloadSchema,
  });

export type TodoShareWithdrawnPayload =
  z.infer<
    typeof todoShareWithdrawnPayloadSchema
  >;

export type TodoShareWithdrawnEvent =
  z.infer<
    typeof todoShareWithdrawnEventSchema
  >;

export const todoDeletedPayloadSchema =
  z.object({
    todoId:
      z.uuid(),

    ownerId:
      z.uuid(),

    actorUserId:
      z.uuid(),

    /*
     * The task no longer exists after deletion.
     * Therefore the event carries every user who
     * was allowed to see it. Activity Service can
     * record visibility without calling TODO Service.
     */
    participantUserIds:
      z.array(
        z.uuid(),
      ),
  });

export const todoDeletedEventSchema =
  todoEventBaseSchema.extend({
    eventType:
      z.literal(
        TODO_EVENT_TYPES.DELETED,
      ),

    payload:
      todoDeletedPayloadSchema,
  });

export type TodoDeletedPayload =
  z.infer<
    typeof todoDeletedPayloadSchema
  >;

export type TodoDeletedEvent =
  z.infer<
    typeof todoDeletedEventSchema
  >;

export const todoIntegrationEventSchema =
  z.discriminatedUnion(
    "eventType",
    [
      todoCreatedEventSchema,
      todoCompletedEventSchema,
      todoSharedEventSchema,
      todoShareWithdrawnEventSchema,
      todoDeletedEventSchema,
    ],
  );

export type TodoIntegrationEvent =
  z.infer<
    typeof todoIntegrationEventSchema
  >;
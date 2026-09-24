import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  TodoResponse,
} from "@todo/contracts";

import type {
  TodoCacheInvalidator,
} from "../../cache/todo.cache.invalidator.interface.js";

import type {
  TodoRepository,
} from "../create.todo.repository.interface.js";

import {
  CreateTodoService,
} from "../create.todo.service.js";

const ownerId =
  "70668eae-dac5-4b75-9bd3-02c963eb5b99";

const idempotencyKey =
  "create-todo-request-001";

const todo:
  TodoResponse = {
    id:
      "9f134ed0-4503-4a23-a189-f065fe9fd838",

    ownerId,

    title:
      "Prepare report",

    description:
      null,

    state:
      "pending",

    dueDate:
      null,

    createdAt:
      "2026-09-24T09:00:00.000Z",

    updatedAt:
      "2026-09-24T09:00:00.000Z",
  };

interface Dependencies {
  readonly createMock:
    ReturnType<
      typeof vi.fn<
        TodoRepository["create"]
      >
    >;

  readonly invalidateOwnerMock:
    ReturnType<
      typeof vi.fn<
        TodoCacheInvalidator[
          "invalidateOwner"
        ]
      >
    >;

  readonly service:
    CreateTodoService;
}

function createDependencies():
Dependencies {
  const createMock =
    vi.fn<
      TodoRepository["create"]
    >();

  const invalidateOwnerMock =
    vi.fn<
      TodoCacheInvalidator[
        "invalidateOwner"
      ]
    >();

  invalidateOwnerMock
    .mockResolvedValue();

  const service =
    new CreateTodoService(
      {
        create:
          createMock,
      },
      {
        invalidateOwner:
          invalidateOwnerMock,
      },
    );

  return {
    createMock,
    invalidateOwnerMock,
    service,
  };
}

describe(
  "CreateTodoService",
  () => {
    it(
      "creates a TODO and invalidates the owner cache",
      async () => {
        const dependencies =
          createDependencies();

        dependencies.createMock
          .mockResolvedValue({
            outcome:
              "created",

            todo,
          });

        const result =
          await dependencies
            .service
            .execute({
              ownerId,
              idempotencyKey,

              request: {
                title:
                  " Prepare report ",

                description:
                  "  ",
              },
            });

        expect(result).toEqual(
          todo,
        );

        expect(
          dependencies
            .invalidateOwnerMock,
        ).toHaveBeenCalledOnce();

        expect(
          dependencies
            .invalidateOwnerMock,
        ).toHaveBeenCalledWith(
          ownerId,
        );

        const firstCall =
          dependencies
            .createMock
            .mock.calls[0];

        expect(
          firstCall,
        ).toBeDefined();

        if (
          firstCall ===
          undefined
        ) {
          throw new Error(
            "Repository create call was not recorded",
          );
        }

        const createData =
          firstCall[0];

        expect(
          createData.idempotencyKey,
        ).toBe(
          idempotencyKey,
        );

        expect(
          createData.title,
        ).toBe(
          "Prepare report",
        );

        expect(
          createData.description,
        ).toBeNull();

        expect(
          createData.requestHash,
        ).toMatch(
          /^[0-9a-f]{64}$/u,
        );

        expect(
          createData.idempotencyExpiresAt
            .getTime(),
        ).toBeGreaterThan(
          createData.occurredAt
            .getTime(),
        );
      },
    );

    it(
      "returns the original TODO without invalidating cache for a replay",
      async () => {
        const dependencies =
          createDependencies();

        dependencies.createMock
          .mockResolvedValue({
            outcome:
              "replayed",

            todo,
          });

        const result =
          await dependencies
            .service
            .execute({
              ownerId,
              idempotencyKey,

              request: {
                title:
                  "Prepare report",
              },
            });

        expect(result).toEqual(
          todo,
        );

        expect(
          dependencies
            .invalidateOwnerMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects reuse of a key with a different request",
      async () => {
        const dependencies =
          createDependencies();

        dependencies.createMock
          .mockResolvedValue({
            outcome:
              "idempotency-key-reused",
          });

        await expect(
          dependencies
            .service
            .execute({
              ownerId,
              idempotencyKey,

              request: {
                title:
                  "Different request",
              },
            }),
        ).rejects.toMatchObject({
          statusCode:
            409,

          code:
            "IDEMPOTENCY_KEY_REUSED",
        });

        expect(
          dependencies
            .invalidateOwnerMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects a duplicate active title",
      async () => {
        const dependencies =
          createDependencies();

        dependencies.createMock
          .mockResolvedValue({
            outcome:
              "duplicate-title",
          });

        await expect(
          dependencies
            .service
            .execute({
              ownerId,
              idempotencyKey,

              request: {
                title:
                  "Prepare report",
              },
            }),
        ).rejects.toMatchObject({
          statusCode:
            409,

          code:
            "TODO_TITLE_ALREADY_EXISTS",
        });
      },
    );

    it(
      "rejects creation while the owner projection is unavailable",
      async () => {
        const dependencies =
          createDependencies();

        dependencies.createMock
          .mockResolvedValue({
            outcome:
              "owner-unavailable",
          });

        await expect(
          dependencies
            .service
            .execute({
              ownerId,
              idempotencyKey,

              request: {
                title:
                  "Prepare report",
              },
            }),
        ).rejects.toMatchObject({
          statusCode:
            503,

          code:
            "OWNER_PROJECTION_NOT_READY",
        });
      },
    );
  },
);
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  TodoRepository,
} from "../todo.repository.interface.js";

import {
  TodoService,
} from "../todo.service.js";

interface Dependencies {
  readonly createMock:
    ReturnType<
      typeof vi.fn<
        TodoRepository[
          "create"
        ]
      >
    >;

  readonly service:
    TodoService;
}

function createDependencies():
Dependencies {
  const createMock =
    vi.fn<
      TodoRepository[
        "create"
      ]
    >();

  const repository:
    TodoRepository = {
      create:
        createMock,
    };

  return {
    createMock,

    service:
      new TodoService(
        repository,
      ),
  };
}

describe(
  "TodoService.create",
  () => {
    it(
      "creates a TODO using default values",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .createMock
          .mockResolvedValue({
            outcome:
              "created",

            todo: {
              id:
                "18437c16-e15d-46fb-91d8-b369a73739ce",

              ownerId:
                "3bf53c86-0932-43d0-85ed-bd536c694677",

              title:
                "Complete Part 5",

              description:
                null,

              state:
                "pending",

              dueDate:
                null,

              createdAt:
                "2026-09-22T12:00:00.000Z",

              updatedAt:
                "2026-09-22T12:00:00.000Z",
            },
          });

        const result =
          await dependencies
            .service
            .create({
              ownerId:
                "3bf53c86-0932-43d0-85ed-bd536c694677",

              request: {
                title:
                  "  Complete Part 5  ",
              },
            });

        expect(result.state)
          .toBe("pending");

        expect(
          dependencies
            .createMock,
        ).toHaveBeenCalledTimes(1);

        const firstCall =
          dependencies
            .createMock
            .mock.calls[0];

        expect(firstCall)
          .toBeDefined();

        expect(
          firstCall?.[0].ownerId,
        ).toBe(
          "3bf53c86-0932-43d0-85ed-bd536c694677",
        );

        expect(
          firstCall?.[0].title,
        ).toBe(
          "Complete Part 5",
        );

        expect(
          firstCall?.[0].description,
        ).toBeNull();

        expect(
          firstCall?.[0].state,
        ).toBe(
          "pending",
        );
      },
    );

    it(
      "returns a conflict for a duplicate title",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .createMock
          .mockResolvedValue({
            outcome:
              "duplicate-title",
          });

        await expect(
          dependencies
            .service
            .create({
              ownerId:
                "3bf53c86-0932-43d0-85ed-bd536c694677",

              request: {
                title:
                  "Existing title",
              },
            }),
        ).rejects.toMatchObject({
          statusCode: 409,

          code:
            "TODO_TITLE_ALREADY_EXISTS",
        });
      },
    );

    it(
      "returns service unavailable when the owner projection is missing",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .createMock
          .mockResolvedValue({
            outcome:
              "owner-unavailable",
          });

        await expect(
          dependencies
            .service
            .create({
              ownerId:
                "3bf53c86-0932-43d0-85ed-bd536c694677",

              request: {
                title:
                  "Complete Part 5",
              },
            }),
        ).rejects.toMatchObject({
          statusCode: 503,

          code:
            "OWNER_PROJECTION_NOT_READY",
        });
      },
    );

    it(
      "propagates unexpected database failures",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .createMock
          .mockRejectedValue(
            new Error(
              "database unavailable",
            ),
          );

        await expect(
          dependencies
            .service
            .create({
              ownerId:
                "3bf53c86-0932-43d0-85ed-bd536c694677",

              request: {
                title:
                  "Complete Part 5",
              },
            }),
        ).rejects.toThrow(
          "database unavailable",
        );
      },
    );
  },
);
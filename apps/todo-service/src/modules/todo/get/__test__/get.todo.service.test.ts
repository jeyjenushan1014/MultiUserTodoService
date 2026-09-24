import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  GetTodoRepository,
} from "../get.todo.repository.interface.js";

import {
  GetTodoService,
} from "../get.todo.service.js";

const OWNER_ID =
  "11111111-1111-4111-8111-111111111111";

const RECIPIENT_ID =
  "22222222-2222-4222-8222-222222222222";

const TODO_ID =
  "33333333-3333-4333-8333-333333333333";

function createDependencies(): {
  readonly findAccessibleByIdMock:
    ReturnType<
      typeof vi.fn<
        GetTodoRepository[
          "findAccessibleById"
        ]
      >
    >;

  readonly repository:
    GetTodoRepository;
} {
  const findAccessibleByIdMock =
    vi.fn<
      GetTodoRepository[
        "findAccessibleById"
      ]
    >();

  return {
    findAccessibleByIdMock,

    repository: {
      findAccessibleById:
        (
          parameters,
        ) =>
          findAccessibleByIdMock(
            parameters,
          ),
    },
  };
}

describe(
  "GetTodoService",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();
      },
    );

    it(
      "returns a TODO shared with the caller",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findAccessibleByIdMock
          .mockResolvedValueOnce({
            id:
              TODO_ID,

            ownerId:
              OWNER_ID,

            title:
              "Shared task",

            description:
              null,

            state:
              "pending",

            dueDate:
              null,

            createdAt:
              "2026-09-24T00:00:00.000Z",

            updatedAt:
              "2026-09-24T00:00:00.000Z",

            accessType:
              "shared",

            owner: {
              id:
                OWNER_ID,

              email:
                "owner@example.com",
            },

            sharedWith: [
              {
                id:
                  RECIPIENT_ID,

                email:
                  "recipient@example.com",
              },
            ],
          });

        const service =
          new GetTodoService(
            dependencies.repository,
          );

        const result =
          await service.execute(
            RECIPIENT_ID,
            TODO_ID,
          );

        expect(
          result.accessType,
        ).toBe("shared");

        expect(
          result.owner.email,
        ).toBe(
          "owner@example.com",
        );

        expect(
          result.sharedWith,
        ).toEqual([
          {
            id:
              RECIPIENT_ID,

            email:
              "recipient@example.com",
          },
        ]);
      },
    );

    it(
      "returns the same not-found error for inaccessible TODOs",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findAccessibleByIdMock
          .mockResolvedValueOnce(
            undefined,
          );

        const service =
          new GetTodoService(
            dependencies.repository,
          );

        await expect(
          service.execute(
            RECIPIENT_ID,
            TODO_ID,
          ),
        ).rejects.toMatchObject({
          statusCode:
            404,

          code:
            "TODO_NOT_FOUND",
        });
      },
    );
  },
);
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  AppError,
} from "@todo/common";

import type {
  ShareTodoRepository,
} from "../share.todo.repository.interface.js";

import {
  ShareTodoService,
} from "../share.todo.service.js";

function createRepositoryFixture(): {
  readonly repository:
    ShareTodoRepository;

  readonly createMock:
    ReturnType<
      typeof vi.fn<
        ShareTodoRepository[
          "create"
        ]
      >
    >;
} {
  const createMock =
    vi.fn<
      ShareTodoRepository[
        "create"
      ]
    >();

  return {
    createMock,

    repository: {
      create:
        (
          data,
        ) =>
          createMock(
            data,
          ),
    },
  };
}

describe(
  "ShareTodoService",
  () => {
    it(
      "creates a state-update share",
      async () => {
        const {
          repository,
          createMock,
        } =
          createRepositoryFixture();

        createMock
          .mockResolvedValueOnce({
            outcome:
              "created",

            share: {
              id:
                "22222222-2222-4222-8222-222222222222",

              todoId:
                "11111111-1111-4111-8111-111111111111",

              ownerId:
                "33333333-3333-4333-8333-333333333333",

              recipientId:
                "44444444-4444-4444-8444-444444444444",

              permission:
                "state-update",

              sharedAt:
                "2026-09-23T17:30:00.000Z",
            },
          });

        const service =
          new ShareTodoService(
            repository,
          );

        const result =
          await service.execute({
            todoId:
              "11111111-1111-4111-8111-111111111111",

            ownerId:
              "33333333-3333-4333-8333-333333333333",

            recipientId:
              "44444444-4444-4444-8444-444444444444",

            requestId:
              "55555555-5555-4555-8555-555555555555",
          });

        expect(
          result.permission,
        ).toBe(
          "state-update",
        );

        expect(
          createMock,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            permission:
              "state-update",
          }),
        );
      },
    );

    it(
      "rejects sharing with the owner",
      async () => {
        const {
          repository,
          createMock,
        } =
          createRepositoryFixture();

        const service =
          new ShareTodoService(
            repository,
          );

        try {
          await service.execute({
            todoId:
              "11111111-1111-4111-8111-111111111111",

            ownerId:
              "33333333-3333-4333-8333-333333333333",

            recipientId:
              "33333333-3333-4333-8333-333333333333",

            requestId:
              "55555555-5555-4555-8555-555555555555",
          });

          throw new Error(
            "Expected self-sharing to fail",
          );
        } catch (error) {
          expect(
            error,
          ).toBeInstanceOf(
            AppError,
          );

          if (
            error instanceof AppError
          ) {
            expect(
              error.code,
            ).toBe(
              "TODO_SELF_SHARE_NOT_ALLOWED",
            );
          }
        }

        expect(
          createMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "returns TODO_NOT_FOUND for missing or cross-owner TODOs",
      async () => {
        const {
          repository,
          createMock,
        } =
          createRepositoryFixture();

        createMock
          .mockResolvedValueOnce({
            outcome:
              "todo-not-found",
          });

        const service =
          new ShareTodoService(
            repository,
          );

        await expect(
          service.execute({
            todoId:
              "11111111-1111-4111-8111-111111111111",

            ownerId:
              "33333333-3333-4333-8333-333333333333",

            recipientId:
              "44444444-4444-4444-8444-444444444444",

            requestId:
              "55555555-5555-4555-8555-555555555555",
          }),
        ).rejects.toMatchObject({
          statusCode:
            404,

          code:
            "TODO_NOT_FOUND",
        });
      },
    );

    it(
      "rejects a duplicate active share",
      async () => {
        const {
          repository,
          createMock,
        } =
          createRepositoryFixture();

        createMock
          .mockResolvedValueOnce({
            outcome:
              "duplicate",
          });

        const service =
          new ShareTodoService(
            repository,
          );

        await expect(
          service.execute({
            todoId:
              "11111111-1111-4111-8111-111111111111",

            ownerId:
              "33333333-3333-4333-8333-333333333333",

            recipientId:
              "44444444-4444-4444-8444-444444444444",

            requestId:
              "55555555-5555-4555-8555-555555555555",
          }),
        ).rejects.toMatchObject({
          statusCode:
            409,

          code:
            "TODO_ALREADY_SHARED",
        });
      },
    );
  },
);
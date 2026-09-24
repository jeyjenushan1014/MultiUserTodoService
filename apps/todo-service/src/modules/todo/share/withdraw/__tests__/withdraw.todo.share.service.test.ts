import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  MockedFunction,
} from "vitest";

import type {
  TodoCacheInvalidator,
} from "../../../cache/todo.cache.invalidator.interface.js";

import type {
  WithdrawTodoShareRepository,
} from "../withdraw.todo.share.repository.interface.js";

import {
  WithdrawTodoShareService,
} from "../withdraw.todo.share.service.js";

interface Dependencies {
  readonly withdrawMock:
    MockedFunction<
      WithdrawTodoShareRepository[
        "withdraw"
      ]
    >;

  readonly invalidateOwnerMock:
    MockedFunction<
      TodoCacheInvalidator[
        "invalidateOwner"
      ]
    >;

  readonly service:
    WithdrawTodoShareService;
}

function createDependencies():
  Dependencies {
  const withdrawMock =
    vi.fn<
      WithdrawTodoShareRepository[
        "withdraw"
      ]
    >();

  const invalidateOwnerMock =
    vi.fn<
      TodoCacheInvalidator[
        "invalidateOwner"
      ]
    >();

  const repository:
    WithdrawTodoShareRepository = {
      withdraw:
        (data) =>
          withdrawMock(
            data,
          ),
    };

  const cacheInvalidator:
    TodoCacheInvalidator = {
      invalidateOwner:
        (ownerId) =>
          invalidateOwnerMock(
            ownerId,
          ),
    };

  return {
    withdrawMock,
    invalidateOwnerMock,

    service:
      new WithdrawTodoShareService(
        repository,
        cacheInvalidator,
      ),
  };
}

const ownerId =
  "70668eae-dac5-4b75-9bd3-02c963eb5b99";

const recipientId =
  "2dced07e-8468-4a4b-9d23-cd96c75fb962";

const todoId =
  "9f134ed0-4503-4a23-a189-f065fe9fd838";

describe(
  "WithdrawTodoShareService",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();
      },
    );

it(
  "withdraws an active share and invalidates the owner cache",
  async () => {
    const dependencies =
      createDependencies();

    dependencies
      .withdrawMock
      .mockResolvedValueOnce({
        status:
          "withdrawn",

        ownerId,
      });

    dependencies
      .invalidateOwnerMock
      .mockResolvedValueOnce();

    await dependencies
      .service
      .execute({
        ownerId,
        recipientId,
        todoId,
      });

    expect(
      dependencies
        .withdrawMock,
    ).toHaveBeenCalledTimes(1);

    const firstCall =
      dependencies
        .withdrawMock
        .mock
        .calls[0];

    expect(
      firstCall,
    ).toBeDefined();

    if (firstCall === undefined) {
      throw new Error(
        "Expected withdraw repository to be called",
      );
    }

    const withdrawData =
      firstCall[0];

    expect(
      withdrawData.ownerId,
    ).toBe(ownerId);

    expect(
      withdrawData.recipientId,
    ).toBe(recipientId);

    expect(
      withdrawData.todoId,
    ).toBe(todoId);

    expect(
      withdrawData.withdrawnAt,
    ).toBeInstanceOf(Date);

    expect(
      Number.isNaN(
        withdrawData
          .withdrawnAt
          .getTime(),
      ),
    ).toBe(false);

    expect(
      dependencies
        .invalidateOwnerMock,
    ).toHaveBeenCalledWith(
      ownerId,
    );
  },
);

    it(
      "returns not found when the share does not exist",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .withdrawMock
          .mockResolvedValueOnce({
            status:
              "not_found",
          });

        await expect(
          dependencies
            .service
            .execute({
              ownerId,
              recipientId,
              todoId,
            }),
        ).rejects.toMatchObject({
          statusCode:
            404,

          code:
            "TODO_SHARE_NOT_FOUND",

          message:
            "TODO share was not found",
        });

        expect(
          dependencies
            .invalidateOwnerMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "does not allow a recipient to withdraw another share",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .withdrawMock
          .mockResolvedValueOnce({
            status:
              "not_found",
          });

        await expect(
          dependencies
            .service
            .execute({
              ownerId:
                recipientId,

              recipientId:
                "ec263520-78e3-4271-bc48-e5fa994685c8",

              todoId,
            }),
        ).rejects.toMatchObject({
          statusCode:
            404,

          code:
            "TODO_SHARE_NOT_FOUND",
        });

        expect(
          dependencies
            .invalidateOwnerMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "treats an already withdrawn share as not found",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .withdrawMock
          .mockResolvedValueOnce({
            status:
              "not_found",
          });

        await expect(
          dependencies
            .service
            .execute({
              ownerId,
              recipientId,
              todoId,
            }),
        ).rejects.toMatchObject({
          statusCode:
            404,

          code:
            "TODO_SHARE_NOT_FOUND",
        });
      },
    );
  },
);
import {
  AppError,
} from "@todo/common";

import type {
  TodoCacheInvalidator,
} from "../../cache/todo.cache.invalidator.interface.js";

import type {
  WithdrawTodoShareRepository,
} from "./withdraw.todo.share.repository.interface.js";

export interface WithdrawTodoShareCommand {
  readonly ownerId:
    string;

  readonly todoId:
    string;

  readonly recipientId:
    string;
}

export class WithdrawTodoShareService {
  public constructor(
    private readonly repository:
      WithdrawTodoShareRepository,

    private readonly cacheInvalidator:
      TodoCacheInvalidator,
  ) {}

  public async execute(
    command:
      WithdrawTodoShareCommand,
  ): Promise<void> {
    const result =
      await this.repository
        .withdraw({
          ownerId:
            command.ownerId,

          todoId:
            command.todoId,

          recipientId:
            command.recipientId,

          withdrawnAt:
            new Date(),
        });

    if (
      result.status ===
      "not_found"
    ) {
      /*
       * This includes:
       *
       * - missing TODO;
       * - caller is not the owner;
       * - missing share;
       * - already-withdrawn share.
       */
      throw new AppError(
        404,
        "TODO_SHARE_NOT_FOUND",
        "TODO share was not found",
      );
    }

    await this.cacheInvalidator
      .invalidateOwner(
        result.ownerId,
      );
  }
}
import {
  randomUUID,
} from "node:crypto";

import type {
  ShareTodoResponse,
} from "@todo/contracts";

import {
  AppError,
} from "@todo/common";

import type {
  ShareTodoRepository,
} from "./share.todo.repository.interface.js";

export interface ShareTodoCommand {
  readonly todoId:
    string;

  readonly ownerId:
    string;

  readonly recipientId:
    string;

  readonly requestId:
    string;
}

export class ShareTodoService {
  public constructor(
    private readonly repository:
      ShareTodoRepository,
  ) {}

  public async execute(
    command:
      ShareTodoCommand,
  ): Promise<
    ShareTodoResponse
  > {
    if (
      command.ownerId ===
      command.recipientId
    ) {
      throw new AppError(
        409,
        "TODO_SELF_SHARE_NOT_ALLOWED",
        "A TODO cannot be shared with its owner",
      );
    }

    const result =
      await this.repository
        .create({
          id:
            randomUUID(),

          todoId:
            command.todoId,

          ownerId:
            command.ownerId,

          recipientId:
            command.recipientId,

          permission:
            "state-update",

          requestId:
            command.requestId,

          sharedAt:
            new Date(),
        });

    if (
      result.outcome ===
      "todo-not-found"
    ) {
      throw new AppError(
        404,
        "TODO_NOT_FOUND",
        "The requested TODO was not found",
      );
    }

    if (
      result.outcome ===
      "duplicate"
    ) {
      throw new AppError(
        409,
        "TODO_ALREADY_SHARED",
        "The TODO is already shared with this account",
      );
    }

    return result.share;
  }
}
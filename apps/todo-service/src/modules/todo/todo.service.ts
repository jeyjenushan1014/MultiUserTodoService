import {
  randomUUID,
} from "node:crypto";

import type {
  CreateTodoRequest,
  CreateTodoResponse,
} from "@todo/contracts";

import {
  AppError,
} from "@todo/common";

import type {
  TodoRepository,
} from "./todo.repository.interface.js";

export interface CreateTodoCommand {
  readonly ownerId: string;

  readonly request:
    CreateTodoRequest;
}

function normalizeDescription(
  description:
    | string
    | null
    | undefined,
): string | null {
  if (
    description === undefined ||
    description === null
  ) {
    return null;
  }

  const normalized =
    description.trim();

  return normalized.length === 0
    ? null
    : normalized;
}

function parseDueDate(
  dueDate:
    | string
    | null
    | undefined,
): Date | null {
  if (
    dueDate === undefined ||
    dueDate === null
  ) {
    return null;
  }

  return new Date(
    dueDate,
  );
}

export class TodoService {
  public constructor(
    private readonly repository:
      TodoRepository,
  ) {}

  public async create(
    command: CreateTodoCommand,
  ): Promise<CreateTodoResponse> {
    const result =
      await this.repository
        .create({
          id:
            randomUUID(),

          ownerId:
            command.ownerId,

          title:
            command.request
              .title
              .trim(),

          description:
            normalizeDescription(
              command.request
                .description,
            ),

          state:
            command.request
              .state ??
            "pending",

          dueDate:
            parseDueDate(
              command.request
                .dueDate,
            ),

          occurredAt:
            new Date(),
        });

    if (
      result.outcome ===
      "duplicate-title"
    ) {
      throw new AppError(
        409,
        "TODO_TITLE_ALREADY_EXISTS",
        "An active TODO with this title already exists",
      );
    }

    if (
      result.outcome ===
      "owner-unavailable"
    ) {
      throw new AppError(
        503,
        "OWNER_PROJECTION_NOT_READY",
        "The account is not yet ready for TODO operations",
      );
    }

    return result.todo;
  }
}
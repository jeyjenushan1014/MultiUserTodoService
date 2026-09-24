import {
  createHash,
  randomUUID,
} from "node:crypto";

import type {
  CreateTodoRequest,
  CreateTodoResponse,
  TodoState
} from "@todo/contracts";

import {
  AppError,
} from "@todo/common";

import type {
  TodoCacheInvalidator,
} from "../cache/todo.cache.invalidator.interface.js";

import type {
  TodoRepository,
} from "./create.todo.repository.interface.js";

const IDEMPOTENCY_RECORD_TTL_MILLISECONDS =
  24 * 60 * 60 * 1_000;

export interface CreateTodoCommand {
  readonly ownerId:
    string;

  readonly idempotencyKey:
    string;

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

interface NormalizedCreateTodo {
  readonly title:
    string;

  readonly description:
    string | null;

  readonly state:
    TodoState;

  readonly dueDate:
    Date | null;
}

function normalizeRequest(
  request:
    CreateTodoRequest,
): NormalizedCreateTodo {
  return {
    title:
      request.title.trim(),

    description:
      normalizeDescription(
        request.description,
      ),

    state:
      request.state ??
      "pending",

    dueDate:
      parseDueDate(
        request.dueDate,
      ),
  };
}

function createRequestHash(
  request:
    NormalizedCreateTodo,
): string {
  const canonicalRequest = {
    title:
      request.title,

    description:
      request.description,

    state:
      request.state,

    dueDate:
      request.dueDate
        ?.toISOString() ??
      null,
  };

  return createHash(
    "sha256",
  )
    .update(
      JSON.stringify(
        canonicalRequest,
      ),
      "utf8",
    )
    .digest("hex");
}

export class CreateTodoService {
  public constructor(
    private readonly repository:
      TodoRepository,

    private readonly cacheInvalidator:
      TodoCacheInvalidator,
  ) {}

  public async execute(
    command:
      CreateTodoCommand,
  ): Promise<
    CreateTodoResponse
  > {
    const normalizedRequest =
      normalizeRequest(
        command.request,
      );

    const occurredAt =
      new Date();

    const result =
      await this.repository
        .create({
          id:
            randomUUID(),

          ownerId:
            command.ownerId,

          idempotencyKey:
            command.idempotencyKey,

          requestHash:
            createRequestHash(
              normalizedRequest,
            ),

          idempotencyExpiresAt:
            new Date(
              occurredAt.getTime() +
                IDEMPOTENCY_RECORD_TTL_MILLISECONDS,
            ),

          title:
            normalizedRequest.title,

          description:
            normalizedRequest
              .description,

          state:
            normalizedRequest.state,

          dueDate:
            normalizedRequest.dueDate,

          occurredAt,
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

    if (
      result.outcome ===
      "idempotency-key-reused"
    ) {
      throw new AppError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "The idempotency key was already used with a different request",
      );
    }

    /*
     * A replay did not modify the TODO database,
     * so it must not create another cache version.
     */
    if (
      result.outcome ===
      "created"
    ) {
      await this.cacheInvalidator
        .invalidateOwner(
          command.ownerId,
        );
    }

    return result.todo;
  }
}
import type {
  TodoResponse,
} from "@todo/contracts";

import type {
  CreateTodoData,
} from "../todo.types.js";

export interface IdempotentCreateTodoData
extends CreateTodoData {
  readonly idempotencyKey:
    string;

  readonly requestHash:
    string;

  readonly idempotencyExpiresAt:
    Date;
}

export type CreateTodoRepositoryResult =
  | {
      readonly outcome:
        "created";

      readonly todo:
        TodoResponse;
    }
  | {
      readonly outcome:
        "replayed";

      readonly todo:
        TodoResponse;
    }
  | {
      readonly outcome:
        "idempotency-key-reused";
    }
  | {
      readonly outcome:
        "duplicate-title";
    }
  | {
      readonly outcome:
        "owner-unavailable";
    };

export interface TodoRepository {
  create(
    data:
      IdempotentCreateTodoData,
  ): Promise<
    CreateTodoRepositoryResult
  >;
}
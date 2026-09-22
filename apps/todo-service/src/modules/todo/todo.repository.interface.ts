import type {
  TodoResponse,
} from "@todo/contracts";

import type {
  CreateTodoData,
} from "./todo.types.js";

export type CreateTodoRepositoryResult =
  | {
      readonly outcome:
        "created";

      readonly todo:
        TodoResponse;
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
    data: CreateTodoData,
  ): Promise<CreateTodoRepositoryResult>;
}
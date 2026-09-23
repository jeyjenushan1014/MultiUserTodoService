import type {
  TodoResponse,
} from "@todo/contracts";

export type UpdateTodoRepositoryResult =
  | {
      readonly status:
        "updated";

      readonly todo:
        TodoResponse;
    }
  | {
      readonly status:
        "not_found";
    }
  | {
      readonly status:
        "duplicate_title";
    };
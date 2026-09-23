import type {
  TodoSharePermission,
  ShareTodoResponse,
} from "@todo/contracts";

export interface CreateTodoShareData {
  readonly id:
    string;

  readonly todoId:
    string;

  readonly ownerId:
    string;

  readonly recipientId:
    string;

  readonly permission:
    TodoSharePermission;

  readonly requestId:
    string;

  readonly sharedAt:
    Date;
}

export type CreateTodoShareResult =
  | {
      readonly outcome:
        "created";

      readonly share:
        ShareTodoResponse;
    }
  | {
      readonly outcome:
        "duplicate";
    }
  | {
      readonly outcome:
        "todo-not-found";
    };

export interface ShareTodoRepository {
  create(
    data:
      CreateTodoShareData,
  ): Promise<
    CreateTodoShareResult
  >;
}
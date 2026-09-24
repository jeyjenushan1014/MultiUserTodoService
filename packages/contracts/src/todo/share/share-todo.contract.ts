export type TodoSharePermission =
  "state-update";

/*
Public Gateway request.

The client knows the recipient's email, not their
internal Account Service UUID.
*/
export interface ShareTodoRequest {
  readonly recipientEmail:
    string;
}

/*
Internal Gateway-to-TODO-Service request.

Account Service has already resolved the email into
the stable account identifier.
*/
export interface CreateTodoShareRequest {
  readonly recipientId:
    string;
}

export interface TodoShare {
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

  readonly sharedAt:
    string;
}

export type ShareTodoResponse =
  TodoShare;
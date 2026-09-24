export interface WithdrawTodoShareData {
  readonly ownerId:
    string;

  readonly todoId:
    string;

  readonly recipientId:
    string;

  readonly requestId:
    string;

  readonly withdrawnAt:
    Date;
}

export type WithdrawTodoShareRepositoryResult =
  | {
      readonly status:
        "withdrawn";

      readonly ownerId:
        string;
    }
  | {
      readonly status:
        "not_found";
    };
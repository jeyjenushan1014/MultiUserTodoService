import type {
  WithdrawTodoShareData,
  WithdrawTodoShareRepositoryResult,
} from "./withdraw.todo.share.types.js";

export interface WithdrawTodoShareRepository {
  withdraw(
    data:
      WithdrawTodoShareData,
  ): Promise<
    WithdrawTodoShareRepositoryResult
  >;
}
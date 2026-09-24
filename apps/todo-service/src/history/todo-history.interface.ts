import type {
  AppendTodoHistoryRequest,
  TodoHistoryRecord,
} from "./todo-history.types.js";

export interface TodoHistoryRepository {
  append(
    request: AppendTodoHistoryRequest,
  ): Promise<boolean>;

  listAccessible(
    todoId: string,
    callerId: string,
  ): Promise<
    readonly TodoHistoryRecord[]
  >;
}
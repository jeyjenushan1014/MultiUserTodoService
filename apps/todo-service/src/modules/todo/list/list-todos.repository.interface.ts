import type {
  ListTodosParameters,
  ListTodosRepositoryResult,
} from "./list-todos.types.js";

export interface ListTodosRepository {
  listTodos(
    parameters:
      ListTodosParameters,
  ): Promise<
    ListTodosRepositoryResult
  >;
}
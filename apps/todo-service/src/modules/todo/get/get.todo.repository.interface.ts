import type {
  TodoResponse,
} from "@todo/contracts";

export interface GetTodoRepository {
  findOwnedTodoById(
    ownerId: string,
    todoId: string,
  ): Promise<
    TodoResponse | undefined
  >;
}
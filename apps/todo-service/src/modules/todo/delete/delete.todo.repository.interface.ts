export interface DeleteTodoRepository {
  softDeleteOwnedTodo(
    ownerId: string,
    todoId: string,
    requestId: string,
  ): Promise<boolean>;
}
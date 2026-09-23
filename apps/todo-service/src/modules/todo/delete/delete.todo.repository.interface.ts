export interface DeleteTodoRepository {
  softDeleteOwnedTodo(
    ownerId: string,
    todoId: string,
  ): Promise<boolean>;
}
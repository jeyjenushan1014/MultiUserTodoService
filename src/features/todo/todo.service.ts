import { AppError } from "../../shared/app-error.js";
import * as todoRepository from "./todo.repository.js";
import type {
  CreateTodoInput,
  ListTodoQuery,
  Todo,
  TodoListResult,
  UpdateTodoInput,
} from "./todo.types.js";

function isDuplicateTodoTitle(
  error: unknown,
): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const databaseError = error as {
    code?: string;
    constraint?: string;
  };

  return (
    databaseError.code === "23505" &&
    databaseError.constraint ===
      "uq_todos_owner_title_active"
  );
}

export async function createTodo(
  ownerId: string,
  input: CreateTodoInput,
): Promise<Todo> {
  try {

    return await todoRepository.createTodo(
      ownerId,
      input,
    );
  } catch (error) {
    if (isDuplicateTodoTitle(error)) {
      throw new AppError(
        409,
        "TODO_TITLE_EXISTS",
        "An active TODO with this title already exists",
      );
    }

    throw error;
  }
}

export async function listTodos(
  ownerId: string,
  query: ListTodoQuery,
): Promise<TodoListResult> {
  const result = await todoRepository.listTodos(
    ownerId,
    query,
  );

  return {
    items: result.items,

    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: result.totalItems,
      totalPages: Math.ceil(
        result.totalItems / query.pageSize,
      ),
    },
  };
}

export async function getTodoById(
  ownerId: string,
  todoId: string,
): Promise<Todo> {
  const todo =
    await todoRepository.findTodoById(
      ownerId,
      todoId,
    );

  if (!todo) {
    throw new AppError(
      404,
      "TODO_NOT_FOUND",
      "TODO item not found",
    );
  }

  return todo;
}

export async function updateTodo(
  ownerId: string,
  todoId: string,
  input: UpdateTodoInput,
): Promise<Todo> {
  try {
    const todo = await todoRepository.updateTodo(
      ownerId,
      todoId,
      input,
    );

    if (!todo) {
      throw new AppError(
        404,
        "TODO_NOT_FOUND",
        "TODO item not found",
      );
    }

    return todo;
  } catch (error) {
    if (isDuplicateTodoTitle(error)) {
      throw new AppError(
        409,
        "TODO_TITLE_EXISTS",
        "An active TODO with this title already exists",
      );
    }

    throw error;
  }
}
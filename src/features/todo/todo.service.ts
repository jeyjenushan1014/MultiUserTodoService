import { AppError } from "../../shared/app-error.js";
import * as todoRepository from "./todo.repository.js";
import type {
  CreateTodoInput,
  Todo,
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
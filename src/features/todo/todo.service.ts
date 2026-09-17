import { AppError } from "../../shared/app-error.js";
import { logger } from "../../config/logger.js";
import * as todoRepository from "./todo.repository.js";
import * as todoCache from "./todo.cache.js";
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

    const todo = await todoRepository.createTodo(
      ownerId,
      input,
    );

    // Invalidate the cache for the user's TODO list after creating a new TODO item.
    await todoCache.invalidateTodoCache(
      ownerId,
    );

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

export async function listTodos(
  ownerId: string,
  query: ListTodoQuery,
): Promise<TodoListResult> {
  const queryIdentifier =
    todoCache.createListQueryIdentifier(query);

  let cacheKey: string | undefined;

  try {
    cacheKey =
      await todoCache.buildTodoListCacheKey(
        ownerId,
        queryIdentifier,
      );

    const cachedResult =
      await todoCache.getCachedValue<TodoListResult>(
        ownerId,
        cacheKey,
      );

    if (cachedResult !== undefined) {
      return cachedResult;
    }
  } catch(error) {
    logger.warn(
      {
        error,
        ownerId,    
      },
      "Todo cache read failed; using database",
    );
  }

  const repositoryResult =
    await todoRepository.listTodos(
      ownerId,
      query,
    );

  const result: TodoListResult = {
    items: repositoryResult.items,

    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems:
        repositoryResult.totalItems,
      totalPages: Math.ceil(
        repositoryResult.totalItems /
          query.pageSize,
      ),
    },
  };

  if (cacheKey !== undefined) {
    await todoCache.setCachedValue(
      ownerId,
      cacheKey,
      result,
    );
  }

  return result;
}


export async function getTodoById(
  ownerId: string,
  todoId: string,
): Promise<Todo> {
  let cacheKey: string | undefined;

  try {
    cacheKey =
      await todoCache.buildTodoItemCacheKey(
        ownerId,
        todoId,
      );

    const cachedTodo =
      await todoCache.getCachedValue<Todo>(
        ownerId,
        cacheKey,
      );

    if (cachedTodo !== undefined) {
      return cachedTodo;
    }
  } catch (error) {
    logger.warn(
      {
        error,
        ownerId,
        todoId,
      },
      "Todo cache read failed; using database",
    );
  }

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

  if (cacheKey !== undefined) {
    await todoCache.setCachedValue(
      ownerId,
      cacheKey,
      todo,
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

    await todoCache.invalidateTodoCache(
      ownerId,
    );

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

export async function deleteTodo(
  ownerId: string,
  todoId: string,
): Promise<void> {
  const deleted =
    await todoRepository.deleteTodo(
      ownerId,
      todoId,
    );

  if (!deleted) {
    throw new AppError(
      404,
      "TODO_NOT_FOUND",
      "TODO item not found",
    );
  }

   await todoCache.invalidateTodoCache(
    ownerId,
  );
}
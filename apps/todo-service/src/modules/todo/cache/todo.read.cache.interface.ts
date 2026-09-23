import type {
  TodoResponse,
} from "@todo/contracts";

import type {
  ListTodosParameters,
  ListTodosRepositoryResult,
} from "../list/list-todos.types.js";

export interface TodoItemCacheLookup {
  readonly cacheKey:
    string;

  readonly value?:
    TodoResponse;
}

export interface TodoListCacheLookup {
  readonly cacheKey:
    string;

  readonly value?:
    ListTodosRepositoryResult;
}

export interface TodoReadCache {
  lookupItem(
    ownerId: string,
    todoId: string,
  ): Promise<
    TodoItemCacheLookup | undefined
  >;

  storeItem(
    cacheKey: string,
    todo: TodoResponse,
  ): Promise<void>;

  lookupList(
    parameters:
      ListTodosParameters,
  ): Promise<
    TodoListCacheLookup | undefined
  >;

  storeList(
    cacheKey: string,
    result:
      ListTodosRepositoryResult,
  ): Promise<void>;
}
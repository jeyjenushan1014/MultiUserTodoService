import type {
  GetTodoResponse,
} from "@todo/contracts";

import type {
  ListTodosParameters,
  ListTodosRepositoryResult,
} from "../list/list-todos.types.js";

export interface TodoItemCacheLookup {
  readonly cacheKey:
    string;

  readonly value?:
    GetTodoResponse;
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
    todo: GetTodoResponse,
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
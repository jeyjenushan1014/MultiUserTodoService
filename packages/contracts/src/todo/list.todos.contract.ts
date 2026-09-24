import type {
  PaginationMetadata,
} from "./todo.types.js";

import type {
  TodoDetails,
} from "./get.todo.contract.js";

import type {
  SortOrder,
  TodoSortField,
  TodoState,
} from "./todo.types.js";

export const TODO_LIST_ACCESS_TYPES = [
  "owned",
  "shared",
  "all",
] as const;

export type TodoListAccessType =
  typeof TODO_LIST_ACCESS_TYPES[number];

export interface ListTodosQuery {
  readonly page:
    number;

  readonly pageSize:
    number;

  readonly state?:
    TodoState;

  readonly access:
    TodoListAccessType;

  readonly sortBy:
    TodoSortField;

  readonly sortOrder:
    SortOrder;
}

export interface ListTodosResponse {
  readonly items:
    readonly TodoDetails[];

  readonly pagination:
    PaginationMetadata;
}
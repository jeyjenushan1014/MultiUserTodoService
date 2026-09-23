import type {
  PaginationMetadata,
  SortOrder,
  TodoResponse,
  TodoSortField,
  TodoState,
} from "./todo.types.js";

export interface ListTodosQuery {
  readonly page: number;

  readonly pageSize: number;

  readonly state?:
    TodoState;

  readonly sortBy:
    TodoSortField;

  readonly sortOrder:
    SortOrder;
}

export interface ListTodosResponse {
  readonly items:
    readonly TodoResponse[];

  readonly pagination:
    PaginationMetadata;
}

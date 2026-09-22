import type {
  SORT_ORDERS,
  TODO_SORT_FIELDS,
  TODO_STATES,
} from "./todo.constants.js";

export type TodoState =
  typeof TODO_STATES[number];

export type TodoSortField =
  typeof TODO_SORT_FIELDS[number];

export type SortOrder =
  typeof SORT_ORDERS[number];

export interface TodoResponse {
  readonly id: string;

  readonly ownerId: string;

  readonly title: string;

  readonly description:
    | string
    | null;

  readonly state: TodoState;

  readonly dueDate:
    | string
    | null;

  readonly createdAt: string;

  readonly updatedAt: string;
}

export interface PaginationMetadata {
  readonly page: number;

  readonly pageSize: number;

  readonly totalItems: number;

  readonly totalPages: number;
}
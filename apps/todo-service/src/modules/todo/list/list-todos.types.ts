import type {
  SortOrder,
  TodoDetails,
  TodoListAccessType,
  TodoSortField,
  TodoState,
} from "@todo/contracts";

export interface ListTodosParameters {
  readonly ownerId:
    string;

  readonly page:
    number;

  readonly pageSize:
    number;

  readonly cursor?:
    string;

  readonly state?:
    TodoState;

  readonly access:
    TodoListAccessType;

  readonly sortBy:
    TodoSortField;

  readonly sortOrder:
    SortOrder;
}

export interface ListTodosRepositoryResult {
  readonly items:
    readonly TodoDetails[];

  readonly totalItems:
    number;

  readonly nextCursor?:
    string;
}
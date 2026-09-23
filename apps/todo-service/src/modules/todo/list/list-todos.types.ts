import type {
  TodoResponse,
  TodoSortField,
  TodoState,
  SortOrder,
} from "@todo/contracts";

export interface ListTodosParameters {
  readonly ownerId: string;
  readonly page: number;
  readonly pageSize: number;
  readonly state?: TodoState;
  readonly sortBy: TodoSortField;
  readonly sortOrder: SortOrder;
}

export interface ListTodosRepositoryResult {
  readonly items:
    readonly TodoResponse[];

  readonly totalItems:
    number;
}


import type {
  TodoResponse,
} from "@todo/contracts";

export interface ListTodosParameters {
  readonly ownerId: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface ListTodosRepositoryResult {
  readonly items:
    readonly TodoResponse[];

  readonly totalItems:
    number;
}
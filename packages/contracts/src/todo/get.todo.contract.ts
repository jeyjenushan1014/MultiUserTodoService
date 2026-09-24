import type {
  TodoResponse,
} from "./todo.types.js";


export type TodoAccessType =
  | "owner"
  | "shared";

export interface TodoAccountReference {
  readonly id:
    string;

  readonly email:
    string;
}

export interface TodoDetails
  extends TodoResponse {
  readonly accessType:
    TodoAccessType;

  readonly owner:
    TodoAccountReference;

  readonly sharedWith:
    readonly TodoAccountReference[];
}

export interface GetTodoParams {
  readonly todoId: string;
}

export type GetTodoResponse =
  TodoDetails;
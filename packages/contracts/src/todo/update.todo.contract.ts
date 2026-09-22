import type {
  TodoResponse,
  TodoState,
} from "./todo.types.js";

export interface UpdateTodoRequest {
  readonly title?: string;

  readonly description?:
    | string
    | null;

  readonly state?:
    TodoState;

  readonly dueDate?:
    | string
    | null;
}

export type UpdateTodoResponse =
  TodoResponse;